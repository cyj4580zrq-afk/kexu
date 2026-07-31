from pathlib import Path
from shutil import copy2

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
DOCS = ROOT / "docs"
OUTPUT.mkdir(parents=True, exist_ok=True)
DOCS.mkdir(parents=True, exist_ok=True)

VERSION = "1.0.2-stable-end2"
PDF_NAME = f"Kexu-User-Manual-v{VERSION}.pdf"
PDF_PATH = OUTPUT / PDF_NAME
DOCS_PATH = DOCS / PDF_NAME

BLUE = colors.HexColor("#2878F0")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#66758A")
PALE = colors.HexColor("#EEF5FF")
LINE = colors.HexColor("#D8E2F0")
GREEN = colors.HexColor("#16A56A")
AMBER = colors.HexColor("#D98B12")
RED = colors.HexColor("#E24A52")

pdfmetrics.registerFont(TTFont("KexuSans", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("KexuSansBold", r"C:\Windows\Fonts\msyhbd.ttc", subfontIndex=0))


class NumberedDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=17 * mm,
            rightMargin=17 * mm,
            topMargin=17 * mm,
            bottomMargin=16 * mm,
            title=f"课序用户说明书 {VERSION}",
            author="课序",
            subject="课序 Android App 完整上手与功能说明",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="manual", frames=frame, onPage=self._draw_page))

    def _draw_page(self, canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(17 * mm, 12 * mm, 193 * mm, 12 * mm)
        canvas.setFont("KexuSans", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(17 * mm, 7.7 * mm, f"课序用户说明书 · {VERSION}")
        canvas.drawRightString(193 * mm, 7.7 * mm, f"第 {doc.page} 页")
        canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="KTitle", fontName="KexuSansBold", fontSize=30, leading=39, textColor=INK, alignment=TA_LEFT, spaceAfter=5 * mm))
styles.add(ParagraphStyle(name="KSubtitle", fontName="KexuSans", fontSize=12, leading=20, textColor=MUTED, spaceAfter=4 * mm))
styles.add(ParagraphStyle(name="KH1", fontName="KexuSansBold", fontSize=21, leading=28, textColor=INK, spaceBefore=1 * mm, spaceAfter=4 * mm))
styles.add(ParagraphStyle(name="KH2", fontName="KexuSansBold", fontSize=13, leading=19, textColor=INK, spaceBefore=3 * mm, spaceAfter=2 * mm))
styles.add(ParagraphStyle(name="KBody", fontName="KexuSans", fontSize=9.2, leading=15.5, textColor=INK, spaceAfter=2.2 * mm))
styles.add(ParagraphStyle(name="KSmall", fontName="KexuSans", fontSize=7.8, leading=12, textColor=MUTED, spaceAfter=1.5 * mm))
styles.add(ParagraphStyle(name="KStep", fontName="KexuSans", fontSize=9, leading=15, textColor=INK))
styles.add(ParagraphStyle(name="KCaption", fontName="KexuSans", fontSize=7.2, leading=10, textColor=MUTED, alignment=TA_CENTER, spaceBefore=1.5 * mm))
styles.add(ParagraphStyle(name="KTOC", fontName="KexuSans", fontSize=10.2, leading=18, textColor=INK))


def p(text, style="KBody"):
    return Paragraph(text, styles[style])


def heading(number, title, subtitle=None):
    content = [Paragraph(f'<font color="#2878F0">{number}</font>&nbsp;&nbsp;{title}', styles["KH1"])]
    if subtitle:
        content.append(p(subtitle, "KSubtitle"))
    return content


def callout(title, text, tone="blue"):
    palette = {
        "blue": (PALE, BLUE),
        "green": (colors.HexColor("#EAF8F2"), GREEN),
        "amber": (colors.HexColor("#FFF6E5"), AMBER),
        "red": (colors.HexColor("#FFF0F1"), RED),
    }
    bg, accent = palette[tone]
    box = Table(
        [[p(f"<b>{title}</b><br/>{text}", "KBody")]],
        colWidths=[174 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("BOX", (0, 0), (-1, -1), 0.7, accent),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    )
    return [box, Spacer(1, 3 * mm)]


def steps(items):
    rows = []
    for index, item in enumerate(items, 1):
        badge = Table(
            [[p(f'<font color="#FFFFFF"><b>{index}</b></font>', "KStep")]],
            colWidths=[8 * mm],
            rowHeights=[8 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), BLUE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]),
        )
        rows.append([badge, p(item, "KStep")])
    table = Table(rows, colWidths=[11 * mm, 159 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def bullet(items):
    return [p(f'<font color="#2878F0">●</font>&nbsp;&nbsp;{item}', "KBody") for item in items]


def shot(path, caption, width=55 * mm):
    image_path = ROOT / path
    if not image_path.exists():
        return p(f"截图缺失：{image_path.name}", "KSmall")
    image = Image(str(image_path))
    ratio = image.imageHeight / image.imageWidth
    image.drawWidth = width
    image.drawHeight = width * ratio
    return Table(
        [[image], [p(caption, "KCaption")]],
        colWidths=[width],
        rowHeights=[image.drawHeight, None],
        style=TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ]),
    )


