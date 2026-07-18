import base64
import binascii
import os
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from Crypto.Cipher import PKCS1_v1_5
from Crypto.PublicKey import RSA
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
WHCIBE_BASE_URL = "https://jw.whcibe.com"
LOGIN_URL = f"{WHCIBE_BASE_URL}/xtgl/login_slogin.html"
PUBKEY_URL = f"{WHCIBE_BASE_URL}/xtgl/login_getPublicKey.html"
SCHEDULE_URL = f"{WHCIBE_BASE_URL}/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151"
REQUEST_TIMEOUT = (8, 20)

app = FastAPI(title="CampusFlow WHCIBE Schedule API", version="2.0.0")

# The production frontend is served from the same origin. These entries only
# keep local development convenient without exposing credentials elsewhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)
    semester: str = Field(pattern=r"^\d{4}-\d{4}-[12]$")


class ParseHTMLRequest(BaseModel):
    html: str = Field(min_length=20)


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
def get_schedule(req: LoginRequest) -> dict:
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


@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
