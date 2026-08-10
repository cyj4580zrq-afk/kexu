import base64
import binascii
import hashlib
import hmac
import html
import json
import os
import re
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import requests
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from bs4 import BeautifulSoup
from Crypto.Cipher import PKCS1_v1_5
from Crypto.PublicKey import RSA
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
WHCIBE_BASE_URL = "https://jw.whcibe.com"
LOGIN_URL = f"{WHCIBE_BASE_URL}/xtgl/login_slogin.html"
PUBKEY_URL = f"{WHCIBE_BASE_URL}/xtgl/login_getPublicKey.html"
SCHEDULE_URL = f"{WHCIBE_BASE_URL}/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151"
GRADE_URL = f"{WHCIBE_BASE_URL}/cjcx/cjcx_cxXsgrcj.html?doType=query&gnmkdm=N305005"
GRADE_REFERER = f"{WHCIBE_BASE_URL}/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005&layout=default"
GRADE_DETAIL_URL = f"{WHCIBE_BASE_URL}/cjcx/cjcx_cxCjxqGjh.html"
REQUEST_TIMEOUT = (8, 20)
LOGIN_WINDOW_SECONDS = 600
LOGIN_ATTEMPT_LIMIT = 8
login_attempts: dict[str, deque[float]] = defaultdict(deque)
login_attempts_lock = threading.Lock()
ACCOUNT_DB_PATH = Path(os.getenv("ACCOUNT_DB_PATH", BASE_DIR / "data" / "accounts.db"))
AUTH_SECRET = os.getenv("AUTH_SECRET", "kexu-local-development-secret-change-me")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
TOKEN_TTL_DAYS = 30
PASSWORD_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

app = FastAPI(title="CampusFlow WHCIBE Schedule API", version="2.0.0")

# The production frontend is served from the same origin. These entries only
# keep local development convenient without exposing credentials elsewhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "https://localhost",
        "capacitor://localhost",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)
    semester: str = Field(pattern=r"^\d{4}-\d{4}-[12]$")


class ParseHTMLRequest(BaseModel):
    html: str = Field(min_length=20)


class RegisterRequest(BaseModel):
    real_name: str = Field(min_length=2, max_length=30)
    account: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{3,23}$")
    password: str = Field(min_length=8, max_length=72)
    privacy_consent: bool


class AccountLoginRequest(BaseModel):
    account: str = Field(min_length=4, max_length=24)
    password: str = Field(min_length=8, max_length=72)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=8, max_length=72)


class AccountStatusRequest(BaseModel):
    status: Literal["active", "disabled"]