def two_shots(left, right, captions, width=55 * mm):
    table = Table(
        [[shot(left, captions[0], width), shot(right, captions[1], width)]],
        colWidths=[86 * mm, 86 * mm],
        hAlign="CENTER",
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


story = []

icon = Image(str(ROOT / "design" / "app-icons" / "05-glass-timetable-1024.png"))
icon.drawWidth = 38 * mm
icon.drawHeight = 38 * mm
story.extend([
    Spacer(1, 17 * mm),
    icon,
    Spacer(1, 11 * mm),
    p('<font color="#2878F0"><b>KEXU · 课序</b></font>', "KSubtitle"),
    p("用户说明书", "KTitle"),
    p("从首次安装、导入课表到成绩查询、换机迁移与目标倒计时，一步一步完成设置。", "KSubtitle"),
    Spacer(1, 9 * mm),
    Table(
        [
            [p("<b>适用版本</b>", "KSmall"), p(VERSION, "KBody")],
            [p("<b>平台</b>", "KSmall"), p("Android", "KBody")],
            [p("<b>文档日期</b>", "KSmall"), p("2026 年 7 月 31 日", "KBody")],
            [p("<b>反馈群</b>", "KSmall"), p("QQ 1075730072", "KBody")],
        ],
        colWidths=[28 * mm, 88 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PALE),
            ("BOX", (0, 0), (-1, -1), 0.8, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    ),
    Spacer(1, 16 * mm),
    p("非官方学生工具 · 无广告 · 数据优先保存在本机", "KSmall"),
    PageBreak(),
])

story.extend(heading("00", "使用前先读", "这三点会直接影响同步、成绩查询和数据安全。"))
story.extend(callout("不是学校官方 App", "课序是面向学生的第三方辅助工具。它只使用你本人可访问的教务系统内容，不代表学校或信息中心。", "amber"))
story.extend(callout("密码不保存", "教务系统密码仅用于当前一次登录请求；课表、成绩、同步快照、倒计时和偏好设置保存在当前设备。", "green"))
story.extend(callout("先做迁移码再卸载", "卸载 App、清除应用数据或更换手机会丢失本地数据。换机前请在“我的 → 数据与关于 → 课表分享码”导出代码。", "red"))
story.append(p("<b>目录</b>", "KH2"))
toc = [
    "01  安装与首次启动", "02  四个底部页面", "03  首次推荐设置", "04  从教务系统导入课表",
    "05  教务系统不可用时导入", "06  首页与今日课程", "07  完整课表的两种视图", "08  课程详情、添加与删除",
    "09  查询与管理成绩", "10  查看平时/考试分项成绩", "11  目标倒计时", "12  通知与提醒",
    "13  同步记录与恢复", "14  分享码换机迁移", "15  外观与液态玻璃", "16  数据、更新与反馈",
    "17  常见问题", "18  隐私边界与快速检查表",
]
story.append(Table(
    [[p("<br/>".join(toc[:9]), "KTOC"), p("<br/>".join(toc[9:]), "KTOC")]],
    colWidths=[87 * mm, 87 * mm],
    style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]),
))
story.append(PageBreak())

story.extend(heading("01", "安装与首次启动", "从 GitHub Release 安装正式版 APK。"))
story.append(steps([
    "进入课序 GitHub 的 <b>Releases</b> 页面，找到 <b>v1.0.2-stable-end2</b>。",
    "下载名称为 <b>Kexu-Android-v1.0.2-stable-end2.apk</b> 的安装包，不要下载 Source code 压缩包。",
    "在手机通知栏或“下载”中打开 APK。若系统拦截，请只为当前浏览器或文件管理器临时允许“安装未知应用”。",
    "安装完成后打开“课序”。首次使用不需要注册账号，也不会出现广告页。",
    "以后升级时直接安装新版 APK，可覆盖旧版本；正常覆盖安装不会清除本地数据。",
]))
story.extend(callout("安装前核对", "应用名称应为“课序”，包名为 com.campusflow.schedule。请只从项目公开 Release 页面下载安装包。", "blue"))
story.append(shot("docs/manual-images/icon-density.png", "应用图标与桌面显示检查", 70 * mm))
story.append(PageBreak())

