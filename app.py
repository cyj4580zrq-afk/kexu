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
from typing import Any, Literal
from zoneinfo import ZoneInfo

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
from psycopg import IntegrityError as PostgresIntegrityError
from psycopg import connect as postgres_connect
from psycopg.rows import dict_row
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
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
ACCOUNT_DB_PATH = Path(os.getenv("ACCOUNT_DB_PATH", BASE_DIR / "data" / "accounts.db"))
AUTH_SECRET = os.getenv("AUTH_SECRET", "kexu-local-development-secret-change-me")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
TOKEN_TTL_DAYS = 30
ONLINE_WINDOW_SECONDS = 150
CHINA_TZ = ZoneInfo("Asia/Shanghai")
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


class AdminPasswordChangeRequest(BaseModel):
    new_password: str = Field(min_length=10, max_length=72)


class CloudIdentityRequest(BaseModel):
    student_id: str = Field(pattern=r"^[A-Za-z0-9]{4,40}$")
    real_name: str = Field(min_length=2, max_length=30)
    privacy_consent: bool


class CloudCacheRequest(BaseModel):
    semester: str = Field(pattern=r"^\d{4}-\d{4}-[12]$")
    data: list[dict]


class CloudIdentityDeleteRequest(BaseModel):
    confirmation: bool


class StudentProfileRequest(BaseModel):
    college: str = Field(default="", max_length=80)
    department: str = Field(default="", max_length=80)
    major: str = Field(default="", max_length=80)
    class_name: str = Field(default="", max_length=80)
    entry_grade: str = Field(default="", max_length=20)
    enrollment_status: str = Field(default="", max_length=30)


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