def enforce_login_rate_limit(request: Request) -> None:
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    with login_attempts_lock:
        attempts = login_attempts[client_ip]
        while attempts and now - attempts[0] > LOGIN_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= LOGIN_ATTEMPT_LIMIT:
            raise HTTPException(status_code=429, detail="登录请求过于频繁，请十分钟后再试")
        attempts.append(now)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def database_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(ACCOUNT_DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_account_database() -> None:
    ACCOUNT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS app_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                real_name TEXT NOT NULL,
                account TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disabled', 'deleted')),
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                privacy_consented_at TEXT NOT NULL
            )
        """)
        connection.execute("CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status)")


@app.on_event("startup")
def startup() -> None:
    initialize_account_database()


def clean_real_name(value: str) -> str:
    name = re.sub(r"\s+", " ", value.strip())
    if len(name) < 2 or len(name) > 30 or any(ord(char) < 32 for char in name):
        raise HTTPException(status_code=422, detail="姓名需为 2 至 30 个有效字符")
    return name


def password_is_acceptable(value: str) -> bool:
    return bool(re.search(r"[A-Za-z]", value) and re.search(r"\d", value))


def base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "exp": int((datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)).timestamp()),
    }
    encoded = base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = base64url_encode(hmac.new(AUTH_SECRET.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def decode_access_token(token: str) -> int:
    try:
        encoded, signature = token.split(".", 1)
        expected = base64url_encode(hmac.new(AUTH_SECRET.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(base64url_decode(encoded))
        if int(payload["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="登录状态无效或已过期") from exc


def public_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "realName": row["real_name"],
        "account": row["account"],
        "status": row["status"],
        "createdAt": row["created_at"],
    }


def current_account(authorization: str | None = Header(default=None)) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录课序账号")
    user_id = decode_access_token(authorization[7:].strip())
    with database_connection() as connection:
        row = connection.execute("SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()
    if not row or row["status"] == "deleted":
        raise HTTPException(status_code=401, detail="账号不存在或已注销")
    if row["status"] == "disabled":
        raise HTTPException(status_code=403, detail="账号已被停用")
    return row


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="管理员密码尚未配置")
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(status_code=401, detail="需要管理员登录", headers={"WWW-Authenticate": "Basic"})
    try:
        credentials = base64.b64decode(authorization[6:]).decode("utf-8")
        username, password = credentials.split(":", 1)
    except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
        raise HTTPException(status_code=401, detail="管理员凭据无效", headers={"WWW-Authenticate": "Basic"}) from exc
    if not (hmac.compare_digest(username, ADMIN_USERNAME) and hmac.compare_digest(password, ADMIN_PASSWORD)):
        raise HTTPException(status_code=401, detail="管理员凭据无效", headers={"WWW-Authenticate": "Basic"})


def encrypt_password(password: str, modulus_b64: str, exponent_b64: str) -> str:
    mod_bytes = base64.b64decode(modulus_b64)
    exp_bytes = base64.b64decode(exponent_b64)
    modulus = int(binascii.hexlify(mod_bytes), 16)
    exponent = int(binascii.hexlify(exp_bytes), 16)
    public_key = RSA.construct((modulus, exponent))
    cipher = PKCS1_v1_5.new(public_key)
    return base64.b64encode(cipher.encrypt(password.encode("utf-8"))).decode("utf-8")


def semester_params(semester: str) -> tuple[str, str]:
    start_year, _end_year, term = semester.split("-")
    return start_year, "3" if term == "1" else "12"


def normalize_course(item: dict, index: int) -> dict:
    day_map = {
        "1": "周一",
        "2": "周二",
        "3": "周三",
        "4": "周四",
        "5": "周五",
        "6": "周六",
        "7": "周日",
    }


def parse_grade_components(source_html: str) -> list[dict]:
    soup = BeautifulSoup(source_html, "html.parser")
    components: list[dict] = []
    seen: set[str] = set()
    for row in soup.select("tr"):
        cells = [" ".join(cell.get_text(" ", strip=True).split()) for cell in row.select("th, td")]
        if len(cells) < 3:
            continue
        label = re.sub(r"[【】\[\]：:]", "", cells[0]).strip()
        if not re.search(r"平时|期中|期末|实验|作业|课堂|总评|考试", label) or label in seen:
            continue
        weight_match = re.search(r"\d+(?:\.\d+)?\s*%", cells[1])
        components.append({
            "label": label,
            "value": cells[2],
            "weight": weight_match.group(0).replace(" ", "") if weight_match else "",
        })
        seen.add(label)
    return components


def fetch_grade_detail(session: requests.Session, item: dict, xnm: str, xqm: str) -> list[dict]:
    class_id = item.get("jxb_id") or item.get("jxbid")
    if not class_id:
        return []
    data = {
        "jxb_id": class_id,
        "xnm": item.get("xnm") or xnm,
        "xqm": item.get("xqm") or xqm,
        "kcmc": item.get("kcmc") or "",
    }
    if item.get("xh_id"):
        data["xh_id"] = item["xh_id"]
    response = session.post(
        GRADE_DETAIL_URL,
        params={"time": int(time.time() * 1000), "gnmkdm": "N305005"},
        data=data,
        headers={
            "Accept": "text/html, */*; q=0.01",
            "Referer": GRADE_REFERER,
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return parse_grade_components(response.text)


def fetch_all_grades(session: requests.Session, xnm: str, xqm: str) -> list[dict]:
    rows: list[dict] = []
    seen_pages: set[str] = set()
    page = 1
    total: int | None = None
    while page <= 30:
        response = session.post(
            GRADE_URL,
            data={
                "xnm": xnm,
                "xqm": xqm,
                "sfzgcj": "",
                "kcbj": "",
                "_search": "false",
                "nd": str(int(time.time() * 1000)),
                "queryModel.showCount": "50",
                "queryModel.currentPage": str(page),
                "queryModel.sortName": " ",
                "queryModel.sortOrder": "asc",
                "time": "1",
            },
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Referer": GRADE_REFERER,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        page_rows = payload.get("items") or payload.get("rows") or payload.get("data") or []
        if not isinstance(page_rows, list):
            raise HTTPException(status_code=502, detail="教务系统返回了无法识别的成绩数据")
        signature = "|".join(str(item.get("key") or item.get("jxb_id") or item.get("kch") or item) for item in page_rows)
        if signature and signature in seen_pages:
            break
        if signature:
            seen_pages.add(signature)
        rows.extend(page_rows)
        raw_total = payload.get("records") or payload.get("totalCount") or payload.get("total")
        if raw_total is not None:
            try:
                total = int(raw_total)
            except (TypeError, ValueError):
                total = None
        if not page_rows or (total is not None and len(rows) >= total) or len(page_rows) < 50:
            break
        page += 1
    return rows
    sections = re.sub(r"[第节\s]", "", str(item.get("jc") or item.get("jcs") or ""))
    return {
        "id": int(time.time() * 1000) + index,
        "name": item.get("kcmc") or item.get("courseName") or "未知课程",
        "day": day_map.get(str(item.get("xqj") or item.get("weekDay")), "未知"),
        "time": f"第 {sections} 节" if sections else "时间待定",
        "location": item.get("cdmc") or item.get("jxdd") or "未安排地点",
        "teacher": item.get("xm") or item.get("jsxm") or "未知教师",
        "weekRange": item.get("zcd") or item.get("qsjsz") or "未知周次",
        "note": "同步自武汉纺织大学外经贸学院教务系统",
        "source": "whcibe",
    }


def extract_label(text: str, start: str, end_labels: tuple[str, ...]) -> str:
    start_index = text.find(start)
    if start_index < 0:
        return ""
    value = text[start_index + len(start):]
    end_positions = [value.find(label) for label in end_labels if value.find(label) >= 0]
    if end_positions:
        value = value[:min(end_positions)]
    return value.strip(" ：: \n\t")


def parse_schedule_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    courses: list[dict] = []
    day_map = {str(i): f"周{'一二三四五六日'[i - 1]}" for i in range(1, 8)}

    # Current WHCIBE/ZFSoft timetable structure. A cell id looks like "1-3"
    # (Monday, section 3) and may contain multiple timetable_con blocks.
    for cell in soup.select("td[id]"):
        match = re.fullmatch(r"([1-7])-(\d+)", cell.get("id", ""))
        if not match:
            continue
        day_number, first_section = match.groups()
        for block in cell.select(".timetable_con"):
            name_node = block.select_one(".title")
            if not name_node:
                continue
            paragraphs = block.select("p")
            detail_text = " ".join(p.get_text(" ", strip=True) for p in paragraphs)
            section_week = paragraphs[1].get_text(" ", strip=True) if len(paragraphs) > 1 else ""
            location = paragraphs[2].get_text(" ", strip=True) if len(paragraphs) > 2 else ""
            teacher = paragraphs[3].get_text(" ", strip=True) if len(paragraphs) > 3 else ""
            section_match = re.search(r"\(([^)]+节)\)\s*(.+)", section_week)
            section_text = section_match.group(1) if section_match else f"第 {first_section} 节"
            week_range = section_match.group(2) if section_match else extract_label(
                detail_text, "周次：", ("上课地点：", "教师：")
            )
            courses.append({
                "id": int(time.time() * 1000) + len(courses),
                "name": name_node.get_text(" ", strip=True),
                "day": day_map[day_number],
                "time": section_text,
                "location": location or extract_label(detail_text, "上课地点：", ("教师：", "教学班：")) or "未知地点",
                "teacher": teacher or extract_label(detail_text, "教师：", ("教学班：", "选课人数：")) or "未知教师",
                "weekRange": week_range or "未知周次",
                "note": "从教务课表页面解析导入",
                "source": "whcibe",
            })

    if courses:
        return courses

    # Compatibility with older ZFSoft tables.
    table = soup.select_one("#kbtable, .table_xk, #formatKbTable")
    if not table:
        return []
    for day_index, cell in enumerate(table.select("td")):
        for block in cell.select(".kbcontent"):
            parts = [part.strip() for part in block.get_text("\n", strip=True).splitlines() if part.strip()]
            if not parts:
                continue
            courses.append({
                "id": int(time.time() * 1000) + len(courses),
                "name": parts[0],
                "day": day_map.get(str(day_index % 7 + 1), "未知"),
                "time": "见原课表",
                "location": parts[3] if len(parts) > 3 else "未知地点",
                "teacher": parts[1] if len(parts) > 1 else "未知教师",
                "weekRange": parts[2] if len(parts) > 2 else "未知周次",
                "note": "从教务课表页面解析导入",
                "source": "whcibe",
            })
    return courses


def create_school_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Origin": WHCIBE_BASE_URL,
    })
    return session


def login_to_school(session: requests.Session, username: str, password: str) -> None:
    login_page = session.get(LOGIN_URL, timeout=REQUEST_TIMEOUT)
    login_page.raise_for_status()
    soup = BeautifulSoup(login_page.text, "html.parser")
    csrf_input = soup.select_one("#csrftoken")
    if not csrf_input or not csrf_input.get("value"):
        raise HTTPException(status_code=502, detail="教务系统暂时没有返回登录令牌，请稍后重试")

    public_key_response = session.get(
        PUBKEY_URL,
        params={"time": int(time.time() * 1000)},
        headers={"Referer": LOGIN_URL},
        timeout=REQUEST_TIMEOUT,
    )
    public_key_response.raise_for_status()
    public_key = public_key_response.json()
    modulus = public_key.get("modulus")
    exponent = public_key.get("exponent")
    if not modulus or not exponent:
        raise HTTPException(status_code=502, detail="教务系统没有返回密码加密公钥")

    encrypted_password = encrypt_password(password, modulus, exponent)
    login_response = session.post(
        LOGIN_URL,
        params={"time": int(time.time() * 1000)},
        data={
            "csrftoken": csrf_input["value"],
            "yhm": username,
            "mm": encrypted_password,
        },
        headers={"Referer": LOGIN_URL},
        timeout=REQUEST_TIMEOUT,
    )
    login_response.raise_for_status()

    login_soup = BeautifulSoup(login_response.text, "html.parser")
    if login_soup.select_one("#csrftoken") or "login_slogin" in login_response.url:
        tips = login_soup.select_one("#tips")
        detail = tips.get_text(" ", strip=True) if tips else "账号或密码错误，或教务系统要求验证码"
        raise HTTPException(status_code=401, detail=detail)


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_account(req: RegisterRequest) -> dict:
    if not req.privacy_consent:
        raise HTTPException(status_code=422, detail="请先阅读并同意账号隐私说明")
    if not password_is_acceptable(req.password):
        raise HTTPException(status_code=422, detail="密码至少包含一个字母和一个数字")
    account = req.account.strip().lower()
    created_at = utc_now()
    password_hash = PASSWORD_HASHER.hash(req.password)
    try:
        with database_connection() as connection:
            cursor = connection.execute(
                """INSERT INTO app_users
                   (real_name, account, password_hash, status, created_at, privacy_consented_at)
                   VALUES (?, ?, ?, 'active', ?, ?)""",
                (clean_real_name(req.real_name), account, password_hash, created_at, created_at),
            )
            user_id = int(cursor.lastrowid)
            row = connection.execute("SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="该课序账号已被注册") from exc
    return {"message": "注册成功", "token": create_access_token(user_id), "user": public_user(row)}


@app.post("/api/auth/login")
def login_account(req: AccountLoginRequest) -> dict:
    with database_connection() as connection:
        row = connection.execute(
            "SELECT * FROM app_users WHERE account = ? COLLATE NOCASE", (req.account.strip(),)
        ).fetchone()
        if not row or row["status"] == "deleted":
            raise HTTPException(status_code=401, detail="账号或密码错误")
        try:
            PASSWORD_HASHER.verify(row["password_hash"], req.password)
        except (VerifyMismatchError, InvalidHashError) as exc:
            raise HTTPException(status_code=401, detail="账号或密码错误") from exc
        if row["status"] == "disabled":
            raise HTTPException(status_code=403, detail="账号已被停用，请联系反馈群")
        if PASSWORD_HASHER.check_needs_rehash(row["password_hash"]):
            connection.execute(
                "UPDATE app_users SET password_hash = ? WHERE id = ?",
                (PASSWORD_HASHER.hash(req.password), row["id"]),
            )
        connection.execute("UPDATE app_users SET last_login_at = ? WHERE id = ?", (utc_now(), row["id"]))
    return {"message": "登录成功", "token": create_access_token(row["id"]), "user": public_user(row)}


@app.get("/api/auth/me")
def account_profile(user: sqlite3.Row = Depends(current_account)) -> dict:
    return {"user": public_user(user)}


@app.delete("/api/auth/account")
def delete_account(req: DeleteAccountRequest, user: sqlite3.Row = Depends(current_account)) -> dict:
    try:
        PASSWORD_HASHER.verify(user["password_hash"], req.password)
    except (VerifyMismatchError, InvalidHashError) as exc:
        raise HTTPException(status_code=401, detail="密码错误，无法注销账号") from exc
    deleted_marker = f"deleted_{user['id']}_{int(time.time())}"
    with database_connection() as connection:
        connection.execute(
            """UPDATE app_users
               SET real_name = '已注销用户', account = ?, password_hash = '', status = 'deleted'
               WHERE id = ?""",
            (deleted_marker, user["id"]),
        )
    return {"message": "账号已注销，本机课表和成绩不会被删除"}


@app.get("/api/admin/users")
def admin_users(_admin: None = Depends(require_admin)) -> dict:
    with database_connection() as connection:
        rows = connection.execute(
            "SELECT id, real_name, account, status, created_at, last_login_at FROM app_users ORDER BY id DESC"
        ).fetchall()
    counts = {"total": len(rows), "active": 0, "disabled": 0, "deleted": 0}
    for row in rows:
        counts[row["status"]] += 1
    return {"counts": counts, "users": [dict(row) for row in rows]}


@app.post("/api/admin/users/{user_id}/status")
def update_account_status(user_id: int, req: AccountStatusRequest, _admin: None = Depends(require_admin)) -> dict:
    with database_connection() as connection:
        row = connection.execute("SELECT status FROM app_users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="账号不存在")
        if row["status"] == "deleted":
            raise HTTPException(status_code=409, detail="已注销账号不能恢复")
        connection.execute("UPDATE app_users SET status = ? WHERE id = ?", (req.status, user_id))
    return {"message": "账号状态已更新", "status": req.status}


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(_admin: None = Depends(require_admin)) -> str:
    status_text = {"active": "正常", "disabled": "停用", "deleted": "已注销"}
    with database_connection() as connection:
        rows = connection.execute(
            "SELECT id, real_name, account, status, created_at, last_login_at FROM app_users ORDER BY id DESC"
        ).fetchall()
    counts = {"active": 0, "disabled": 0, "deleted": 0}
    for row in rows:
        counts[row["status"]] += 1
    table_rows = []
    for row in rows:
        action = ""
        if row["status"] != "deleted":
            next_status = "disabled" if row["status"] == "active" else "active"
            action_label = "停用" if next_status == "disabled" else "恢复"
            action = f'<button data-id="{row["id"]}" data-status="{next_status}">{action_label}</button>'
        table_rows.append(
            "<tr>"
            f'<td>{row["id"]}</td><td>{html.escape(row["real_name"])}</td>'
            f'<td>{html.escape(row["account"])}</td><td><span class="status {row["status"]}">{status_text[row["status"]]}</span></td>'
            f'<td>{html.escape(row["created_at"])}</td><td>{html.escape(row["last_login_at"] or "尚未登录")}</td><td>{action}</td>'
            "</tr>"
        )
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>课序账号后台</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f5f7fa;color:#172033;font:14px system-ui,-apple-system,sans-serif}}main{{max-width:1180px;margin:auto;padding:36px 20px}}
h1{{margin:0 0 6px;font-size:28px}}p{{margin:0;color:#718096}}.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}}
.card,.table{{border:1px solid #e2e8f0;border-radius:8px;background:white;box-shadow:0 8px 24px #1c35520d}}.card{{padding:18px}}.card strong{{display:block;margin-top:8px;font-size:26px}}
.table{{overflow:auto}}table{{width:100%;border-collapse:collapse;white-space:nowrap}}th,td{{padding:13px 15px;border-bottom:1px solid #edf1f5;text-align:left}}th{{color:#718096;font-size:12px}}
.status{{padding:4px 8px;border-radius:5px}}.active{{background:#e6f7ef;color:#157a51}}.disabled{{background:#fff1e0;color:#ad6112}}.deleted{{background:#edf0f4;color:#687383}}
button{{padding:7px 12px;border:1px solid #dce3eb;border-radius:6px;background:#fff;cursor:pointer}}small{{display:block;margin-top:16px;color:#8a95a4}}@media(max-width:700px){{.cards{{grid-template-columns:1fr 1fr}}}}
</style></head><body><main><h1>课序账号后台</h1><p>姓名为用户自行填写，未经过学校实名核验。</p>
<section class="cards"><div class="card">注册总数<strong>{len(rows)}</strong></div><div class="card">正常<strong>{counts['active']}</strong></div><div class="card">停用<strong>{counts['disabled']}</strong></div><div class="card">已注销<strong>{counts['deleted']}</strong></div></section>
<section class="table"><table><thead><tr><th>ID</th><th>姓名</th><th>账号</th><th>状态</th><th>注册时间</th><th>最后登录</th><th>操作</th></tr></thead><tbody>{''.join(table_rows) or '<tr><td colspan="7">暂无注册账号</td></tr>'}</tbody></table></section>
<small>后台不保存课序明文密码，也不接收教务密码、课表或成绩。</small></main><script>
document.addEventListener('click',async e=>{{const b=e.target.closest('button[data-id]');if(!b)return;if(!confirm('确定修改该账号状态吗？'))return;const r=await fetch(`/api/admin/users/${{b.dataset.id}}/status`,{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{status:b.dataset.status}})}});if(r.ok)location.reload();else alert((await r.json()).detail||'操作失败')}})
</script></body></html>"""


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "school": "武汉纺织大学外经贸学院"}