story.extend(heading("02", "四个底部页面", "底部导航平均分为首页、课表、成绩、我的。"))
story.extend(bullet([
    "<b>首页：</b>查看今天/本周课程、下一节课、当前教学周和置顶倒计时。",
    "<b>课表：</b>以周网格或课程列表查看全部安排，并管理单门课程。",
    "<b>成绩：</b>按学期查询和本地保存成绩，查看教师、学分、绩点及分项。",
    "<b>我的：</b>集中管理课表导入、同步记录、倒计时、通知、外观、数据和关于。",
]))
story.append(two_shots(
    "docs/manual-images/home.png",
    "docs/manual-images/my.png",
    ("首页：当前课程与快捷入口", "我的：功能分组入口"),
    58 * mm,
))
story.extend(callout("返回规则", "二级页面按系统返回键会回到“我的”；在底部一级页面切换时不会重建数据。", "blue"))
story.append(PageBreak())

story.extend(heading("03", "首次推荐设置", "先校准教学周和课时，课表状态才会准确。"))
story.append(steps([
    "进入 <b>我的 → 课表设置</b>。",
    "设置“当前教学周”。应用用它判断本周是否上课，以及课程是否已经结课。",
    "确认“每小节时长”。默认每节 45 分钟，小课间 5 分钟，大课间 20 分钟。",
    "根据需要开启“显示周末”，让完整课表显示周六、周日。",
    "选择首页课程范围为“今天”或“本周”；课程较多时可开启紧凑课程卡片。",
]))
story.append(two_shots(
    "docs/manual-images/course-settings.png",
    "docs/manual-images/semester-wheel.png",
    ("课表设置集中在二级页面", "学期采用年份与学期双轮盘"),
    57 * mm,
))
story.extend(callout("默认上课时间", "1-2 节从 08:15 开始；3-4 节在 20 分钟大课间后开始；5-6 节 13:30；9-10 节 17:45-19:20；11-12 节 19:30-21:05。", "green"))
story.append(PageBreak())

story.extend(heading("04", "从教务系统导入课表", "课表导入和成绩查询彼此独立，互不覆盖。"))
story.append(steps([
    "进入 <b>我的 → 导入课表</b>。",
    "输入武汉纺织大学外经贸学院教务系统的学号和密码。",
    "点击学期选择器，用轮盘选择学年和第一/第二学期；年份支持较长范围，不会堆成长列表。",
    "阅读并勾选隐私说明，然后点击“登录并同步课表”。",
    "等待提示“同步成功”。课程会保存在本机，并自动生成一条同步记录。",
    "返回“课表”检查课程名称、周次、节次、地点和教师。",
]))
story.extend(callout("连接方式", "登录请求由你的设备直接访问 jw.whcibe.com。开发者不接收你的账号、密码、课表或成绩。", "green"))
story.append(two_shots(
    "docs/manual-images/course-semester.png",
    "docs/manual-images/future-semester.png",
    ("课表学期轮盘", "未来学年同样可选"),
    57 * mm,
))
story.append(PageBreak())

story.extend(heading("05", "教务系统不可用时导入", "学校服务器夜间关闭时，可保留已有数据或使用备用方式。"))
story.append(steps([
    "先不要清除应用数据。已同步的课表和成绩仍可离线查看。",
    "若同学已有相同课表，优先让对方生成“课表分享码”，你可立即导入。",
    "若必须从网页导入，可在教务系统可访问时保存完整课表页面源码，再粘贴到“源码导入”。",
    "导入完成后检查课程数量和周次；原课表会先进入同步记录，便于恢复。",
]))
story.extend(callout("不要反复提交密码", "连接失败通常是学校服务器关闭、网络限制或会话失效，不代表密码一定错误。可在白天再次尝试。", "amber"))
story.append(two_shots(
    "docs/manual-images/transfer-empty.png",
    "docs/manual-images/schedule-imported.png",
    ("分享码导入入口", "导入后的课表检查"),
    57 * mm,
))
story.append(PageBreak())