def china_time(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(CHINA_TZ).strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return value


def database_connection() -> Any:
    if DATABASE_URL:
        return postgres_connect(DATABASE_URL, row_factory=dict_row)
    connection = sqlite3.connect(ACCOUNT_DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def execute(connection: Any, statement: str, parameters: tuple = ()) -> Any:
    if DATABASE_URL:
        statement = statement.replace("?", "%s")
    return connection.execute(statement, parameters)


def initialize_account_database() -> None:
    if not DATABASE_URL:
        ACCOUNT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database_connection() as connection:
        id_column = "BIGSERIAL PRIMARY KEY" if DATABASE_URL else "INTEGER PRIMARY KEY AUTOINCREMENT"
        account_column = "TEXT NOT NULL UNIQUE" if DATABASE_URL else "TEXT NOT NULL COLLATE NOCASE UNIQUE"
        execute(connection, f"""
            CREATE TABLE IF NOT EXISTS app_users (
                id {id_column},
                real_name TEXT NOT NULL,
                account {account_column},
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disabled', 'deleted')),
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                privacy_consented_at TEXT NOT NULL
            )
        """)
        execute(connection, "CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status)")
        user_columns = {"student_id": "TEXT", "college": "TEXT", "department": "TEXT", "major": "TEXT", "class_name": "TEXT", "entry_grade": "TEXT", "enrollment_status": "TEXT", "profile_updated_at": "TEXT", "last_seen_at": "TEXT"}
        if DATABASE_URL:
            for column, column_type in user_columns.items():
                execute(connection, f"ALTER TABLE app_users ADD COLUMN IF NOT EXISTS {column} {column_type}")
        else:
            existing_columns = {row["name"] for row in execute(connection, "PRAGMA table_info(app_users)").fetchall()}
            for column, column_type in user_columns.items():
                if column not in existing_columns:
                    execute(connection, f"ALTER TABLE app_users ADD COLUMN {column} {column_type}")
        execute(connection, "CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_student_id ON app_users(student_id)")
        execute(connection, """
            CREATE TABLE IF NOT EXISTS cloud_course_cache (
                user_id INTEGER NOT NULL,
                semester TEXT NOT NULL,
                data_json TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, semester)
            )
        """)
        execute(connection, """
            CREATE TABLE IF NOT EXISTS cloud_grade_cache (
                user_id INTEGER NOT NULL,
                semester TEXT NOT NULL,
                data_json TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, semester)
            )
        """)
        execute(connection, """
            CREATE TABLE IF NOT EXISTS app_admin_config (
                id INTEGER PRIMARY KEY,
                password_hash TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                CHECK (id = 1)
            )
        """)
        existing_admin = execute(
            connection, "SELECT password_hash FROM app_admin_config WHERE id = 1"
        ).fetchone()
        if not existing_admin and ADMIN_PASSWORD:
            execute(
                connection,
                "INSERT INTO app_admin_config (id, password_hash, updated_at) VALUES (1, ?, ?)",
                (PASSWORD_HASHER.hash(ADMIN_PASSWORD), utc_now()),
            )


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


def admin_password_is_acceptable(value: str) -> bool:
    return len(value) >= 10 and password_is_acceptable(value)


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


def public_user(row: Any) -> dict:
    return {
        "id": row["id"],
        "realName": row["real_name"],
        "account": row["account"],
        "studentId": row["student_id"] or row["account"],
        "college": row["college"] or "",
        "department": row["department"] or "",
        "major": row["major"] or "",
        "className": row["class_name"] or "",
        "entryGrade": row["entry_grade"] or "",
        "enrollmentStatus": row["enrollment_status"] or "",
        "profileUpdatedAt": china_time(row["profile_updated_at"]),
        "status": row["status"],
        "createdAt": row["created_at"],
    }


def current_account(authorization: str | None = Header(default=None)) -> Any:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录课序账号")
    user_id = decode_access_token(authorization[7:].strip())
    with database_connection() as connection:
        row = execute(connection, "SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()
    if not row or row["status"] == "deleted":
        raise HTTPException(status_code=401, detail="账号不存在或已注销")
    if row["status"] == "disabled":
        raise HTTPException(status_code=403, detail="账号已被停用")
    with database_connection() as connection:
        execute(connection, "UPDATE app_users SET last_seen_at = ? WHERE id = ?", (utc_now(), user_id))
    return row


def cache_fingerprint(data: list[dict]) -> str:
    encoded = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def load_cloud_cache(user_id: int, semester: str, table: str) -> dict | None:
    with database_connection() as connection:
        row = execute(
            connection,
            f"SELECT data_json, fingerprint, updated_at FROM {table} WHERE user_id = ? AND semester = ?",
            (user_id, semester),
        ).fetchone()
    if not row:
        return None
    try:
        data = json.loads(row["data_json"])
    except (TypeError, json.JSONDecodeError):
        data = []
    return {"semester": semester, "data": data, "fingerprint": row["fingerprint"], "updatedAt": row["updated_at"]}


def save_cloud_cache(user_id: int, request: CloudCacheRequest, table: str) -> dict:
    fingerprint = cache_fingerprint(request.data)
    updated_at = utc_now()
    with database_connection() as connection:
        existing = execute(
            connection,
            f"SELECT fingerprint FROM {table} WHERE user_id = ? AND semester = ?",
            (user_id, request.semester),
        ).fetchone()
        if existing:
            execute(
                connection,
                f"UPDATE {table} SET data_json = ?, fingerprint = ?, updated_at = ? WHERE user_id = ? AND semester = ?",
                (json.dumps(request.data, ensure_ascii=False), fingerprint, updated_at, user_id, request.semester),
            )
        else:
            execute(
                connection,
                f"INSERT INTO {table} (user_id, semester, data_json, fingerprint, updated_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, request.semester, json.dumps(request.data, ensure_ascii=False), fingerprint, updated_at),
            )
    return {"semester": request.semester, "count": len(request.data), "fingerprint": fingerprint, "updatedAt": updated_at}


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
    if not hmac.compare_digest(username, ADMIN_USERNAME):
        raise HTTPException(status_code=401, detail="管理员凭据无效", headers={"WWW-Authenticate": "Basic"})
    with database_connection() as connection:
        row = execute(connection, "SELECT password_hash FROM app_admin_config WHERE id = 1").fetchone()
    password_hash = row["password_hash"] if row else ""
    try:
        valid_password = bool(password_hash) and PASSWORD_HASHER.verify(password_hash, password)
    except (InvalidHashError, VerifyMismatchError):
        valid_password = False
    if not valid_password:
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
            statement = """INSERT INTO app_users
                   (real_name, account, password_hash, status, created_at, privacy_consented_at)
                   VALUES (?, ?, ?, 'active', ?, ?)"""
            if DATABASE_URL:
                statement += " RETURNING id"
            cursor = execute(
                connection,
                statement,
                (clean_real_name(req.real_name), account, password_hash, created_at, created_at),
            )
            user_id = int(cursor.fetchone()["id"] if DATABASE_URL else cursor.lastrowid)
            row = execute(connection, "SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()
    except (sqlite3.IntegrityError, PostgresIntegrityError) as exc:
        raise HTTPException(status_code=409, detail="该课序账号已被注册") from exc
    return {"message": "注册成功", "token": create_access_token(user_id), "user": public_user(row)}


@app.post("/api/auth/login")
def login_account(req: AccountLoginRequest) -> dict:
    with database_connection() as connection:
        row = execute(
            connection,
            "SELECT * FROM app_users WHERE LOWER(account) = LOWER(?)", (req.account.strip(),)
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
            execute(
                connection,
                "UPDATE app_users SET password_hash = ? WHERE id = ?",
                (PASSWORD_HASHER.hash(req.password), row["id"]),
            )
        execute(connection, "UPDATE app_users SET last_login_at = ? WHERE id = ?", (utc_now(), row["id"]))
    return {"message": "登录成功", "token": create_access_token(row["id"]), "user": public_user(row)}


@app.get("/api/auth/me")
def account_profile(user: Any = Depends(current_account)) -> dict:
    return {"user": public_user(user)}


@app.post("/api/cloud/identity", status_code=status.HTTP_201_CREATED)
def create_cloud_identity(req: CloudIdentityRequest) -> dict:
    """Create a cloud identity after the phone has authenticated with the school directly.

    This endpoint deliberately has no school-password field. The app only sends the
    student identifier, the user's chosen name, and the explicit cloud-consent flag.
    """
    if not req.privacy_consent:
        raise HTTPException(status_code=422, detail="请先同意云端同步隐私说明")
    student_id = req.student_id.strip()
    created_at = utc_now()
    with database_connection() as connection:
        row = execute(connection, "SELECT * FROM app_users WHERE student_id = ?", (student_id,)).fetchone()
        if row:
            if row["status"] == "deleted":
                raise HTTPException(status_code=403, detail="该学号对应的云端身份已注销")
            if row["status"] == "disabled":
                raise HTTPException(status_code=403, detail="该云端身份已被停用，请联系反馈群")
            execute(connection, "UPDATE app_users SET real_name = ?, last_login_at = ? WHERE id = ?", (clean_real_name(req.real_name), created_at, row["id"]))
            row = execute(connection, "SELECT * FROM app_users WHERE id = ?", (row["id"],)).fetchone()
            return {"message": "云端身份已恢复", "token": create_access_token(row["id"]), "user": public_user(row)}

        # A random unusable password hash keeps the legacy account schema compatible.
        # It is never returned or used for authentication.
        placeholder_hash = PASSWORD_HASHER.hash(base64url_encode(os.urandom(32)))
        statement = """INSERT INTO app_users
               (real_name, account, password_hash, student_id, status, created_at, last_login_at, privacy_consented_at)
               VALUES (?, ?, ?, ?, 'active', ?, ?, ?)"""
        if DATABASE_URL:
            statement += " RETURNING id"
        try:
            cursor = execute(
                connection,
                statement,
                (clean_real_name(req.real_name), student_id, placeholder_hash, student_id, created_at, created_at, created_at),
            )
            user_id = int(cursor.fetchone()["id"] if DATABASE_URL else cursor.lastrowid)
            row = execute(connection, "SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()
        except (sqlite3.IntegrityError, PostgresIntegrityError) as exc:
            raise HTTPException(status_code=409, detail="该学号的云端身份已存在，请重新进入应用") from exc
    return {"message": "云端身份创建成功", "token": create_access_token(row["id"]), "user": public_user(row)}


@app.get("/api/cloud/courses/{semester}")
def get_cloud_courses(semester: str, user: Any = Depends(current_account)) -> dict:
    if not re.fullmatch(r"\d{4}-\d{4}-[12]", semester):
        raise HTTPException(status_code=422, detail="学期格式无效")
    return {"cache": load_cloud_cache(user["id"], semester, "cloud_course_cache")}


@app.post("/api/cloud/courses")
def put_cloud_courses(req: CloudCacheRequest, user: Any = Depends(current_account)) -> dict:
    return {"cache": save_cloud_cache(user["id"], req, "cloud_course_cache")}


@app.get("/api/cloud/grades/{semester}")
def get_cloud_grades(semester: str, user: Any = Depends(current_account)) -> dict:
    if not re.fullmatch(r"\d{4}-\d{4}-[12]", semester):
        raise HTTPException(status_code=422, detail="学期格式无效")
    return {"cache": load_cloud_cache(user["id"], semester, "cloud_grade_cache")}


@app.post("/api/cloud/grades")
def put_cloud_grades(req: CloudCacheRequest, user: Any = Depends(current_account)) -> dict:
    return {"cache": save_cloud_cache(user["id"], req, "cloud_grade_cache")}


@app.delete("/api/cloud/identity")
def delete_cloud_identity(req: CloudIdentityDeleteRequest, user: Any = Depends(current_account)) -> dict:
    if not req.confirmation:
        raise HTTPException(status_code=422, detail="请确认删除云端身份")
    deleted_marker = f"deleted_{user['id']}_{int(time.time())}"
    with database_connection() as connection:
        execute(connection, "DELETE FROM cloud_course_cache WHERE user_id = ?", (user["id"],))
        execute(connection, "DELETE FROM cloud_grade_cache WHERE user_id = ?", (user["id"],))
        execute(
            connection,
            """UPDATE app_users SET real_name = '已注销用户', account = ?, student_id = NULL,
               password_hash = '', status = 'deleted' WHERE id = ?""",
            (deleted_marker, user["id"]),
        )
    return {"message": "云端身份与云端缓存已删除，本机数据不受影响"}


@app.post("/api/cloud/presence")
def update_cloud_presence(user: Any = Depends(current_account)) -> dict:
    return {"online": True, "seenAt": china_time(utc_now())}


@app.post("/api/cloud/profile")
def update_student_profile(req: StudentProfileRequest, user: Any = Depends(current_account)) -> dict:
    updated_at = utc_now()
    with database_connection() as connection:
        execute(connection, """UPDATE app_users SET college = COALESCE(NULLIF(?, ''), college), department = COALESCE(NULLIF(?, ''), department),
                   major = COALESCE(NULLIF(?, ''), major), class_name = COALESCE(NULLIF(?, ''), class_name),
                   entry_grade = COALESCE(NULLIF(?, ''), entry_grade), enrollment_status = COALESCE(NULLIF(?, ''), enrollment_status),
                   profile_updated_at = ? WHERE id = ?""", (
            req.college.strip(), req.department.strip(), req.major.strip(), req.class_name.strip(), req.entry_grade.strip(), req.enrollment_status.strip(), updated_at, user["id"]
        ))
    return {"message": "个人资料已同步", "updatedAt": china_time(updated_at)}


@app.delete("/api/auth/account")
def delete_account(req: DeleteAccountRequest, user: Any = Depends(current_account)) -> dict:
    try:
        PASSWORD_HASHER.verify(user["password_hash"], req.password)
    except (VerifyMismatchError, InvalidHashError) as exc:
        raise HTTPException(status_code=401, detail="密码错误，无法注销账号") from exc
    deleted_marker = f"deleted_{user['id']}_{int(time.time())}"
    with database_connection() as connection:
        execute(
            connection,
            """UPDATE app_users
               SET real_name = '已注销用户', account = ?, password_hash = '', status = 'deleted'
               WHERE id = ?""",
            (deleted_marker, user["id"]),
        )
    return {"message": "账号已注销，本机课表和成绩不会被删除"}


@app.get("/api/admin/users")
def admin_users(_admin: None = Depends(require_admin)) -> dict:
    with database_connection() as connection:
        rows = execute(
            connection,
            """SELECT id, real_name, account, student_id, college, department, major, class_name, entry_grade, enrollment_status,
               status, created_at, last_login_at, last_seen_at, profile_updated_at FROM app_users ORDER BY id DESC"""
        ).fetchall()
    counts = {"total": len(rows), "active": 0, "disabled": 0, "deleted": 0, "online": 0}
    now = datetime.now(timezone.utc)
    users = []
    for row in rows:
        counts[row["status"]] += 1
        item = dict(row)
        try:
            last_seen = datetime.fromisoformat(str(item.get("last_seen_at") or "").replace("Z", "+00:00"))
            item["online"] = item["status"] == "active" and (now - last_seen).total_seconds() <= ONLINE_WINDOW_SECONDS
        except ValueError:
            item["online"] = False
        for key in ("created_at", "last_login_at", "last_seen_at", "profile_updated_at"):
            item[key] = china_time(item.get(key))
        users.append(item)
        if item["online"]:
            counts["online"] += 1
    return {"counts": counts, "timezone": "Asia/Shanghai", "users": users}


@app.get("/api/admin/session")
def admin_session(_admin: None = Depends(require_admin)) -> dict:
    """Validate an administrator before the heavier user-list query runs."""
    return {"ok": True, "timezone": "Asia/Shanghai"}


@app.post("/api/admin/users/{user_id}/status")
def update_account_status(user_id: int, req: AccountStatusRequest, _admin: None = Depends(require_admin)) -> dict:
    with database_connection() as connection:
        row = execute(connection, "SELECT status FROM app_users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="账号不存在")
        if row["status"] == "deleted":
            raise HTTPException(status_code=409, detail="已注销账号不能恢复")
        execute(connection, "UPDATE app_users SET status = ? WHERE id = ?", (req.status, user_id))
    return {"message": "账号状态已更新", "status": req.status}


@app.post("/api/admin/password")
def update_admin_password(req: AdminPasswordChangeRequest, _admin: None = Depends(require_admin)) -> dict:
    if not admin_password_is_acceptable(req.new_password):
        raise HTTPException(status_code=422, detail="新密码至少 10 位，并同时包含字母和数字")
    with database_connection() as connection:
        execute(
            connection,
            "UPDATE app_admin_config SET password_hash = ?, updated_at = ? WHERE id = 1",
            (PASSWORD_HASHER.hash(req.new_password), utc_now()),
        )
    return {"message": "管理员密码已更新"}


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(_admin: None = Depends(require_admin)) -> str:
    status_text = {"active": "正常", "disabled": "停用", "deleted": "已注销"}
    with database_connection() as connection:
        rows = execute(
            connection,
            "SELECT id, real_name, account, student_id, status, created_at, last_login_at FROM app_users ORDER BY id DESC"
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
            f'<td>{html.escape(row["student_id"] or row["account"])}</td><td><span class="status {row["status"]}">{status_text[row["status"]]}</span></td>'
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
<section class="table"><table><thead><tr><th>ID</th><th>姓名</th><th>学号</th><th>状态</th><th>注册时间</th><th>最后登录</th><th>操作</th></tr></thead><tbody>{''.join(table_rows) or '<tr><td colspan="7">暂无云端身份</td></tr>'}</tbody></table></section>
<small>后台不保存教务密码或会话凭据；云端课表和成绩仅由用户主动同步。</small></main><script>
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