@app.post("/api/whcibe/parse_html")
def parse_html(req: ParseHTMLRequest) -> dict:
    courses = parse_schedule_html(req.html)
    if not courses:
        raise HTTPException(status_code=400, detail="未在页面中找到可识别的课表数据")
    return {"code": 200, "message": "解析成功", "data": courses}


@app.post("/api/whcibe/schedule")
def get_schedule(req: LoginRequest, request: Request) -> dict:
    enforce_login_rate_limit(request)
    xnm, xqm = semester_params(req.semester)
    session = create_school_session()
    try:
        login_to_school(session, req.username, req.password)
        schedule_response = session.post(
            SCHEDULE_URL,
            data={"xnm": xnm, "xqm": xqm, "kzlx": "ck"},
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Referer": f"{WHCIBE_BASE_URL}/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151",
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=REQUEST_TIMEOUT,
        )
        schedule_response.raise_for_status()
        if "login_slogin" in schedule_response.url or "csrftoken" in schedule_response.text[:5000]:
            raise HTTPException(status_code=401, detail="教务登录状态失效，请重新同步")

        try:
            payload = schedule_response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="教务系统返回了非课表数据，请稍后重试") from exc

        raw_courses = payload.get("kbList") or payload.get("data") or []
        courses = [normalize_course(item, index) for index, item in enumerate(raw_courses)]
        if not courses:
            message = payload.get("message") or payload.get("msg") or "该学期暂未查询到课程"
            return {"code": 200, "message": message, "data": []}
        return {"code": 200, "message": "同步成功", "data": courses}
    except HTTPException:
        raise
    except requests.Timeout as exc:
        raise HTTPException(status_code=504, detail="教务系统响应超时，请稍后重试") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="暂时无法连接教务系统，请稍后重试") from exc
    finally:
        session.close()


@app.post("/api/whcibe/grades")
def get_grades(req: LoginRequest, request: Request) -> dict:
    enforce_login_rate_limit(request)
    xnm, xqm = semester_params(req.semester)
    session = create_school_session()
    try:
        login_to_school(session, req.username, req.password)
        grades = fetch_all_grades(session, xnm, xqm)
        for grade in grades:
            try:
                grade["components"] = fetch_grade_detail(session, grade, xnm, xqm)
            except requests.RequestException:
                grade["components"] = []
        return {"code": 200, "message": "查询成功", "data": grades}
    except HTTPException:
        raise
    except requests.Timeout as exc:
        raise HTTPException(status_code=504, detail="教务系统响应超时，请稍后重试") from exc
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=502, detail="暂时无法读取教务成绩，请稍后重试") from exc
    finally:
        session.close()


WEB_DIR = BASE_DIR / "web-app"
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
else:
    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(BASE_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