story.extend(heading("06", "首页与今日课程", "首页只保留当下最需要的信息，避免拉得过长。"))
story.extend(bullet([
    "顶部显示日期、问候语、当前周和当天课程数量。",
    "焦点卡片优先展示下一节课或正在进行的课程，包括节次、地点和教师。",
    "“今日安排”按上课时间排序；点击课程可打开详情。",
    "点击“全部课表”进入完整课表二级页面。",
    "设置了倒计时后，最接近的目标会在首页以紧凑卡片显示。",
]))
story.append(two_shots(
    "docs/manual-images/home-countdown.png",
    "docs/manual-images/home.png",
    ("首页置顶目标倒计时", "首页课程信息布局"),
    58 * mm,
))
story.append(PageBreak())

story.extend(heading("07", "完整课表的两种视图", "同一份课程数据可在网格和列表之间切换。"))
story.extend(bullet([
    "<b>周网格：</b>按周一到周日和节次排列，适合快速判断空课与冲突。",
    "<b>课程列表：</b>按星期分组显示名称、节次、地点和上课周，适合阅读完整信息。",
    "顶部左右按钮切换教学周；轮盘可直接跳到指定周或学期。",
    "已结课课程使用明显的状态色和文字提示，不与正在进行的课程混淆。",
    "周末显示可在“我的 → 课表设置”中开关。",
]))
story.append(shot("docs/manual-images/schedule-imported.png", "完整课表：课程卡片、周次和地点", 74 * mm))
story.extend(callout("一眼看全", "课程颜色用于区分课程与状态，不能单独替代文字；结课状态同时显示明确标签。", "blue"))
story.append(PageBreak())

story.extend(heading("08", "课程详情、添加与删除", "手动课程和教务系统课程使用同一套本地课表。"))
story.append(steps([
    "在课表网格或列表中点击任意课程，打开课程详情。",
    "核对课程名称、星期、节次、地点、教师和上课周。",
    "点击右上角“+”可添加课程；填写必填项后保存。",
    "需要调整时，从课程详情进入编辑并修改节次或周次。",
    "删除课程前会再次确认。删除只影响本机，不会修改学校教务系统。",
]))
story.extend(callout("节次时间可调", "“每小节时长”会影响时间换算；课程的星期、起止节次和周次仍由课程自身决定。", "blue"))
story.extend(bullet([
    "建议把临时讲座、自习、实验补课也作为手动课程加入。",
    "同一时间段课程重叠时，请进入详情核对周次，避免把单双周安排误认为冲突。",
]))
story.append(PageBreak())

story.extend(heading("09", "查询与管理成绩", "每次只查询一个学期，查过的学期保存在本机。"))
story.append(steps([
    "进入底部 <b>成绩</b>，点击右上角下载/查询按钮。",
    "输入教务系统学号和密码。",
    "用学期轮盘选择要查询的学期，然后点击“查询并保存本学期成绩”。",
    "查询完成后，该学期会出现在“全部”旁边。再次选择已保存学期时优先展示本地数据，不重复追加。",
    "顶部统计会根据当前筛选计算平均成绩、课程数量和累计学分。",
    "要重新查询某学期，先选中该学期，再点垃圾桶删除整个学期，之后重新查询。",
]))
story.append(two_shots(
    "docs/manual-images/grade-semester.png",
    "docs/manual-images/grade-future-semester.png",
    ("成绩查询学期轮盘", "较远学年仍可直接选择"),
    57 * mm,
))
story.extend(callout("删除范围", "成绩删除以“整个学期”为单位，不提供逐门删除，避免本地统计与教务系统记录不一致。", "amber"))
story.append(PageBreak())

story.extend(heading("10", "查看平时与考试分项", "是否能显示取决于学校是否开放该课程明细。"))
story.append(steps([
    "在成绩列表点击一门课程。",
    "详情页先展示总评、绩点、学分、任课教师和考试性质。",
    "若该课程带有教务系统明细标识，应用会请求成绩详情。",
    "学校已开放时，会显示“平时成绩、期末成绩、总评”等项目，以及各自比例和分数。",
    "学校未开放时，只显示总评并提示“暂未提供分项成绩”；这不是本地数据丢失。",
]))
story.extend(callout("为什么有些课程只有总评", "不同课程、教师和学期开放明细的时间不同。应用不能推算或伪造平时成绩，也不会绕过学校权限。", "amber"))
story.extend(bullet([
    "分项成绩在成功读取后会跟随该课程保存在本机。",
    "网络请求失败不会删除已保存的总评和教师信息。",
]))
story.append(PageBreak())

