from pathlib import Path

import fitz
import pdfplumber
from PIL import Image, ImageDraw
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "output" / "pdf" / "Kexu-User-Manual-v1.0.2-stable-end2.pdf"
RENDER_DIR = ROOT / "output" / "manual-test-images" / "v1.0.2-stable-end2"
RENDER_DIR.mkdir(parents=True, exist_ok=True)

document = fitz.open(PDF)
rendered = []
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.35, 1.35), alpha=False)
    output = RENDER_DIR / f"page-{index + 1:02d}.png"
    pixmap.save(output)
    rendered.append(output)

thumb_width = 340
thumb_height = 481
margin = 18
label_height = 28
for sheet_index in range(0, len(rendered), 6):
    batch = rendered[sheet_index:sheet_index + 6]
    canvas = Image.new("RGB", (margin * 4 + thumb_width * 3, margin * 3 + (thumb_height + label_height) * 2), "white")
    draw = ImageDraw.Draw(canvas)
    for local_index, path in enumerate(batch):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_width, thumb_height))
        column = local_index % 3
        row = local_index // 3
        x = margin + column * (thumb_width + margin)
        y = margin + row * (thumb_height + label_height + margin)
        canvas.paste(image, (x + (thumb_width - image.width) // 2, y))
        draw.text((x + 4, y + thumb_height + 4), f"Page {sheet_index + local_index + 1}", fill="#172033")
    contact = RENDER_DIR / f"contact-{sheet_index // 6 + 1:02d}.png"
    canvas.save(contact, quality=92)

reader = PdfReader(PDF)
assert len(reader.pages) == len(rendered)
assert len(reader.pages) >= 18

with pdfplumber.open(PDF) as pdf:
    text = "\n".join((page.extract_text() or "") for page in pdf.pages)

required = [
    "安装与首次启动",
    "从教务系统导入课表",
    "查询与管理成绩",
    "目标倒计时",
    "分享码换机迁移",
    "常见问题",
    "1075730072",
]
missing = [item for item in required if item not in text]
assert not missing, f"PDF 缺少关键内容：{missing}"

print(f"pages={len(reader.pages)}")
print(f"render_dir={RENDER_DIR}")
print(f"text_chars={len(text)}")