story.extend(heading("11", "目标倒计时", "适用于考研、CET-4/6、期末考试和任意自定义目标。"))
story.append(steps([
    "进入 <b>我的 → 目标倒计时</b>，点击右上角“+”。",
    "选择“考研、CET-4、CET-6”模板，或选择“自定义”。",
    "填写目标名称、目标日期和一句话备注，再选择强调色。",
    "保存后，倒计时按日期远近排序，最近目标自动成为首页焦点。",
    "点击已有目标可编辑；点击右侧删除按钮可移除。",
    "目标日期到达后显示“就是今天”，超过日期后显示“已过去”。",
]))
story.append(two_shots(
    "docs/manual-images/countdown-list.png",
    "docs/manual-images/countdown-editor.png",
    ("倒计时列表与最近目标", "模板、自定义日期和颜色"),
    58 * mm,
))
story.extend(callout("日期提醒", "CET 和考研日期每年可能变化，请以教育考试院或学校正式通知为准。模板只填写名称，不替你猜测考试日期。", "red"))
story.append(PageBreak())

story.extend(heading("12", "通知与提醒", "提醒功能只为未来课程创建本地通知。"))
story.append(steps([
    "进入 <b>我的 → 通知与提醒</b>。",
    "设置学期开始日期，用于把“第几周、星期几”换算成具体日期。",
    "选择提前提醒时间，例如 10 分钟或 20 分钟。",
    "开启上课提醒并授予系统通知权限。",
    "应用会为未来课程创建本地通知，通常限制在未来约 45 天以控制数量。",
    "课表变化后重新进入提醒设置并刷新，以免旧提醒与新课表不一致。",
]))
story.extend(callout("提醒不依赖后台账号", "提醒由手机本地安排，不需要开发者服务器；省电策略或系统权限可能影响准时性。", "green"))
story.append(PageBreak())

story.extend(heading("13", "同步记录与恢复", "每次成功导入都会保留快照，学校服务器关闭时仍可恢复。"))
story.append(steps([
    "进入 <b>我的 → 同步记录</b>。",
    "记录按时间倒序显示来源、学期、课程数量和同步时间。",
    "点击“恢复”前先核对学期和课程数。",
    "确认后，当前课表会替换为该次快照。",
    "恢复只发生在本机，不会向学校提交任何修改。",
]))
story.append(two_shots(
    "docs/manual-images/sync-history.png",
    "docs/manual-images/transfer-ready.png",
    ("同步记录返回“我的”上一级", "本地课表可生成分享码"),
    57 * mm,
))
story.extend(callout("快照上限", "应用会限制历史记录数量，重要课表建议额外生成分享码并保存在自己的安全位置。", "amber"))
story.append(PageBreak())

story.extend(heading("14", "分享码换机迁移", "不依赖文件和后台服务器，一串代码即可传递课表。"))
story.append(steps([
    "旧手机进入 <b>我的 → 数据与关于 → 课表分享码</b>。",
    "点击生成代码。代码以 <b>KEXU1</b> 开头，只包含课程、学期和课时设置。",
    "通过聊天工具把完整代码发送给另一台手机，不要截断或自行修改。",
    "新手机打开同一页面，粘贴代码并点击解析。",
    "核对课程数量和学期后确认导入。新手机原课表会先保存进同步记录。",
]))
story.append(two_shots(
    "docs/manual-images/transfer-code.png",
    "docs/manual-images/schedule-imported.png",
    ("生成可复制的 KEXU1 代码", "另一台手机解析并导入"),
    57 * mm,
))
story.extend(callout("代码不包含", "分享码不包含学号、教务密码或成绩。它仍包含你的课程、教师和教室信息，请只发给可信任的人。", "green"))
story.append(PageBreak())

story.extend(heading("15", "外观与液态玻璃", "视觉选项可以按性能和偏好自由组合。"))
story.extend(bullet([
    "主题模式：自动、浅色、深色。",
    "强调色：蓝、紫、绿、橙等。",
    "紧凑课程卡片：在一屏内显示更多课程。",
    "全局液态玻璃：为模块和按钮应用半透明、模糊和高光。",
    "底部导航玻璃：仅让底部导航使用玻璃质感。",
    "全透明底部玻璃：背景更透明，仅保留模糊与边缘高光。",
    "下拉回弹与触感反馈：按个人习惯开关。",
]))
story.append(two_shots(
    "docs/manual-images/appearance.png",
    "docs/manual-images/countdown-dark.png",
    ("外观设置分组", "深色模式下的倒计时"),
    58 * mm,
))
story.extend(callout("卡顿时怎么选", "低端设备可关闭全局液态玻璃和全透明底部玻璃；数据与功能不会受影响。", "blue"))
story.append(PageBreak())

story.extend(heading("16", "数据、更新与反馈", "数据操作集中在“我的”二级页面。"))
story.append(steps([
    "进入 <b>我的 → 数据与关于</b> 查看数据工具、隐私说明和版本信息。",
    "点击“检查更新”，应用会读取 GitHub 最新公开 Release；发现新版本时弹出更新提示。",
    "下载新版 APK 后覆盖安装，不需要先卸载旧版。",
    "遇到问题时加入 QQ 反馈群 <b>1075730072</b>，说明版本号、手机型号、问题步骤并附截图。",
    "执行“恢复默认设置”只应在明确了解影响后进行；清除数据前先生成课表分享码。",
]))
story.append(shot("docs/manual-images/data-about.png", "数据与关于：迁移、更新、隐私和反馈", 70 * mm))
story.extend(callout("更新来源", "课序不在应用内静默安装更新。系统安装确认页仍会出现，这是 Android 的安全机制。", "amber"))
story.append(PageBreak())

story.extend(heading("17", "常见问题", "先按现象排查，再决定是否删除或重查数据。"))
faq = [
    ("教务系统连不上", "确认手机网络可访问 jw.whcibe.com；学校服务器可能在夜间关闭。保留本地课表，白天重试。"),
    ("成绩数量不对", "确认查询的是正确学期。若本地曾保存异常结果，选中该学期后整学期删除，再重新查询。"),
    ("只有总评，没有平时/期末", "学校尚未对该课程开放分项，或详情请求失败。应用会保留总评和教师，不会虚构分项。"),
    ("课程显示已结课", "检查“我的 → 课表设置 → 当前教学周”和该课程的上课周范围。"),
    ("更新后数据不见了", "正常覆盖安装不清数据；卸载、清除应用数据或系统迁移失败会删除本地记录。尝试用分享码或同步记录恢复。"),
    ("提醒没有出现", "检查通知权限、省电限制、学期开始日期和提前时间；课表更新后重新安排提醒。"),
    ("界面模糊或卡顿", "关闭全局液态玻璃、全透明底部玻璃和下拉回弹；重启应用。"),
    ("分享码解析失败", "确认代码从 KEXU1 开始且完整复制，没有换行丢失或被聊天软件截断。"),
]
story.append(Table(
    [[p(f"<b>{question}</b>", "KBody"), p(answer, "KBody")] for question, answer in faq],
    colWidths=[43 * mm, 131 * mm],
    style=TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("BACKGROUND", (0, 0), (0, -1), PALE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]),
))
story.append(PageBreak())

story.extend(heading("18", "隐私边界与快速检查表", "完成下面的检查后，日常使用基本不需要重复配置。"))
story.extend(callout("隐私边界", "课序只处理当前账号本人可查看的数据；不保存教务密码，不建立开发者账号库，不批量抓取，不绕过验证码或访问控制。请遵守学校教务系统使用规定。", "green"))
story.append(p("<b>首次使用检查表</b>", "KH2"))
story.extend(bullet([
    "□ 已从官方 GitHub Release 安装正确版本",
    "□ 已设置当前教学周和课时长度",
    "□ 已导入并核对课表课程数、周次和地点",
    "□ 已按需要查询指定学期成绩",
    "□ 已设置学期开始日期和通知权限",
    "□ 已创建考研、CET 或自定义倒计时",
    "□ 已生成一次课表分享码作为换机备份",
    "□ 已记住反馈群 QQ 1075730072",
]))
story.append(Spacer(1, 6 * mm))
story.append(p("<b>日常建议</b>", "KH2"))
story.extend(bullet([
    "每学期开学先校准教学周，再同步课表。",
    "课表变化后重新同步，并检查通知。",
    "成绩按学期查询一次即可，优先离线查看。",
    "换机、卸载或清除数据前，先导出分享码。",
]))
story.append(Spacer(1, 12 * mm))
story.append(p('<font color="#2878F0"><b>课序 · 把课程、成绩和目标收进一处。</b></font>', "KSubtitle"))
story.append(p("说明书结束", "KSmall"))

doc = NumberedDocTemplate(str(PDF_PATH))
doc.build(story)
copy2(PDF_PATH, DOCS_PATH)
print(PDF_PATH)
print(DOCS_PATH)
