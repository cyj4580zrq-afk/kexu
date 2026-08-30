const { createApp } = Vue;

const SCHOOL_PUBLIC_BASE = "http://jw.whcibe.com";
const SCHOOL_HTTPS_BASE = "https://jw.whcibe.com";
const SCHOOL_INTRANET_BASE = "http://10.1.4.138";
const SCHOOL_LOGIN_PATH = "/xtgl/login_slogin.html";
const SCHOOL_PUBKEY_PATH = "/xtgl/login_getPublicKey.html";
const SCHOOL_SCHEDULE_PATH = "/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151";
const SCHOOL_SCHEDULE_REFERER_PATH = "/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151";
const SCHOOL_GRADE_PATH = "/cjcx/cjcx_cxXsgrcj.html?doType=query";
const SCHOOL_GRADE_REFERER_PATH = "/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005";
const SCHOOL_GRADE_DETAIL_PATH = "/cjcx/cjcx_cxCjxqGjh.html";
// Temporary Aliyun endpoint while the production HTTPS domain is being configured.
const ACCOUNT_API_BASE = localStorage.getItem("kexu-account-api-base") || "http://47.122.105.185";
const APP_VERSION = "2.5.0-stable";
const STORAGE = {
  courses: "campusflow-courses",
  history: "campusflow-sync-history",
  grades: "campusflow-grades",
  gradeHistory: "campusflow-grade-history",
  currentWeek: "campusflow-current-week",
  selectedWeek: "campusflow-selected-week",
  theme: "campusflow-theme",
  themeMode: "campusflow-theme-mode",
  accent: "campusflow-accent",
  homeScope: "campusflow-home-scope",
  showWeekends: "campusflow-show-weekends",
  compactCards: "campusflow-compact-cards",
  bounceEnabled: "campusflow-bounce-enabled",
  liquidGlassEnabled: "campusflow-liquid-glass-enabled",
  bottomNavGlassEnabled: "campusflow-bottom-nav-glass-enabled",
  bottomNavClearGlassEnabled: "campusflow-bottom-nav-clear-glass-enabled",
  hapticsEnabled: "campusflow-haptics-enabled",
  scheduleView: "campusflow-schedule-view",
  periodDuration: "campusflow-period-duration",
  reminderEnabled: "campusflow-reminder-enabled",
  reminderMinutes: "campusflow-reminder-minutes",
  semesterStartDate: "campusflow-semester-start-date",
  countdowns: "campusflow-countdowns",
  dailyQuote: "campusflow-daily-quote",
  accountToken: "kexu-account-token",
  accountUser: "kexu-account-user",
  username: "campusflow-school-username",
  semester: "campusflow-school-semester",
  privacyConsent: "campusflow-privacy-consent",
  schoolBase: "campusflow-school-base"
};

const WEEK_DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DEFAULT_PERIOD_DURATION = 45;
const SHORT_BREAK_MINUTES = 5;
const LONG_BREAK_MINUTES = 20;
const EVENING_BREAK_MINUTES = 10;
const COURSE_PALETTES = [
  ["#eaf3ff", "#2274d9", "#8fc3ff"],
  ["#eaf8f2", "#14775a", "#7fd5b7"],
  ["#fff2e8", "#b75c20", "#ffc18f"],
  ["#f1edff", "#6848bd", "#bca9ff"],
  ["#e9f7fa", "#19758a", "#85d2df"],
  ["#fff0f3", "#b84665", "#f3a4b8"]
];

const LOCAL_DAILY_QUOTES = [
  "今天的努力，会在未来悄悄开花。",
  "慢一点也没关系，只要一直向前。",
  "把今天过好，就是最踏实的进步。",
  "你走的每一步，都算数。",
  "认真生活，也认真成为自己。",
  "再坚持一下，答案正在路上。",
  "允许普通，但别放弃成长。",
  "去做具体的事，去爱具体的生活。"
];

const AppIcon = {
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 20 }
  },
  template: '<span class="app-icon" :style="{ width: size + \'px\', height: size + \'px\' }"></span>',
  mounted() { this.draw(); },
  updated() { this.draw(); },
  methods: {
    draw() {
      const icon = window.lucide && window.lucide.icons && window.lucide.icons[this.name];
      if (!icon) return;
      this.$el.replaceChildren(window.lucide.createElement(icon, {
        width: this.size,
        height: this.size,
        "aria-hidden": "true"
      }));
    }
  }
};

function calculateCurrentWeekFromStartDate(startDateStr, fallbackWeek = 1) {
  if (!startDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDateStr))) return fallbackWeek;
  const [y, m, d] = startDateStr.split("-").map(Number);
  const termDate = new Date(y, m - 1, d);
  if (Number.isNaN(termDate.getTime())) return fallbackWeek;
  const termWeekday = termDate.getDay() || 7;
  const termMonday = new Date(termDate.getFullYear(), termDate.getMonth(), termDate.getDate() - termWeekday + 1);
  termMonday.setHours(0, 0, 0, 0);

  const today = new Date();
  const todayWeekday = today.getDay() || 7;
  const todayMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayWeekday + 1);
  todayMonday.setHours(0, 0, 0, 0);

  const diffDays = Math.round((todayMonday.getTime() - termMonday.getTime()) / (1000 * 60 * 60 * 24));
  const calculatedWeek = Math.floor(diffDays / 7) + 1;
  return Math.min(30, Math.max(1, calculatedWeek));
}

function defaultSemester() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return `${year}-${year + 1}-1`;
  return `${year - 1}-${year}-2`;
}

function currentAcademicYearStart(date = new Date()) {
  const year = date.getFullYear();
  return date.getMonth() + 1 >= 8 ? year : year - 1;
}

function clockToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToClock(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildSectionTimes(duration) {
  const times = [];
  const addPair = (firstSection, startMinutes) => {
    const firstEnd = startMinutes + duration;
    const secondStart = firstEnd + SHORT_BREAK_MINUTES;
    const secondEnd = secondStart + duration;
    times.push(
      { section: firstSection, start: minutesToClock(startMinutes), end: minutesToClock(firstEnd) },
      { section: firstSection + 1, start: minutesToClock(secondStart), end: minutesToClock(secondEnd) }
    );
    return secondEnd;
  };

  const morningFirstEnd = addPair(1, clockToMinutes("08:15"));
  addPair(3, morningFirstEnd + LONG_BREAK_MINUTES);
  const afternoonFirstEnd = addPair(5, clockToMinutes("13:30"));
  addPair(7, afternoonFirstEnd + LONG_BREAK_MINUTES);
  const eveningFirstEnd = addPair(9, clockToMinutes("17:45"));
  addPair(11, Math.max(clockToMinutes("19:30"), eveningFirstEnd + EVENING_BREAK_MINUTES));
  return times;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function normalizeStoredGrade(grade) {
  const item = grade && typeof grade === "object" ? grade : {};
  return {
    ...item,
    components: Array.isArray(item.components) ? item.components : [],
    remote: item.remote && typeof item.remote === "object" ? item.remote : {},
    detailFetched: Boolean(item.detailFetched),
    id: item.id || item.jxb_id || item.jxbid || `${item.semester || item.xnm || "legacy"}-${item.name || item.kcmc || "grade"}-${item.credit || item.xf || "0"}`,
    name: item.name || item.kcmc || "未命名课程",
    score: item.score ?? item.cj ?? item.zcj ?? "--",
    credit: item.credit ?? item.xf ?? "--",
    gpa: item.gpa ?? item.jd ?? "--",
    teacher: item.teacher || item.jsxm || item.xm || "教师信息待同步"
  };
}

function normalizeAccountUser(user) {
  if (!user || typeof user !== "object") return null;
  const studentId = String(user.studentId || user.student_id || user.account || "").trim();
  return {
    ...user,
    realName: String(user.realName || user.real_name || "已授权用户").trim() || "已授权用户",
    studentId
  };
}

function profileValueFromHtml(html, elementId) {
  const matcher = new RegExp(`<[^>]*id=["']${elementId}["'][^>]*>[\\s\\S]*?<p[^>]*>([\\s\\S]*?)<\\/p>`, "i");
  const match = String(html || "").match(matcher);
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim() : "";
}

function parseSchoolProfileHtml(html) {
  return {
    realName: profileValueFromHtml(html, "col_xm"),
    college: profileValueFromHtml(html, "col_jg_id"),
    department: profileValueFromHtml(html, "col_x_id"),
    major: profileValueFromHtml(html, "col_zyh_id"),
    className: profileValueFromHtml(html, "col_bh_id"),
    grade: profileValueFromHtml(html, "col_njdm_id"),
    enrollmentStatus: profileValueFromHtml(html, "col_xjztdm")
  };
}

function localDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bytesFromBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ""));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function derLength(length) {
  if (length < 128) return [length];
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 255);
    value >>= 8;
  }
  return [128 | bytes.length, ...bytes];
}

function derNode(tag, content) {
  return Uint8Array.from([tag, ...derLength(content.length), ...content]);
}

function derInteger(input) {
  let bytes = Array.from(input);
  while (bytes.length > 1 && bytes[0] === 0) bytes.shift();
  if (bytes[0] & 128) bytes.unshift(0);
  return derNode(0x02, bytes);
}

function concatBytes(...arrays) {
  return Uint8Array.from(arrays.flatMap(array => Array.from(array)));
}

function publicKeyPem(modulusBase64, exponentBase64) {
  const rsaKey = derNode(0x30, concatBytes(
    derInteger(bytesFromBase64(modulusBase64)),
    derInteger(bytesFromBase64(exponentBase64))
  ));
  const algorithm = Uint8Array.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
  ]);
  const bitString = derNode(0x03, concatBytes(Uint8Array.from([0]), rsaKey));
  const spki = derNode(0x30, concatBytes(algorithm, bitString));
  let binary = "";
  spki.forEach(byte => { binary += String.fromCharCode(byte); });
  const body = btoa(binary).match(/.{1,64}/g).join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

function encryptSchoolPassword(password, modulus, exponent) {
  const encryptor = new window.JSEncrypt();
  encryptor.setPublicKey(publicKeyPem(modulus, exponent));
  const encrypted = encryptor.encrypt(password);
  if (!encrypted) throw new Error("密码加密失败，请重新尝试");
  return encrypted;
}

function responseData(response) {
  if (typeof response.data !== "string") return response.data;
  const text = response.data.trim();
  if (!text) return "";
  try { return JSON.parse(text); } catch (_error) { return response.data; }
}

function htmlText(response) {
  return typeof response.data === "string" ? response.data : JSON.stringify(response.data || "");
}

createApp({
  components: { AppIcon },
  data() {
    const semester = localStorage.getItem(STORAGE.semester) || defaultSemester();
    return {
      appVersion: APP_VERSION,
      tabs: [
        { value: "schedule", label: "首页", icon: "House" },
        { value: "allCourses", label: "课表", icon: "CalendarDays" },
        { value: "grades", label: "成绩", icon: "ChartNoAxesCombined" },
        { value: "settings", label: "我的", icon: "UserRound" }
      ],
      settingsChildTabs: ["sync", "history", "countdowns", "account", "courseSettings", "appearanceSettings", "dataSettings"],
      activeTab: "schedule",
      weekDays: WEEK_DAYS,
      selectedDay: "全部",
      currentWeek: (() => {
        const savedStart = localStorage.getItem(STORAGE.semesterStartDate);
        if (savedStart) return calculateCurrentWeekFromStartDate(savedStart, Number(localStorage.getItem(STORAGE.currentWeek)) || 1);
        return Number(localStorage.getItem(STORAGE.currentWeek)) || 1;
      })(),
      selectedWeek: (() => {
        const savedStart = localStorage.getItem(STORAGE.semesterStartDate);
        const calculated = savedStart ? calculateCurrentWeekFromStartDate(savedStart, Number(localStorage.getItem(STORAGE.currentWeek)) || 1) : null;
        return Number(localStorage.getItem(STORAGE.selectedWeek)) || calculated || Number(localStorage.getItem(STORAGE.currentWeek)) || 1;
      })(),
      weekSheetVisible: false,
      weekSheetMode: "view",
      semesterSheetVisible: false,
      semesterSheetTarget: "course",
      semesterWheelYear: Number(String(semester).split("-")[0]) || currentAcademicYearStart(),
      semesterWheelTerm: Number(String(semester).split("-")[2]) || 1,
      semesterWheelScrollTimer: null,
      transferVisible: false,
      transferCode: "",
      transferImportCode: "",
      transferBusy: false,
      privacyVisible: false,
      accountMode: "login",
      accountLoading: false,
      accountSessionReady: false,
      appFeaturesStarted: false,
      schoolAuthorized: false,
      presenceTimer: null,
      visibilityChangeListener: null,
      authRequiredVisible: false,
      authRequiredTarget: "",
      accountToken: localStorage.getItem(STORAGE.accountToken) || "",
      accountUser: null,
      accountPrivacyConsent: false,
      accountLoginForm: { account: "", password: "" },
      accountRegisterForm: { realName: "", account: "", password: "" },
      schoolOnboardingForm: {
        realName: "",
        username: localStorage.getItem(STORAGE.username) || "",
        password: "",
        semester
      },
      accountDeletePassword: "",
      detailVisible: false,
      gradeDetailVisible: false,
      addVisible: false,
      activeCourse: null,
      activeGrade: null,
      courses: readJson(STORAGE.courses, []),
      syncHistory: readJson(STORAGE.history, []),
      grades: readJson(STORAGE.grades, []).map(normalizeStoredGrade),
      gradeHistory: readJson(STORAGE.gradeHistory, []),
      selectedGradeSemester: "全部",
      gradeSyncVisible: false,
      gradeDetailLoading: false,
      themeMode: localStorage.getItem(STORAGE.themeMode) || (localStorage.getItem(STORAGE.theme) === "dark" ? "dark" : "system"),
      accentOptions: ["#2577f5", "#7857e8", "#16a085", "#ee6b4d"],
      accentColor: localStorage.getItem(STORAGE.accent) || "#2577f5",
      homeScope: localStorage.getItem(STORAGE.homeScope) || "today",
      showWeekends: localStorage.getItem(STORAGE.showWeekends) !== "false",
      compactCards: localStorage.getItem(STORAGE.compactCards) === "true",
      bounceEnabled: localStorage.getItem(STORAGE.bounceEnabled) === "true",
      liquidGlassEnabled: localStorage.getItem(STORAGE.liquidGlassEnabled) === "true",
      bottomNavGlassEnabled: localStorage.getItem(STORAGE.bottomNavGlassEnabled) === "true",
      bottomNavClearGlassEnabled: localStorage.getItem(STORAGE.bottomNavClearGlassEnabled) === "true",
      hapticsEnabled: localStorage.getItem(STORAGE.hapticsEnabled) !== "false",
      scheduleView: localStorage.getItem(STORAGE.scheduleView) || "grid",
      periodDuration: Math.min(60, Math.max(30, Number(localStorage.getItem(STORAGE.periodDuration)) || DEFAULT_PERIOD_DURATION)),
      reminderEnabled: localStorage.getItem(STORAGE.reminderEnabled) === "true",
      reminderMinutes: Math.min(30, Math.max(5, Number(localStorage.getItem(STORAGE.reminderMinutes)) || 10)),
      semesterStartDate: localStorage.getItem(STORAGE.semesterStartDate) || "",
      countdowns: readJson(STORAGE.countdowns, []),
      countdownEditorVisible: false,
      countdownEditingId: null,
      countdownForm: {
        title: "",
        targetDate: "",
        note: "",
        color: "#2577f5"
      },
      countdownNow: Date.now(),
      countdownTimer: null,
      dailyQuote: {
        text: LOCAL_DAILY_QUOTES[Math.floor(Math.random() * LOCAL_DAILY_QUOTES.length)],
        source: "课序"
      },
      pullStartY: null,
      pullOffset: 0,
      exitConfirmVisible: false,
      nativeApp: null,
      database: null,
      databaseReady: false,
      updateChecking: false,
      updateDownloading: false,
      updateInfo: null,
      updateStatusText: "从 GitHub Release 检查新版本",
      updatePromptVisible: false,
      autoUpdateCheckPending: false,
      autoUpdateTimer: null,
      backButtonListener: null,
      showPassword: false,
      showSchoolReauth: false,
      privacyConsent: localStorage.getItem(STORAGE.privacyConsent) === "true",
      tabTransitioning: false,
      tabTransitionTimer: null,
      suppressTabTransition: false,
      syncLoading: false,
      syncStep: "正在连接教务系统",
      gradeLoading: false,
      gradeStep: "正在连接教务系统",
      schoolStatus: { type: "unknown", text: "等待连接" },
      schoolBase: localStorage.getItem(STORAGE.schoolBase) || SCHOOL_PUBLIC_BASE,
      schoolRoute: "default",
      syncForm: {
        username: localStorage.getItem(STORAGE.username) || "",
        password: "",
        semester
      },
      gradeForm: {
        username: localStorage.getItem(STORAGE.username) || "",
        password: "",
        semester
      },
      importHtml: "",
      courseForm: {
        name: "",
        day: "周一",
        time: "第 1-2 节",
        location: "",
        weekRange: "1-16周"
      }
    };
  },
  computed: {
    authRequiredFeatureName() {
      return ({
        allCourses: "课表",
        grades: "成绩",
        settings: "我的",
        sync: "课表同步",
        history: "同步记录",
        countdowns: "目标倒计时"
      })[this.authRequiredTarget] || "该功能";
    },
    dayOptions() {
      return [
        { value: "全部", short: "全部" },
        ...WEEK_DAYS.map(day => ({ value: day, short: day.replace("周", "") }))
      ];
    },
    visibleDayOptions() {
      return this.showWeekends ? this.dayOptions : this.dayOptions.filter(day => !["周六", "周日"].includes(day.value));
    },
    todayLabel() {
      const day = new Date().getDay();
      return day === 0 ? "周日" : WEEK_DAYS[day - 1];
    },
    dateText() {
      return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
    },
    greeting() {
      const hour = new Date().getHours();
      if (hour < 6) return "夜深了";
      if (hour < 11) return "早上好";
      if (hour < 14) return "中午好";
      if (hour < 18) return "下午好";
      return "晚上好";
    },
    coursesForSelectedWeek() {
      return this.courses.filter(course => this.isCourseScheduledForWeek(course, this.selectedWeek));
    },
    todayCourses() {
      return this.coursesForSelectedWeek
        .filter(course => course.day === this.todayLabel)
        .sort((a, b) => this.firstSection(a.time) - this.firstSection(b.time));
    },
    homeCourses() {
      const source = this.homeScope === "today"
        ? this.todayCourses
        : [...this.coursesForSelectedWeek].sort((a, b) => {
            const dayDiff = WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day);
            return dayDiff || this.firstSection(a.time) - this.firstSection(b.time);
          });
      return source.slice(0, 3);
    },
    focusCourse() {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const active = this.todayCourses.find(course => {
        const range = this.courseMinuteRange(course.time);
        return range && currentMinutes >= range.start && currentMinutes <= range.end;
      });
      if (active) return active;
      const upcoming = this.todayCourses.find(course => {
        const range = this.courseMinuteRange(course.time);
        return range && range.start > currentMinutes;
      });
      if (upcoming) return upcoming;
      return this.homeScope === "week" ? this.homeCourses[0] || null : null;
    },
    focusCourseStatus() {
      if (!this.focusCourse) return "";
      const range = this.courseMinuteRange(this.focusCourse.time);
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (this.focusCourse.day === this.todayLabel && range && minutes >= range.start && minutes <= range.end) return "正在上课";
      if (this.focusCourse.day === this.todayLabel && range && minutes < range.start) return "下一节课";
      return "本周课程";
    },
    sortedCountdowns() {
      const today = new Date(this.countdownNow);
      today.setHours(0, 0, 0, 0);
      return [...this.countdowns].sort((a, b) => {
        const aDate = localDate(a.targetDate);
        const bDate = localDate(b.targetDate);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        const aFuture = aDate >= today;
        const bFuture = bDate >= today;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture ? aDate - bDate : bDate - aDate;
      });
    },
    featuredCountdown() {
      return this.sortedCountdowns[0] || null;
    },
    visibleCourses() {
      const courses = this.selectedDay === "全部"
        ? this.coursesForSelectedWeek
        : this.coursesForSelectedWeek.filter(course => course.day === this.selectedDay);
      return [...courses].sort((a, b) => {
        const dayDiff = WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day);
        return dayDiff || this.firstSection(a.time) - this.firstSection(b.time);
      });
    },
    visibleCourseCount() {
      return this.visibleCourses.length;
    },
    groupedCourses() {
      return WEEK_DAYS.map(day => ({
        day,
        courses: this.visibleCourses.filter(course => course.day === day)
      })).filter(group => group.courses.length);
    },
    semesterStartDateLabel() {
      if (!this.semesterStartDate) return "";
      const [y, m, d] = this.semesterStartDate.split("-");
      return `${y}年${Number(m)}月${Number(d)}日`;
    },
    daysUntilSemesterStart() {
      if (!this.semesterStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(this.semesterStartDate)) return 0;
      const [y, m, d] = this.semesterStartDate.split("-").map(Number);
      const start = new Date(y, m - 1, d);
      start.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    },
    isPreSemester() {
      return this.daysUntilSemesterStart > 0;
    },
    semesterStatusText() {
      if (!this.semesterStartDate) return "";
      if (this.daysUntilSemesterStart > 0) {
        return `尚未开课 · 距离第 1 周开学还有 ${this.daysUntilSemesterStart} 天`;
      }
      return `第 ${this.currentWeek} 教学周`;
    },
    weekCalendarDays() {
      const today = new Date();
      let monday;
      if (this.semesterStartDate && /^\d{4}-\d{2}-\d{2}$/.test(this.semesterStartDate)) {
        const [y, m, d] = this.semesterStartDate.split("-").map(Number);
        const termDate = new Date(y, m - 1, d);
        const termWeekday = termDate.getDay() || 7;
        const termMonday = new Date(termDate.getFullYear(), termDate.getMonth(), termDate.getDate() - termWeekday + 1);
        termMonday.setDate(termMonday.getDate() + (this.selectedWeek - 1) * 7);
        monday = termMonday;
      } else {
        const weekday = today.getDay() || 7;
        monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday + 1);
        monday.setDate(monday.getDate() + (this.selectedWeek - this.currentWeek) * 7);
      }
      return WEEK_DAYS.map((name, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return {
          name,
          short: name.replace("周", ""),
          date: date.getDate(),
          month: date.getMonth() + 1,
          isToday: date.toDateString() === today.toDateString()
        };
      });
    },
    gridMonth() {
      return this.weekCalendarDays[0] ? this.weekCalendarDays[0].month : new Date().getMonth() + 1;
    },
    sectionTimes() {
      return buildSectionTimes(this.periodDuration);
    },
    semesterOptions() {
      const currentStart = currentAcademicYearStart();
      const latestStart = Math.max(currentStart + 1, 2035);
      const startYears = new Set();
      for (let start = latestStart; start >= currentStart - 12; start -= 1) startYears.add(start);

      [this.syncForm.semester, this.gradeForm.semester].forEach(value => {
        const start = Number(String(value || "").split("-")[0]);
        if (Number.isInteger(start) && start > 2000 && start < 2100) startYears.add(start);
      });

      return [...startYears]
        .sort((a, b) => b - a)
        .flatMap(start => [
          { value: `${start}-${start + 1}-1`, label: `${start}-${start + 1} 学年 第一学期`, startYear: start, term: 1 },
          { value: `${start}-${start + 1}-2`, label: `${start}-${start + 1} 学年 第二学期`, startYear: start, term: 2 }
        ]);
    },
    semesterRangeLabel() {
      return `${this.semesterYears.length} 个学年 · 双轮盘滑动选择`;
    },
    semesterYears() {
      return [...new Set(this.semesterOptions.map(option => option.startYear))].sort((a, b) => b - a);
    },
    semesterWheelLabel() {
      return `${this.semesterWheelYear}-${this.semesterWheelYear + 1} 学年 第${this.semesterWheelTerm === 1 ? "一" : "二"}学期`;
    },
    currentSemesterValue() {
      return defaultSemester();
    },
    selectedSemesterLabel() {
      const selected = this.semesterOptions.find(option => option.value === this.syncForm.semester);
      return selected ? selected.label : "请选择学期";
    },
    selectedGradeSemesterLabel() {
      const selected = this.semesterOptions.find(option => option.value === this.gradeForm.semester);
      return selected ? selected.label : "请选择学期";
    },
    lastSyncText() {
      if (!this.syncHistory.length) return "尚未同步过课表";
      return `上次同步：${this.formatDate(this.syncHistory[0].syncedAt)}`;
    },
    gradeSemesters() {
      return [...new Set(this.grades.map(grade => grade.semester).filter(Boolean))];
    },
    visibleGrades() {
      const source = this.selectedGradeSemester === "全部"
        ? this.grades
        : this.grades.filter(grade => grade.semester === this.selectedGradeSemester);
      return [...source].sort((a, b) => String(b.semester).localeCompare(String(a.semester)) || String(a.name).localeCompare(String(b.name), "zh-CN"));
    },
    gradeAverage() {
      const values = this.visibleGrades.map(grade => Number(grade.score)).filter(Number.isFinite);
      return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "--";
    },
    gradeCredits() {
      return this.visibleGrades.reduce((sum, grade) => sum + (Number(grade.credit) || 0), 0).toFixed(1);
    }
  },
  watch: {
    activeTab() {
      if (this.suppressTabTransition) {
        this.suppressTabTransition = false;
        return;
      }
      this.playTabTransition();
    },
    themeMode() {
      this.applyTheme();
      localStorage.setItem(STORAGE.themeMode, this.themeMode);
    },
    accentColor(value) {
      this.applyAccent(value);
      localStorage.setItem(STORAGE.accent, value);
    },
    homeScope(value) { localStorage.setItem(STORAGE.homeScope, value); },
    showWeekends(value) { localStorage.setItem(STORAGE.showWeekends, String(value)); },
    compactCards(value) {
      document.body.classList.toggle("compact-cards", value);
      localStorage.setItem(STORAGE.compactCards, String(value));
    },
    bounceEnabled(value) { localStorage.setItem(STORAGE.bounceEnabled, String(value)); },
    liquidGlassEnabled(value) {
      this.applyLiquidGlass(value);
      localStorage.setItem(STORAGE.liquidGlassEnabled, String(value));
    },
    bottomNavGlassEnabled(value) {
      if (!value && this.bottomNavClearGlassEnabled) this.bottomNavClearGlassEnabled = false;
      this.applyBottomNavGlass(value);
      localStorage.setItem(STORAGE.bottomNavGlassEnabled, String(value));
    },
    bottomNavClearGlassEnabled(value) {
      if (value && !this.bottomNavGlassEnabled) this.bottomNavGlassEnabled = true;
      this.applyBottomNavClearGlass(value);
      localStorage.setItem(STORAGE.bottomNavClearGlassEnabled, String(value));
    },
    hapticsEnabled(value) { localStorage.setItem(STORAGE.hapticsEnabled, String(value)); },
    scheduleView(value) { localStorage.setItem(STORAGE.scheduleView, value); },
    periodDuration(value) { localStorage.setItem(STORAGE.periodDuration, String(value)); },
    reminderEnabled(value) {
      localStorage.setItem(STORAGE.reminderEnabled, String(value));
      if (!value) this.clearCourseReminders();
    },
    reminderMinutes(value) { localStorage.setItem(STORAGE.reminderMinutes, String(value)); },
    semesterStartDate(value) { localStorage.setItem(STORAGE.semesterStartDate, value); },
    privacyConsent(value) { localStorage.setItem(STORAGE.privacyConsent, String(value)); },
    selectedWeek(value) {
      localStorage.setItem(STORAGE.selectedWeek, String(value));
    }
  },
  mounted() {
    this.applyTheme();
    this.applyAccent(this.accentColor);
    this.applyLiquidGlass(this.liquidGlassEnabled);
    this.applyBottomNavGlass(this.bottomNavGlassEnabled);
    this.applyBottomNavClearGlass(this.bottomNavClearGlassEnabled);
    document.body.classList.toggle("compact-cards", this.compactCards);
    this.systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (this.systemThemeQuery.addEventListener) this.systemThemeQuery.addEventListener("change", this.applyTheme);
    else this.systemThemeQuery.addListener(this.applyTheme);
    window.onNativeBackEvent = () => this.handleBackButton();
    window.onKexuUpdateEvent = payload => this.handleUpdateEvent(payload);
    this.setupNativeBackButton();
    this.initializeGuestApp();
    // 首屏只依赖本机数据，云端会话在后台安静恢复，避免网络波动阻塞打开应用。
    this.accountSessionReady = true;
    this.restoreAccountSession();
  },
  beforeUnmount() {
    window.onNativeBackEvent = null;
    window.onKexuUpdateEvent = null;
    document.body.classList.remove("liquid-glass", "nav-glass", "nav-clear-glass");
    if (this.backButtonListener) this.backButtonListener.remove();
    if (this.autoUpdateTimer) clearTimeout(this.autoUpdateTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.tabTransitionTimer) clearTimeout(this.tabTransitionTimer);
    if (!this.systemThemeQuery) return;
    if (this.systemThemeQuery.removeEventListener) this.systemThemeQuery.removeEventListener("change", this.applyTheme);
    else this.systemThemeQuery.removeListener(this.applyTheme);
  },
  methods: {
    initializeGuestApp() {
      this.initializePersistentStorage();
      this.checkSchoolStatus();
      this.loadDailyQuote();
      if (!this.countdownTimer) {
        this.countdownTimer = setInterval(() => {
          this.countdownNow = Date.now();
        }, 60000);
      }
    },
    activateAuthenticatedApp() {
      if (this.appFeaturesStarted || !this.accountUser) return;
      this.appFeaturesStarted = true;
      this.reportPresence();
      this.presenceTimer = setInterval(() => this.reportPresence(), 8000);
      this.visibilityChangeListener = () => {
        if (!document.hidden) this.reportPresence();
      };
      document.addEventListener("visibilitychange", this.visibilityChangeListener);
      this.autoUpdateTimer = setTimeout(() => this.checkForUpdate({ silent: true }), 1100);
    },
    deactivateAuthenticatedApp() {
      if (this.autoUpdateTimer) clearTimeout(this.autoUpdateTimer);
      if (this.presenceTimer) clearInterval(this.presenceTimer);
      if (this.visibilityChangeListener) document.removeEventListener("visibilitychange", this.visibilityChangeListener);
      this.autoUpdateTimer = null;
      this.presenceTimer = null;
      this.visibilityChangeListener = null;
      this.appFeaturesStarted = false;
    },
    async loadDailyQuote() {
      const today = localDayKey();
      const cached = readJson(STORAGE.dailyQuote, null);
      if (cached?.date === today && cached?.text) {
        this.dailyQuote = { text: cached.text, source: cached.source || "" };
        return;
      }

      const fallbackIndex = [...today].reduce((sum, char) => sum + char.charCodeAt(0), 0) % LOCAL_DAILY_QUOTES.length;
      this.dailyQuote = { text: LOCAL_DAILY_QUOTES[fallbackIndex], source: "课序" };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch("https://v1.hitokoto.cn/?c=e&c=k&encode=json&charset=utf-8&min_length=6&max_length=20", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const text = String(data?.hitokoto || "").trim();
        if (text.length < 4 || text.length > 28) throw new Error("每日一句长度不合适");
        const record = {
          date: today,
          text,
          source: String(data?.from || data?.from_who || "一言").trim().slice(0, 18) || "一言"
        };
        this.dailyQuote = { text: record.text, source: record.source };
        localStorage.setItem(STORAGE.dailyQuote, JSON.stringify(record));
      } catch (_error) {
        localStorage.setItem(STORAGE.dailyQuote, JSON.stringify({ date: today, ...this.dailyQuote }));
      } finally {
        clearTimeout(timeout);
      }
    },
    playTabTransition() {
      if (this.tabTransitionTimer) clearTimeout(this.tabTransitionTimer);
      this.tabTransitioning = false;
      this.$nextTick(() => {
        requestAnimationFrame(() => {
          this.tabTransitioning = true;
          this.tabTransitionTimer = setTimeout(() => {
            this.tabTransitioning = false;
            this.tabTransitionTimer = null;
          }, 240);
        });
      });
    },
    openTab(tab) {
      if (!this.accountUser && !this.schoolAuthorized && tab !== "schedule") {
        this.authRequiredTarget = tab;
        this.authRequiredVisible = true;
        this.tapFeedback();
        return;
      }
      if (this.activeTab === tab) return;
      this.activeTab = tab;
      this.tapFeedback();
    },
    closeAuthRequired() {
      this.authRequiredVisible = false;
      this.authRequiredTarget = "";
      this.schoolOnboardingForm.password = "";
    },
    returnToHome() {
      if (this.activeTab === "schedule") return;
      this.suppressTabTransition = true;
      this.activeTab = "schedule";
      this.tapFeedback();
    },
    returnToParentTab() {
      if (!this.settingsChildTabs.includes(this.activeTab)) return false;
      this.suppressTabTransition = true;
      this.activeTab = "settings";
      this.tapFeedback();
      return true;
    },
    async setupNativeBackButton() {
      if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;
      this.nativeApp = window.capacitorExports.registerPlugin("App");
      this.backButtonListener = await this.nativeApp.addListener("backButton", () => {
        if (!window.__kexuNativeBackBridge) this.handleBackButton();
      });
    },
    handleBackButton() {
      if (this.updatePromptVisible) {
        this.updatePromptVisible = false;
        return;
      }
      if (this.exitConfirmVisible) {
        this.exitConfirmVisible = false;
        return;
      }
      if (this.detailVisible) {
        this.detailVisible = false;
        return;
      }
      if (this.gradeDetailVisible) {
        this.gradeDetailVisible = false;
        return;
      }
      if (this.privacyVisible) {
        this.privacyVisible = false;
        return;
      }
      if (this.addVisible) {
        this.addVisible = false;
        return;
      }
      if (this.transferVisible) {
        this.transferVisible = false;
        return;
      }
      if (this.countdownEditorVisible) {
        this.countdownEditorVisible = false;
        return;
      }
      if (this.semesterSheetVisible) {
        this.semesterSheetVisible = false;
        return;
      }
      if (this.gradeSyncVisible) {
        this.gradeSyncVisible = false;
        return;
      }
      if (this.weekSheetVisible) {
        this.weekSheetVisible = false;
        return;
      }
      if (this.authRequiredVisible) return this.closeAuthRequired();
      if (this.returnToParentTab()) return;
      if (this.activeTab !== "schedule") {
        this.returnToHome();
        return;
      }
      this.exitConfirmVisible = true;
      this.tapFeedback(14);
    },
    async exitApplication() {
      this.exitConfirmVisible = false;
      if (this.nativeApp) await this.nativeApp.exitApp();
    },
    async initializePersistentStorage() {
      if (!window.KexuLocalDatabase) return;
      try {
        const database = new window.KexuLocalDatabase();
        const loaded = await database.initialize({
          courses: this.courses,
          grades: this.grades,
          syncHistory: this.syncHistory,
          gradeHistory: this.gradeHistory
        });
        if (!loaded) return;
        this.database = database;
        this.databaseReady = true;
        this.courses = loaded.courses;
        this.grades = Array.isArray(loaded.grades) ? loaded.grades.map(normalizeStoredGrade) : [];
        this.syncHistory = loaded.syncHistory;
        this.gradeHistory = loaded.gradeHistory;
      } catch (error) {
        console.warn("SQLite 初始化失败，将继续使用本地兼容存储", error);
      }
    },
    persistSyncHistory() {
      localStorage.setItem(STORAGE.history, JSON.stringify(this.syncHistory));
      this.database?.saveSyncHistory(this.syncHistory).catch(error => console.warn("同步记录写入 SQLite 失败", error));
    },
    persistGradeHistory() {
      localStorage.setItem(STORAGE.gradeHistory, JSON.stringify(this.gradeHistory));
      this.database?.saveGradeHistory(this.gradeHistory).catch(error => console.warn("成绩快照写入 SQLite 失败", error));
    },
    persistCountdowns() {
      localStorage.setItem(STORAGE.countdowns, JSON.stringify(this.countdowns));
    },
    countdownDays(item) {
      const target = localDate(item?.targetDate);
      if (!target) return null;
      const today = new Date(this.countdownNow);
      today.setHours(0, 0, 0, 0);
      return Math.round((target - today) / 86400000);
    },
    countdownNumber(item) {
      const days = this.countdownDays(item);
      return days === null ? "--" : Math.abs(days);
    },
    countdownUnit(item) {
      const days = this.countdownDays(item);
      if (days === null) return "未设置";
      if (days === 0) return "天";
      return days > 0 ? "天" : "天前";
    },
    countdownStatus(item) {
      const days = this.countdownDays(item);
      if (days === null) return "等待设置日期";
      if (days === 0) return "今天就是目标日";
      return days > 0 ? `距离目标还有 ${days} 天` : `目标已过去 ${Math.abs(days)} 天`;
    },
    formatCountdownDate(value) {
      const date = localDate(value);
      if (!date) return "日期待设置";
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short"
      }).format(date);
    },
    openCountdownEditor(item = null) {
      this.countdownEditingId = item?.id || null;
      this.countdownForm = item ? {
        title: item.title,
        targetDate: item.targetDate,
        note: item.note || "",
        color: item.color || this.accentColor
      } : {
        title: "",
        targetDate: "",
        note: "",
        color: this.accentColor
      };
      this.countdownEditorVisible = true;
      this.tapFeedback();
    },
    selectCountdownTemplate(title) {
      this.countdownForm.title = title;
      if (!this.countdownForm.note) {
        this.countdownForm.note = title === "考研" ? "向理想院校再近一步" : "以当年官方考试通知为准";
      }
      this.tapFeedback();
    },
    saveCountdown() {
      const title = this.countdownForm.title.trim();
      if (!title) {
        this.notify("请填写目标名称", "warning");
        return;
      }
      if (!localDate(this.countdownForm.targetDate)) {
        this.notify("请选择目标日期", "warning");
        return;
      }
      const record = {
        id: this.countdownEditingId || `countdown-${Date.now()}`,
        title: title.slice(0, 24),
        targetDate: this.countdownForm.targetDate,
        note: this.countdownForm.note.trim().slice(0, 48),
        color: this.countdownForm.color || this.accentColor,
        updatedAt: new Date().toISOString()
      };
      const index = this.countdowns.findIndex(item => item.id === record.id);
      if (index >= 0) this.countdowns.splice(index, 1, record);
      else this.countdowns.push(record);
      this.persistCountdowns();
      this.countdownEditorVisible = false;
      this.notify(index >= 0 ? "倒计时已更新" : "倒计时已创建");
      this.tapFeedback(16);
    },
    deleteCountdown(item) {
      if (!window.confirm(`删除“${item.title}”倒计时吗？`)) return;
      this.countdowns = this.countdowns.filter(countdown => countdown.id !== item.id);
      this.persistCountdowns();
      this.notify("倒计时已删除");
      this.tapFeedback(16);
    },
    localNotifications() {
      if (!window.Capacitor?.isNativePlatform() || !window.capacitorExports?.registerPlugin) {
        throw new Error("上课提醒仅支持 Android 安装包");
      }
      return window.capacitorExports.registerPlugin("LocalNotifications");
    },
    reminderId(courseId, week) {
      const source = `${courseId}-${week}`;
      return source.split("").reduce((value, char) => ((value * 31) + char.charCodeAt(0)) % 2000000000, 17);
    },
    async clearCourseReminders(silent = true) {
      try {
        const notifications = this.localNotifications();
        const pending = await notifications.getPending();
        if (pending.notifications?.length) {
          await notifications.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) });
        }
        if (!silent) this.notify("已清除上课提醒");
      } catch (error) {
        if (!silent) this.notify(error.message || "清除提醒失败", "warning");
      }
    },
    async scheduleCourseReminders() {
      if (!this.reminderEnabled) {
        this.notify("请先开启上课提醒", "warning");
        return;
      }
      if (!this.semesterStartDate) {
        this.notify("请先设置第一周周一的日期", "warning");
        return;
      }
      try {
        const notifications = this.localNotifications();
        let permissions = await notifications.checkPermissions();
        if (permissions.display !== "granted") permissions = await notifications.requestPermissions();
        if (permissions.display !== "granted") {
          this.notify("未获得通知权限，无法创建上课提醒", "warning");
          return;
        }
        await this.clearCourseReminders(true);
        const termMonday = new Date(`${this.semesterStartDate}T00:00:00`);
        const now = new Date();
        const deadline = new Date(now);
        deadline.setDate(deadline.getDate() + 45);
        const scheduled = [];
        this.courses.forEach(course => {
          const dayOffset = WEEK_DAYS.indexOf(course.day);
          const section = this.getCourseSections(course);
          const sectionTime = section && this.sectionTimes.find(item => item.section === section.start);
          if (dayOffset < 0 || !sectionTime) return;
          const [hour, minute] = sectionTime.start.split(":").map(Number);
          this.getCourseWeeks(course).forEach(week => {
            const at = new Date(termMonday);
            at.setDate(at.getDate() + ((week - 1) * 7) + dayOffset);
            at.setHours(hour, minute - this.reminderMinutes, 0, 0);
            if (at <= now || at > deadline) return;
            scheduled.push({
              id: this.reminderId(course.id, week),
              title: `${this.reminderMinutes} 分钟后上课：${course.name}`,
              body: `${this.formatCourseTime(course.time)} · ${course.location || "地点待定"}`,
              schedule: { at },
              extra: { source: "course", courseId: String(course.id), week }
            });
          });
        });
        if (!scheduled.length) {
          this.notify("未来 45 天内没有可创建的课程提醒", "info");
          return;
        }
        await notifications.schedule({ notifications: scheduled });
        this.notify(`已创建 ${scheduled.length} 条上课提醒`);
      } catch (error) {
        this.notify(error.message || "创建上课提醒失败", "error");
      }
    },
    versionParts(value) {
      const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
      return match ? match.slice(1).map(Number) : [0, 0, 0];
    },
    isNewerVersion(value) {
      const latest = this.versionParts(value);
      const current = this.versionParts(APP_VERSION);
      for (let index = 0; index < latest.length; index += 1) {
        if (latest[index] !== current[index]) return latest[index] > current[index];
      }
      return false;
    },
    async checkForUpdate({ silent = false } = {}) {
      if (this.updateChecking) return;
      this.updateChecking = true;
      this.autoUpdateCheckPending = silent;
      if (!silent) this.updateStatusText = "正在检查最新版本";
      try {
        if (window.KexuUpdater?.checkForUpdate) {
          window.KexuUpdater.checkForUpdate();
          return;
        }
        const response = await fetch("https://api.github.com/repos/cyj4580zrq-afk/kexu/releases?per_page=20", {
          headers: { Accept: "application/vnd.github+json" }
        });
        if (!response.ok) throw new Error(`更新服务返回 ${response.status}`);
        const releases = await response.json();
        const release = (releases || []).find(item =>
          !item.draft &&
          !item.prerelease &&
          (item.assets || []).some(asset => /^Kexu-Android-v.+-stable\.apk$/i.test(String(asset.name)))
        );
        const asset = (release?.assets || []).find(item => /^Kexu-Android-v.+-stable\.apk$/i.test(String(item.name)));
        this.handleUpdateEvent(asset ? {
          type: "release",
          version: release.tag_name,
          downloadUrl: asset.browser_download_url,
          releaseUrl: release.html_url,
          notes: release.body || ""
        } : { type: "error", message: "最新版本未附带 Android 安装包" });
      } catch (error) {
        this.handleUpdateEvent({ type: "error", message: error.message || "无法连接更新服务" });
      }
    },
    handleUpdateEvent(payload = {}) {
      if (payload.type === "release") {
        const silent = this.autoUpdateCheckPending;
        this.autoUpdateCheckPending = false;
        this.updateChecking = false;
        if (this.isNewerVersion(payload.version)) {
          this.updateInfo = payload;
          this.updateStatusText = "已找到可安装的新版本";
          if (silent) this.updatePromptVisible = true;
        } else {
          this.updateInfo = null;
          this.updateStatusText = "当前已是最新版本";
          if (!silent) this.notify("当前已是最新版本", "success");
        }
        return;
      }
      if (payload.type === "downloading") {
        this.updateDownloading = true;
        this.updateStatusText = "正在下载更新包";
        this.notify("正在下载更新包，完成后会打开系统安装页", "info");
        return;
      }
      if (payload.type === "permission_required") {
        this.updateDownloading = false;
        this.updateStatusText = "需要允许安装未知应用";
        if (window.confirm("Android 需要允许课序安装更新包。现在前往系统设置开启吗？")) {
          window.KexuUpdater?.requestInstallPermission();
        }
        return;
      }
      if (payload.type === "ready") {
        this.updateStatusText = "已获得安装权限，请再次点击立即更新";
        this.notify(this.updateStatusText, "success");
        return;
      }
      if (payload.type === "installing") {
        this.updateDownloading = false;
        this.updateStatusText = "已打开系统安装页";
        return;
      }
      if (payload.type === "error") {
        const silent = this.autoUpdateCheckPending;
        this.autoUpdateCheckPending = false;
        this.updateChecking = false;
        this.updateDownloading = false;
        this.updateStatusText = "检查更新失败";
        if (!silent) this.notify(`更新失败：${payload.message || "未知错误"}`, "error");
      }
    },
    startAppUpdate(skipConfirmation = false) {
      if (!this.updateInfo?.downloadUrl) return;
      if (!skipConfirmation && !window.confirm(`下载并安装 ${this.updateInfo.version} 吗？`)) return;
      this.updatePromptVisible = false;
      if (window.KexuUpdater?.downloadAndInstall) {
        window.KexuUpdater.downloadAndInstall(this.updateInfo.downloadUrl);
      } else {
        window.open(this.updateInfo.downloadUrl, "_blank");
      }
    },
    applyTheme() {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const dark = this.themeMode === "dark" || (this.themeMode === "system" && systemDark);
      document.body.classList.toggle("dark", dark);
      localStorage.setItem(STORAGE.theme, dark ? "dark" : "light");
    },
    applyAccent(color) {
      document.documentElement.style.setProperty("--blue", color);
      const red = parseInt(color.slice(1, 3), 16);
      const green = parseInt(color.slice(3, 5), 16);
      const blue = parseInt(color.slice(5, 7), 16);
      document.documentElement.style.setProperty("--blue-soft", `rgba(${red}, ${green}, ${blue}, .12)`);
    },
    applyLiquidGlass(enabled) {
      document.body.classList.toggle("liquid-glass", enabled);
    },
    applyBottomNavGlass(enabled) {
      document.body.classList.toggle("nav-glass", enabled);
    },
    applyBottomNavClearGlass(enabled) {
      document.body.classList.toggle("nav-clear-glass", enabled);
    },
    tapFeedback(duration = 10) {
      if (this.hapticsEnabled && navigator.vibrate) navigator.vibrate(duration);
    },
    handlePullStart(event) {
      if (!this.bounceEnabled || window.scrollY > 0 || !event.touches.length) return;
      this.pullStartY = event.touches[0].clientY;
    },
    handlePullMove(event) {
      if (this.pullStartY === null || !event.touches.length || window.scrollY > 0) return;
      const distance = event.touches[0].clientY - this.pullStartY;
      if (distance <= 0) return;
      this.pullOffset = Math.min(42, Math.pow(distance, .82) * .45);
      if (this.pullOffset > 2) event.preventDefault();
    },
    handlePullEnd() {
      if (this.pullOffset > 12) this.tapFeedback(8);
      this.pullStartY = null;
      this.pullOffset = 0;
    },
    notify(message, type = "success") {
      ElementPlus.ElMessage({ message, type, duration: 2800, grouping: true });
    },
    async accountApiRequest(path, options = {}) {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      if (this.accountToken) headers.Authorization = `Bearer ${this.accountToken}`;
      // Android 上不使用被 CapacitorHttp 接管的全局 fetch。它会通过 WebView
      // 的拦截器保留连接；学校服务关闭连接后，下一次登录会直接抛出 EOF。
      // 账号服务也统一走可控的原生请求通道，确保每次请求都会释放连接并重试。
      if (window.capacitorExports?.CapacitorHttp) {
        try {
          const response = await this.httpRequest(options.method || "GET", `${ACCOUNT_API_BASE}${path}`, {
            headers,
            data: options.body,
            responseType: "json",
            connectTimeout: options.connectTimeout || 7000,
            readTimeout: options.timeout || 7000
          });
          return responseData(response) || {};
        } catch (error) {
          const networkError = new Error(/timed? out/i.test(String(error?.message || error))
            ? "账号服务响应较慢，请稍后重试"
            : "暂时无法连接课序账号服务，请稍后重试");
          networkError.network = true;
          throw networkError;
        }
      }
      let response;
      const controller = typeof AbortController === "undefined" ? null : new AbortController();
      const timeout = controller ? setTimeout(() => controller.abort(), options.timeout || 7000) : null;
      try {
        response = await fetch(`${ACCOUNT_API_BASE}${path}`, {
          method: options.method || "GET",
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller?.signal
        });
      } catch (error) {
        const networkError = new Error(error?.name === "AbortError" ? "账号服务响应较慢，请稍后重试" : "暂时无法连接课序账号服务，请稍后重试");
        networkError.network = true;
        throw networkError;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      let payload = {};
      try { payload = await response.json(); } catch (_error) { payload = {}; }
      if (!response.ok) {
        const requestError = new Error(payload.detail || "账号服务请求失败");
        requestError.status = response.status;
        throw requestError;
      }
      return payload;
    },
    rememberAccountSession(payload) {
      this.accountToken = payload.token || this.accountToken;
      this.accountUser = normalizeAccountUser(payload.user || this.accountUser);
      if (this.accountToken) localStorage.setItem(STORAGE.accountToken, this.accountToken);
      if (this.accountUser) localStorage.setItem(STORAGE.accountUser, JSON.stringify(this.accountUser));
    },
    async reportPresence() {
      if (!this.accountToken) return;
      try {
        await this.accountApiRequest("/api/cloud/presence", { method: "POST" });
      } catch (error) {
        if (error.status === 401 || error.status === 403) this.handleAccountUnavailable(error);
        // 网络波动不影响本机使用；只有服务明确返回停用或失效才退出授权。
      }
    },
    handleAccountUnavailable(error) {
      const message = error.status === 403
        ? "账号已被后台停用，已退出授权状态"
        : "账号登录状态已失效，请重新验证后继续使用";
      // 正在登录时没有历史令牌：保留表单，让用户能直接看到服务端拒绝原因。
      const keepLoginSheet = this.authRequiredVisible && !this.accountToken && !this.accountUser;
      this.clearAccountSession();
      this.schoolAuthorized = false;
      this.showSchoolReauth = false;
      if (!keepLoginSheet) {
        this.authRequiredVisible = false;
        this.activeTab = "schedule";
      }
      this.notify(message, "error");
    },
    async restoreAccountSession() {
      const cachedUser = readJson(STORAGE.accountUser, null);
      if (cachedUser) {
        this.accountUser = normalizeAccountUser(cachedUser);
        this.activateAuthenticatedApp();
      }
      if (!this.accountToken) return;
      try {
        const payload = await this.accountApiRequest("/api/auth/me", { timeout: 2400 });
        this.rememberAccountSession(payload);
        this.activateAuthenticatedApp();
        this.loadCloudCaches();
      } catch (error) {
        // 仅在服务明确告知令牌无效时才退出；超时或离线时保留本机状态。
        if (error.status === 401 || error.status === 403) this.handleAccountUnavailable(error);
        else console.warn("课序账号状态将在后台重试", error);
      }
    },
    clearAccountSession() {
      this.deactivateAuthenticatedApp();
      this.accountToken = "";
      this.accountUser = null;
      localStorage.removeItem(STORAGE.accountToken);
      localStorage.removeItem(STORAGE.accountUser);
    },
    async createCloudIdentity() {
      const form = this.schoolOnboardingForm;
      if (!form.realName.trim() || !form.username || !form.password) {
        return this.notify("请填写姓名、学号和教务系统密码", "warning");
      }
      if (!this.accountPrivacyConsent) return this.notify("请先同意云端同步隐私说明", "warning");
      this.accountLoading = true;
      this.syncStep = "正在验证教务身份";
      try {
        await this.authenticateSchool(form, step => { this.syncStep = step; });
        this.syncStep = "正在创建云端身份";
        const payload = await this.accountApiRequest("/api/cloud/identity", {
          method: "POST",
          body: {
            real_name: form.realName.trim(),
            student_id: form.username,
            privacy_consent: true
          }
        });
        this.rememberAccountSession(payload);
        this.accountSessionReady = true;
        localStorage.setItem(STORAGE.username, form.username);
        this.syncForm.username = form.username;
        this.gradeForm.username = form.username;
        this.syncForm.semester = form.semester;
        this.gradeForm.semester = form.semester;
        form.password = "";
        this.activeTab = "schedule";
        this.activateAuthenticatedApp();
        this.notify(payload.message || "教务授权成功");
        await this.loadCloudCaches();
      } catch (error) {
        this.notify(error.message || "教务授权失败，请稍后重试", "error");
      } finally {
        this.accountLoading = false;
        this.syncStep = "正在连接教务系统";
      }
    },
    async loginWithSchoolAccount() {
      const form = this.schoolOnboardingForm;
      if (!form.username || !form.password) return this.notify("请输入教务系统学号和密码", "warning");
      if (!this.accountPrivacyConsent) return this.notify("请先同意账号管理与同步说明", "warning");
      this.accountLoading = true;
      this.syncStep = "正在验证教务身份";
      try {
        await this.authenticateSchool(form, step => { this.syncStep = step; });
        localStorage.setItem(STORAGE.username, form.username);
        this.syncForm.username = form.username;
        this.gradeForm.username = form.username;
        form.password = "";

        try {
          // 账号先建立并上报活跃状态，学籍资料在后台补全，避免资料页慢时管理端长期看不到新登录用户。
          this.syncStep = "正在建立账号身份";
          const payload = await this.accountApiRequest("/api/cloud/identity", {
            method: "POST",
            body: {
              real_name: `学号${form.username}`,
              student_id: form.username,
              privacy_consent: true
            }
          });
          this.rememberAccountSession(payload);
          this.activateAuthenticatedApp();
        } catch (cloudError) {
          // 停用或令牌失效是服务端的明确拒绝，不能降级为本机授权。
          if (cloudError.status === 401 || cloudError.status === 403) {
            this.handleAccountUnavailable(cloudError);
            return;
          }
          console.warn("云端身份暂不可用", cloudError);
          this.notify("已进入本机功能，后台同步将在服务恢复后重试", "warning");
        }

        this.schoolAuthorized = true;
        const target = this.authRequiredTarget || "allCourses";
        this.closeAuthRequired();
        this.activeTab = target;
        this.notify("教务登录成功");
        // 课表、成绩和学籍信息后置加载，不再阻塞用户进入页面或后台看到登录状态。
        this.loadCloudCaches().catch(cacheError => console.warn("云端缓存读取失败", cacheError));
        this.syncStudentProfileForCurrentSession().catch(profileError => console.warn("学籍资料将于下次使用时补全", profileError));
      } catch (error) {
        this.notify(error.message || "教务登录失败，请稍后重试", "error");
      } finally {
        this.accountLoading = false;
        this.syncStep = "正在连接教务系统";
      }
    },
    async loadCloudCache(type, semester) {
      if (!this.accountToken || !semester) return null;
      try {
        const payload = await this.accountApiRequest(`/api/cloud/${type}/${semester}`, { timeout: 900 });
        return payload.cache;
      } catch (error) {
        console.warn(`云端${type}缓存读取失败`, error);
        return null;
      }
    },
    async saveCloudCache(type, semester, data) {
      if (!this.accountToken) return null;
      try {
        return await this.accountApiRequest(`/api/cloud/${type}`, {
          method: "POST",
          body: { semester, data }
        });
      } catch (error) {
        console.warn(`云端${type}缓存保存失败`, error);
        this.notify("本机已保存，云端缓存将在下次网络可用时更新", "warning");
        return null;
      }
    },
    async loadCloudCaches() {
      if (!this.accountToken) return;
      const semester = this.syncForm.semester || defaultSemester();
      const [courseCache, gradeCache] = await Promise.all([
        this.loadCloudCache("courses", semester),
        this.loadCloudCache("grades", semester)
      ]);
      if (courseCache?.data?.length && !this.courses.length) {
        this.courses = courseCache.data;
        this.persistCourses();
        this.saveSnapshot("云端缓存恢复", semester, courseCache.data);
      }
      if (gradeCache?.data?.length && !this.grades.some(grade => this.gradeMatchesSemester(grade, semester))) {
        this.replaceGradesForSemester(semester, gradeCache.data);
        this.saveGradeSnapshot(semester, gradeCache.data);
      }
    },
    async registerKexuAccount() {
      const form = this.accountRegisterForm;
      if (!form.realName.trim()) return this.notify("请填写真实姓名", "warning");
      if (!/^[A-Za-z][A-Za-z0-9_]{3,23}$/.test(form.account)) return this.notify("账号需以字母开头，可使用字母、数字和下划线", "warning");
      if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) return this.notify("密码至少 8 位，并包含字母和数字", "warning");
      if (!this.accountPrivacyConsent) return this.notify("请先同意账号隐私说明", "warning");
      this.accountLoading = true;
      try {
        const payload = await this.accountApiRequest("/api/auth/register", {
          method: "POST",
          body: {
            real_name: form.realName.trim(),
            account: form.account.trim(),
            password: form.password,
            privacy_consent: true
          }
        });
        this.rememberAccountSession(payload);
        this.accountSessionReady = true;
        this.activeTab = "schedule";
        this.activateAuthenticatedApp();
        this.accountRegisterForm.password = "";
        this.notify("注册成功，账号已立即启用");
      } catch (error) {
        this.notify(error.message, "error");
      } finally {
        this.accountLoading = false;
      }
    },
    async loginKexuAccount() {
      if (!this.accountLoginForm.account || !this.accountLoginForm.password) return this.notify("请输入账号和密码", "warning");
      this.accountLoading = true;
      try {
        const payload = await this.accountApiRequest("/api/auth/login", {
          method: "POST",
          body: this.accountLoginForm
        });
        this.rememberAccountSession(payload);
        this.accountSessionReady = true;
        this.activeTab = "schedule";
        this.activateAuthenticatedApp();
        this.accountLoginForm.password = "";
        this.notify("登录成功");
      } catch (error) {
        this.notify(error.message, "error");
      } finally {
        this.accountLoading = false;
      }
    },
    logoutKexuAccount() {
      this.clearAccountSession();
      // 教务系统的 JSESSIONID / route Cookie 属于原生 CookieManager，不在
      // localStorage 中。若保留它们，下一次登录会命中已失效的后端会话。
      this.clearSchoolSessionCookies();
      this.schoolAuthorized = false;
      this.showSchoolReauth = false;
      localStorage.removeItem(STORAGE.username);
      this.schoolOnboardingForm.username = "";
      this.schoolOnboardingForm.password = "";
      this.syncForm.username = "";
      this.syncForm.password = "";
      this.gradeForm.username = "";
      this.gradeForm.password = "";
      this.accountSessionReady = true;
      this.activeTab = "schedule";
      this.accountDeletePassword = "";
      this.notify("已退出课序账号", "info");
    },
    signOutCurrentAccount() {
      if (!window.confirm("确定退出当前账号吗？已导入的课表、成绩和倒计时仍会保留在本机。")) return;
      this.logoutKexuAccount();
    },
    async deleteKexuAccount() {
      if (!this.accountDeletePassword) return this.notify("请输入课序账号密码", "warning");
      if (!window.confirm("确定注销课序账号吗？注销后无法恢复，但本机课表和成绩仍会保留。")) return;
      this.accountLoading = true;
      try {
        const payload = await this.accountApiRequest("/api/auth/account", {
          method: "DELETE",
          body: { password: this.accountDeletePassword }
        });
        this.logoutKexuAccount();
        this.notify(payload.message);
      } catch (error) {
        this.notify(error.message, "error");
      } finally {
        this.accountLoading = false;
      }
    },
    async openFeedbackGroup() {
      const groupNumber = "1075730072";
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(groupNumber);
        else {
          const input = document.createElement("textarea");
          input.value = groupNumber;
          input.style.position = "fixed";
          input.style.opacity = "0";
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
        }
        this.notify("反馈群号已复制，正在打开 QQ");
      } catch (_error) {
        this.notify("反馈群：1075730072", "info");
      }
      window.location.href = "mqqapi://card/show_pslcard?src_type=internal&version=1&uin=1075730072&card_type=group&source=external";
    },
    nativeHttp() {
      const exports = window.capacitorExports;
      if (!exports || !exports.CapacitorHttp) throw new Error("当前安装包缺少网络同步组件");
      return exports.CapacitorHttp;
    },
    async httpRequest(method, url, options = {}) {
      const http = this.nativeHttp();
      const request = {
        url,
        method,
        connectTimeout: options.connectTimeout || 10000,
        readTimeout: options.readTimeout || 22000,
        responseType: options.responseType || "text",
        // 教务系统会主动关闭空闲 HTTP 连接。Android 的网络组件偶尔会在
        // 退出后再次登录时复用该连接，导致 "unexpected end of stream"。
        // 每次请求关闭连接，并在这类瞬断发生时自动重试一次。
        headers: { Connection: "close", ...(options.headers || {}) },
        params: options.params,
        data: options.data
      };
      let response;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await http.request(request);
          break;
        } catch (error) {
          const message = String(error?.message || error);
          if (/CertPathValidatorException|Trust anchor|certificate/i.test(message)) {
            throw new Error("教务系统安全证书暂不可验证。请连接校园网后重试，或稍后等待学校恢复证书服务。");
          }
          const staleConnection = /unexpected end of stream|stream was reset|connection reset|socket closed|broken pipe|eof/i.test(message);
          if (attempt === 0 && staleConnection) continue;
          throw error;
        }
      }
      if (response.status < 200 || response.status >= 400) {
        const error = new Error(`教务系统返回异常（${response.status}）`);
        error.status = response.status;
        throw error;
      }
      return response;
    },
    schoolEndpoints() {
      const base = this.schoolBase;
      return {
        base,
        login: `${base}${SCHOOL_LOGIN_PATH}`,
        publicKey: `${base}${SCHOOL_PUBKEY_PATH}`,
        schedule: `${base}${SCHOOL_SCHEDULE_PATH}`,
        scheduleReferer: `${base}${SCHOOL_SCHEDULE_REFERER_PATH}`,
        grades: `${base}${SCHOOL_GRADE_PATH}`,
        gradesReferer: `${base}${SCHOOL_GRADE_REFERER_PATH}`,
        gradeDetail: `${base}${SCHOOL_GRADE_DETAIL_PATH}`,
        gradeDetailReferer: `${base}${SCHOOL_GRADE_REFERER_PATH}&layout=default`,
        profile: `${base}/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801`
      };
    },
    async fetchSchoolProfile() {
      const endpoints = this.schoolEndpoints();
      const response = await this.httpRequest("GET", endpoints.profile, {
        responseType: "text",
        headers: { Referer: endpoints.scheduleReferer }
      });
      const profile = parseSchoolProfileHtml(htmlText(response));
      if (!profile.realName && !profile.major && !profile.className) {
        throw new Error("未能读取教务个人资料");
      }
      return profile;
    },
    async syncStudentProfileForCurrentSession() {
      if (!this.accountToken) return false;
      const profile = await this.fetchSchoolProfile();
      if (!profile.realName && !profile.college && !profile.major && !profile.className) {
        throw new Error("教务系统未返回可用的学籍资料");
      }
      // 个人信息页中的姓名是后台账号资料的权威来源，避免一直保留“学号xxxx”的占位名。
      if (profile.realName) {
        const identity = await this.accountApiRequest("/api/cloud/identity", {
          method: "POST",
          body: {
            real_name: profile.realName,
            student_id: this.syncForm.username || this.gradeForm.username,
            privacy_consent: true
          }
        });
        this.rememberAccountSession(identity);
      }
      const payload = await this.accountApiRequest("/api/cloud/profile", {
        method: "POST",
        body: {
          college: profile.college,
          department: profile.department,
          major: profile.major,
          class_name: profile.className,
          entry_grade: profile.grade,
          enrollment_status: profile.enrollmentStatus
        }
      });
      if (profile.realName && this.accountUser) {
        this.accountUser.realName = profile.realName;
        localStorage.setItem(STORAGE.accountUser, JSON.stringify(this.accountUser));
      }
      return payload;
    },
    isSchoolSessionExpired(error) {
      const status = Number(error?.status);
      return status === 401 || status === 901 || /(?:\b901\b|登录状态已失效|会话已失效|请重新登录|login_slogin)/i.test(String(error?.message || ""));
    },
    markSchoolSessionExpired() {
      this.showSchoolReauth = true;
      this.syncForm.password = "";
      this.gradeForm.password = "";
      this.schoolStatus = { type: "offline", text: "需重新验证" };
      return "教务会话已失效，请输入教务密码重新验证后重试";
    },
    schoolRoutesByPreference() {
      return [
        { base: SCHOOL_PUBLIC_BASE, label: "public", step: "正在连接公网教务" },
        { base: SCHOOL_HTTPS_BASE, label: "public-https", step: "正在尝试加密通道" },
        { base: SCHOOL_INTRANET_BASE, label: "intranet", step: "正在尝试校园内网" }
      ];
    },
    async selectSchoolRoute(options = {}) {
      const routes = this.schoolRoutesByPreference();
      let lastError;
      for (const route of routes) {
        try {
          await this.httpRequest("GET", `${route.base}${SCHOOL_LOGIN_PATH}`, {
            responseType: "text",
            connectTimeout: 4500,
            readTimeout: 7000
          });
          if (options.commit !== false) {
            this.schoolBase = route.base;
            this.schoolRoute = route.label;
          }
          this.schoolStatus = { type: "online", text: "网络已连接" };
          return route;
        } catch (error) {
          lastError = error;
        }
      }
      const error = new Error("教务系统当前无法连接，请稍后再试");
      error.status = lastError?.status || 504;
      throw error;
    },
    async checkSchoolStatus() {
      try {
        await this.selectSchoolRoute({ commit: false });
      } catch (_error) {
        this.schoolStatus = { type: "offline", text: "暂不可用" };
      }
    },
    async authenticateSchool(credentials, setStep) {
      // 每次手动输入密码都应从全新的教务会话开始。学校会为登录页下发
      // JSESSIONID 与 route；继续携带上一次退出前的 Cookie 会被某些节点断流。
      await this.clearSchoolSessionCookies();
      const routes = this.schoolRoutesByPreference();
      let lastError;
      for (const route of routes) {
        this.schoolBase = route.base;
        this.schoolRoute = route.label;
        setStep(route.step);
        try {
          await this.authenticateSchoolOnCurrentRoute(credentials, setStep);
          localStorage.setItem(STORAGE.schoolBase, route.base);
          this.schoolStatus = { type: "online", text: "网络已连接" };
          return;
        } catch (error) {
          // Credentials rejected by the school should not be retried against another route.
          if (error.status === 401) throw error;
          lastError = error;
        }
      }
      throw lastError || new Error("教务系统当前无法连接，请稍后再试");
    },
    async clearSchoolSessionCookies() {
      const cookies = window.capacitorExports?.CapacitorCookies;
      if (!cookies) return;
      const bases = [SCHOOL_PUBLIC_BASE, SCHOOL_HTTPS_BASE, SCHOOL_INTRANET_BASE];
      await Promise.all(bases.map(async (base) => {
        try {
          await cookies.clearCookies({ url: base });
        } catch (error) {
          // Cookie 清理失败不应阻止登录；后续请求仍会走网络层重连保护。
          console.warn("清理教务会话失败", base, error);
        }
      }));
    },
    async authenticateSchoolOnCurrentRoute(credentials, setStep) {
      const endpoints = this.schoolEndpoints();
      setStep("正在获取登录信息");
      const loginPage = await this.httpRequest("GET", endpoints.login, {
        headers: { "Accept-Language": "zh-CN,zh;q=0.9" }
      });
      const loginHtml = htmlText(loginPage);
      const csrfMatch = loginHtml.match(/id=["']csrftoken["'][^>]*value=["']([^"']+)["']/i)
        || loginHtml.match(/value=["']([^"']+)["'][^>]*id=["']csrftoken["']/i);
      if (!csrfMatch) throw new Error("教务系统未返回登录令牌，可能正在维护");

      const publicKeyResponse = await this.httpRequest("GET", endpoints.publicKey, {
        params: { time: String(Date.now()) },
        headers: { Referer: endpoints.login }
      });
      const publicKey = responseData(publicKeyResponse);
      if (!publicKey || !publicKey.modulus || !publicKey.exponent) throw new Error("教务系统未返回密码加密公钥");

      setStep("正在安全登录");
      const encryptedPassword = encryptSchoolPassword(credentials.password, publicKey.modulus, publicKey.exponent);
      const loginResponse = await this.httpRequest("POST", `${endpoints.login}?time=${Date.now()}`, {
        data: { csrftoken: csrfMatch[1], yhm: credentials.username, mm: encryptedPassword },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: endpoints.base,
          Referer: endpoints.login
        }
      });
      const loginResultHtml = htmlText(loginResponse);
      if (/id=["']csrftoken["']/i.test(loginResultHtml) || String(loginResponse.url || "").includes("login_slogin")) {
        const tips = loginResultHtml.match(/id=["']tips["'][^>]*>([\s\S]*?)<\//i);
        const error = new Error(tips ? tips[1].replace(/<[^>]+>/g, "").trim() : "账号或密码错误，或教务系统要求验证码");
        error.status = 401;
        throw error;
      }
    },
    async syncFromSchool() {
      if (!this.privacyConsent) {
        this.notify("请先阅读并同意隐私说明", "warning");
        this.privacyVisible = true;
        return;
      }
      if (!this.syncForm.username) {
        this.notify("请填写学号", "warning");
        return;
      }
      this.syncLoading = true;
      this.schoolStatus = { type: "unknown", text: "连接中" };
      try {
        await this.prepareSchoolSession(this.syncForm, step => { this.syncStep = step; });
        const endpoints = this.schoolEndpoints();

        this.syncStep = "正在获取课程";
        const [startYear, _endYear, term] = this.syncForm.semester.split("-");
        const scheduleResponse = await this.httpRequest("POST", endpoints.schedule, {
          responseType: "json",
          data: { xnm: startYear, xqm: term === "1" ? "3" : "12", kzlx: "ck" },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "application/json, text/javascript, */*; q=0.01",
            Origin: endpoints.base,
            Referer: endpoints.scheduleReferer,
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const payload = responseData(scheduleResponse);
        const rawCourses = payload && (payload.kbList || payload.data || []);
        if (!Array.isArray(rawCourses)) {
          const error = new Error("教务登录状态已失效，请重新输入密码后刷新");
          error.status = 401;
          throw error;
        }
        const newCourses = rawCourses.map((course, index) => this.normalizeSchoolCourse(course, index));
        this.courses = newCourses;
        this.persistCourses();
        this.saveSnapshot("教务系统同步", this.syncForm.semester, newCourses);
        // 本机课表已写入后立即返回，资料与云端备份在后台完成，不阻塞用户。
        this.saveCloudCache("courses", this.syncForm.semester, newCourses);
        this.syncStudentProfileForCurrentSession().catch(profileError => {
          console.warn("学籍资料同步稍后重试", profileError);
        });

        localStorage.setItem(STORAGE.username, this.syncForm.username);
        localStorage.setItem(STORAGE.semester, this.syncForm.semester);
        this.syncForm.password = "";
        this.selectedDay = "全部";
        this.schoolStatus = { type: "online", text: "网络已连接" };
        this.notify(`已同步 ${newCourses.length} 门课程`);
        this.activeTab = "schedule";
      } catch (error) {
        const sessionExpired = !this.syncForm.password && this.isSchoolSessionExpired(error);
        this.schoolStatus = { type: "offline", text: sessionExpired ? "需重新验证" : (error.status === 401 ? "登录失败" : "连接失败") };
        const message = sessionExpired
          ? this.markSchoolSessionExpired()
          : error.status === 401
          ? error.message
          : `${error.message || "教务系统当前无法连接"}，本地课表已保留`;
        this.notify(message, "error");
      } finally {
        this.syncLoading = false;
        this.syncStep = "正在连接教务系统";
      }
    },
    async syncGradesFromSchool() {
      const semesterLabel = this.gradeSemesterLabel(this.gradeForm.semester);
      this.gradeLoading = true;
      this.gradeStep = "正在检查已保存的成绩";
      try {
        const cachedGrades = this.grades.filter(grade => this.gradeMatchesSemester(grade, this.gradeForm.semester));
        if (cachedGrades.length) {
          this.selectedGradeSemester = semesterLabel;
          this.gradeSyncVisible = false;
          this.notify(`已显示本地保存的 ${cachedGrades.length} 门成绩`);
          return;
        }
        this.gradeStep = "正在检查云端缓存";
        const cloudCache = await this.loadCloudCache("grades", this.gradeForm.semester);
        if (cloudCache?.data?.length) {
          this.replaceGradesForSemester(this.gradeForm.semester, cloudCache.data);
          this.saveGradeSnapshot(this.gradeForm.semester, cloudCache.data);
          this.selectedGradeSemester = semesterLabel;
          this.gradeSyncVisible = false;
          this.notify(`已从云端缓存读取 ${cloudCache.data.length} 门成绩`);
          return;
        }
        if (!this.privacyConsent) {
          this.notify("请先阅读并同意隐私说明", "warning");
          this.privacyVisible = true;
          return;
        }
        if (!this.gradeForm.username) {
          this.notify("请填写学号", "warning");
          return;
        }
        await this.prepareSchoolSession(this.gradeForm, step => { this.gradeStep = step; });
        this.gradeStep = "正在查询成绩";
        const [startYear, _endYear, term] = this.gradeForm.semester.split("-");
        const rawGrades = await this.fetchSchoolGrades(startYear, term === "1" ? "3" : "12");
        const newGrades = rawGrades.map((grade, index) => this.normalizeSchoolGrade(grade, index));
        this.replaceGradesForSemester(this.gradeForm.semester, newGrades);
        this.saveGradeSnapshot(this.gradeForm.semester, newGrades);
        // 成绩先呈现给用户，云端备份不再拖慢查询完成的反馈。
        this.saveCloudCache("grades", this.gradeForm.semester, newGrades);
        localStorage.setItem(STORAGE.username, this.gradeForm.username);
        localStorage.setItem(STORAGE.semester, this.gradeForm.semester);
        this.gradeForm.password = "";
        this.selectedGradeSemester = this.gradeSemesterLabel(this.gradeForm.semester);
        this.gradeSyncVisible = false;
        this.notify(`已保存 ${newGrades.length} 条成绩`);
      } catch (error) {
        const sessionExpired = !this.gradeForm.password && this.isSchoolSessionExpired(error);
        const message = sessionExpired
          ? this.markSchoolSessionExpired()
          : error.status === 401
          ? error.message
          : `${error.message || "教务系统当前无法连接"}，已保存的成绩不受影响`;
        this.notify(message, "error");
      } finally {
        this.gradeLoading = false;
        this.gradeStep = "正在连接教务系统";
      }
    },
    normalizeSchoolCourse(item, index) {
      const dayMap = { "1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六", "7": "周日" };
      const sections = String(item.jc || item.jcs || "").replace(/[第节\s]/g, "");
      return {
        id: Date.now() + index,
        name: item.kcmc || item.courseName || "未知课程",
        day: dayMap[String(item.xqj || item.weekDay)] || "未知",
        time: sections ? `第 ${sections} 节` : "时间待定",
        location: item.cdmc || item.jxdd || "未安排地点",
        teacher: item.xm || item.jsxm || "未知教师",
        weekRange: item.zcd || item.qsjsz || "未知周次",
        note: "同步自武汉纺织大学外经贸学院教务系统",
        source: "whcibe"
      };
    },
    async fetchSchoolGrades(startYear, term) {
      const endpoints = this.schoolEndpoints();
      const allRows = [];
      let page = 1;
      let total = null;
      const seenPages = new Set();
      while (page <= 30) {
        const response = await this.httpRequest("POST", endpoints.grades, {
          responseType: "json",
          data: {
            xnm: startYear,
            xqm: term,
            sfzgcj: "",
            kcbj: "",
            _search: "false",
            nd: String(Date.now()),
            "queryModel.showCount": "15",
            "queryModel.currentPage": String(page),
            "queryModel.sortName": " ",
            "queryModel.sortOrder": "asc",
            time: "1"
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "application/json, text/javascript, */*; q=0.01",
            Origin: endpoints.base,
            Referer: endpoints.gradesReferer,
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const payload = responseData(response);
        const rows = payload && (payload.items || payload.rows || payload.data || []);
        if (!Array.isArray(rows)) {
          const error = new Error("教务登录状态已失效，请重新输入密码后查询");
          error.status = Number(payload?.status || payload?.code) === 901 ? 901 : 401;
          throw error;
        }
        const pageSignature = rows.map(item => item.key || item.jxb_id || item.kch || JSON.stringify(item)).join("|");
        if (pageSignature && seenPages.has(pageSignature)) break;
        seenPages.add(pageSignature);
        allRows.push(...rows);
        total = Number(payload.records ?? payload.totalCount ?? payload.total) || total;
        if (!rows.length || (total !== null && allRows.length >= total) || rows.length < 15) break;
        page += 1;
      }
      return allRows;
    },
    normalizeSchoolGrade(item, index) {
      const semester = item.xnmmc && item.xqmmc ? `${item.xnmmc} 第${item.xqmmc}学期` : this.gradeSemesterLabel(this.gradeForm.semester);
      return {
        id: `grade-${item.key || item.jxb_id || item.kch || Date.now() + index}`,
        name: item.kcmc || item.courseName || "未知课程",
        semester,
        score: item.cj ?? item.bfzcj ?? item.bfzcj1 ?? "--",
        credit: item.xf ?? "--",
        gpa: item.jd ?? "--",
        courseType: item.kcxzmc || item.kclbmc || "课程成绩",
        examType: item.ksxz || item.khxz || "--",
        teacher: item.jsxm || item.xm || item.rkjs || "教师信息未提供",
        remark: item.cjbz || "",
        components: this.extractGradeComponents(item),
        remote: {
          jxbId: item.jxb_id || item.jxbid || "",
          xnm: item.xnm || "",
          xqm: item.xqm || "",
          kcmc: item.kcmc || "",
          xhId: item.xh_id || ""
        },
        detailFetched: false,
        source: "whcibe"
      };
    },
    extractGradeComponents(item) {
      const fields = [
        ["平时", item.pscj], ["期中", item.qzcj], ["实验", item.sycj], ["期末", item.qmcj], ["总评", item.cj ?? item.bfzcj ?? item.bfzcj1]
      ];
      return fields
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([label, value]) => ({ label, value: String(value), weight: "" }));
    },
    persistGrades() {
      localStorage.setItem(STORAGE.grades, JSON.stringify(this.grades));
      this.database?.saveGrades(this.grades).catch(error => console.warn("成绩写入 SQLite 失败", error));
    },
    gradeSemesterLabel(value) {
      const option = this.semesterOptions.find(item => item.value === value);
      return option ? option.label : value;
    },
    gradeSemesterRequest(value) {
      const [startYear, _endYear, term] = String(value).split("-");
      return { startYear, term: term === "1" ? "3" : "12" };
    },
    gradeMatchesSemester(grade, semesterValue) {
      const expected = this.gradeSemesterRequest(semesterValue);
      const remote = grade.remote || {};
      if (String(remote.xnm || "") === expected.startYear && String(remote.xqm || "") === expected.term) return true;
      return grade.semester === this.gradeSemesterLabel(semesterValue);
    },
    replaceGradesForSemester(semesterValue, grades) {
      this.grades = [...this.grades.filter(grade => !this.gradeMatchesSemester(grade, semesterValue)), ...grades.map(normalizeStoredGrade)];
      this.persistGrades();
    },
    deleteGradesForSemester() {
      if (this.selectedGradeSemester === "全部") {
        this.notify("请先选择要删除的学期", "warning");
        return;
      }
      const semester = this.selectedGradeSemester;
      const semesterOption = this.semesterOptions.find(option => option.label === semester);
      const matchesSemester = grade => semesterOption
        ? this.gradeMatchesSemester(grade, semesterOption.value)
        : grade.semester === semester;
      const count = this.grades.filter(matchesSemester).length;
      if (!count) return;
      if (!window.confirm(`确定删除“${semester}”的全部 ${count} 门成绩吗？删除后可重新查询该学期。`)) return;
      this.grades = this.grades.filter(grade => !matchesSemester(grade));
      this.gradeHistory = this.gradeHistory.filter(record => semesterOption
        ? record.semester !== semesterOption.value
        : this.gradeSemesterLabel(record.semester) !== semester);
      this.persistGrades();
      this.persistGradeHistory();
      this.selectedGradeSemester = "全部";
      this.notify("该学期成绩已删除，可重新查询");
    },
    saveGradeSnapshot(semester, grades) {
      this.gradeHistory.unshift({
        id: Date.now(),
        semester,
        syncedAt: new Date().toISOString(),
        gradeCount: grades.length,
        grades: JSON.parse(JSON.stringify(grades))
      });
      this.gradeHistory = this.gradeHistory.slice(0, 20);
      this.persistGradeHistory();
    },
    async openGrade(grade) {
      this.activeGrade = grade;
      this.gradeDetailVisible = true;
      this.tapFeedback();
      if ((grade.detailFetched && grade.components?.length) || !grade.remote || !grade.remote.jxbId) return;
      this.gradeDetailLoading = true;
      try {
        const detailData = {
          jxb_id: grade.remote.jxbId,
          xnm: grade.remote.xnm,
          xqm: grade.remote.xqm,
          kcmc: grade.remote.kcmc
        };
        if (grade.remote.xhId) detailData.xh_id = grade.remote.xhId;
        const endpoints = this.schoolEndpoints();
        const response = await this.httpRequest("POST", `${endpoints.gradeDetail}?time=${Date.now()}&gnmkdm=N305005`, {
          responseType: "text",
          data: detailData,
          headers: {
            Referer: endpoints.gradeDetailReferer,
            Origin: endpoints.base,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const components = this.parseGradeDetailHtml(htmlText(response));
        if (components.length) grade.components = components;
        grade.detailFetched = components.length > 0;
        this.persistGrades();
      } catch (error) {
        const sessionExpired = !this.gradeForm.password && this.isSchoolSessionExpired(error);
        this.notify(sessionExpired ? this.markSchoolSessionExpired() : `分项成绩读取失败：${error.status || error.message || "教务系统未返回详情"}`, "warning");
      } finally {
        this.gradeDetailLoading = false;
      }
    },
    parseGradeDetailHtml(html) {
      const documentNode = new DOMParser().parseFromString(html, "text/html");
      const components = [];
      const seen = new Set();
      documentNode.querySelectorAll("tr").forEach(row => {
        const cells = [...row.querySelectorAll("th, td")].map(cell => cell.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
        if (cells.length >= 3) {
          const label = cells[0].replace(/[【】\[\]：:]/g, "").trim();
          if (/(平时|期中|期末|实验|作业|课堂|总评|考试)/.test(label) && cells[2] && !seen.has(label)) {
            const weight = cells[1].match(/\d+(?:\.\d+)?\s*%/)?.[0] || "";
            components.push({ label, value: cells[2], weight });
            seen.add(label);
            return;
          }
        }
        for (let index = 0; index + 1 < cells.length; index += 2) {
          const label = cells[index].replace(/[：:]/g, "");
          const value = cells[index + 1];
          if (!/(平时|期中|期末|实验|作业|课堂|总评|考试)/.test(label) || !value || seen.has(label)) continue;
          const weightMatch = `${label} ${value}`.match(/(\d+(?:\.\d+)?)\s*%/);
          components.push({ label, value: value.replace(/\s*\d+(?:\.\d+)?\s*%/, "").trim(), weight: weightMatch ? `${weightMatch[1]}%` : "" });
          seen.add(label);
        }
      });
      return components;
    },
    importFromHtml() {
      if (!this.importHtml.trim()) {
        this.notify("请先粘贴课表页面源码", "warning");
        return;
      }
      const courses = this.parseScheduleHtml(this.importHtml);
      if (!courses.length) {
        this.notify("没有识别到课程，请确认源码完整", "error");
        return;
      }
      this.courses = courses;
      this.persistCourses();
      this.saveSnapshot("课表源码导入", this.syncForm.semester, courses);
      this.importHtml = "";
      this.notify(`已导入 ${courses.length} 门课程`);
      this.activeTab = "schedule";
    },
    parseScheduleHtml(html) {
      const documentNode = new DOMParser().parseFromString(html, "text/html");
      const courses = [];
      documentNode.querySelectorAll("td[id]").forEach(cell => {
        const match = String(cell.id).match(/^([1-7])-(\d+)$/);
        if (!match) return;
        const day = WEEK_DAYS[Number(match[1]) - 1];
        cell.querySelectorAll(".timetable_con").forEach(block => {
          const title = block.querySelector(".title");
          if (!title) return;
          const paragraphs = [...block.querySelectorAll("p")].map(node => node.textContent.trim());
          const sectionWeek = paragraphs[1] || "";
          const sectionMatch = sectionWeek.match(/\(([^)]+节)\)\s*(.+)/);
          courses.push({
            id: Date.now() + courses.length,
            name: title.textContent.trim(),
            day,
            time: sectionMatch ? sectionMatch[1] : `第 ${match[2]} 节`,
            location: paragraphs[2] || "地点待定",
            teacher: paragraphs[3] || "教师待定",
            weekRange: sectionMatch ? sectionMatch[2] : "未知周次",
            note: "从教务课表页面解析导入",
            source: "whcibe"
          });
        });
      });
      return courses;
    },
    persistCourses() {
      localStorage.setItem(STORAGE.courses, JSON.stringify(this.courses));
      this.database?.saveCourses(this.courses).catch(error => console.warn("课程写入 SQLite 失败", error));
    },
    scheduleExportPayload() {
      const courses = this.courses.map(course => ({
        name: String(course.name || "").trim(),
        day: String(course.day || "").trim(),
        time: String(course.time || "").trim(),
        location: String(course.location || "").trim(),
        teacher: String(course.teacher || "").trim(),
        weekRange: String(course.weekRange || "").trim(),
        note: String(course.note || "").trim(),
        source: String(course.source || "shared").trim()
      }));
      return {
        format: "kexu.schedule",
        schemaVersion: 1,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        semester: this.syncForm.semester,
        settings: {
          currentWeek: this.currentWeek,
          periodDuration: this.periodDuration,
          semesterStartDate: this.semesterStartDate
        },
        courses
      };
    },
    bytesToBase64Url(bytes) {
      let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
      }
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    },
    base64UrlToBytes(value) {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const binary = atob(padded);
      return Uint8Array.from(binary, character => character.charCodeAt(0));
    },
    async encodeScheduleCode(payload) {
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      if ("CompressionStream" in window) {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return `KEXU1:${this.bytesToBase64Url(compressed)}`;
      }
      return `KEXU1J:${this.bytesToBase64Url(bytes)}`;
    },
    async decodeScheduleCode(code) {
      const compact = String(code || "").replace(/\s+/g, "");
      if (!compact || compact.length > 120000) throw new Error("课表代码为空或过长");
      let bytes;
      if (compact.startsWith("KEXU1:")) {
        if (!("DecompressionStream" in window)) throw new Error("当前设备无法解压这段课表代码");
        const compressed = this.base64UrlToBytes(compact.slice(6));
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else if (compact.startsWith("KEXU1J:")) {
        bytes = this.base64UrlToBytes(compact.slice(7));
      } else {
        throw new Error("课表代码应以 KEXU1: 开头");
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    async generateScheduleCode() {
      if (!this.courses.length) {
        this.notify("当前没有可导出的课程", "warning");
        return;
      }
      this.transferBusy = true;
      try {
        this.transferCode = await this.encodeScheduleCode(this.scheduleExportPayload());
        this.notify("课表代码已生成");
      } catch (error) {
        this.notify(error.message || "课表代码生成失败", "error");
      } finally {
        this.transferBusy = false;
      }
    },
    async prepareSchoolSession(credentials, setStep) {
      if (credentials.password) {
        await this.authenticateSchool(credentials, setStep);
        return;
      }
      this.schoolBase = localStorage.getItem(STORAGE.schoolBase) || this.schoolBase || SCHOOL_PUBLIC_BASE;
      setStep("正在使用已验证的教务会话");
    },
    async copyScheduleCode() {
      if (!this.transferCode) return;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(this.transferCode);
        else {
          const textarea = this.$refs.transferCodeOutput;
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
        }
        this.notify("课表代码已复制");
      } catch (_error) {
        this.notify("复制失败，请长按代码手动复制", "warning");
      }
    },
    async shareScheduleCode() {
      if (!this.transferCode) return;
      if (!navigator.share) {
        await this.copyScheduleCode();
        return;
      }
      try {
        await navigator.share({ title: "课序课表代码", text: this.transferCode });
      } catch (error) {
        if (error?.name !== "AbortError") this.notify("分享失败，可复制代码后发送", "warning");
      }
    },
    sanitizeImportedCourses(courses) {
      if (!Array.isArray(courses) || courses.length > 300) return [];
      const now = Date.now();
      return courses
        .map((course, index) => ({
          id: now + index,
          name: String(course?.name || "").trim().slice(0, 80),
          day: String(course?.day || "").trim(),
          time: String(course?.time || "").trim().slice(0, 40),
          location: String(course?.location || "地点待定").trim().slice(0, 100),
          teacher: String(course?.teacher || "教师待定").trim().slice(0, 60),
          weekRange: String(course?.weekRange || "未知周次").trim().slice(0, 120),
          note: String(course?.note || "从课序分享代码导入").trim().slice(0, 160),
          source: "kexu-share"
        }))
        .filter(course => course.name && WEEK_DAYS.includes(course.day) && course.time);
    },
    async importScheduleCode() {
      if (!this.transferImportCode.trim()) {
        this.notify("请先粘贴课表代码", "warning");
        return;
      }
      this.transferBusy = true;
      try {
        const payload = await this.decodeScheduleCode(this.transferImportCode);
        if (payload?.format !== "kexu.schedule" || Number(payload.schemaVersion) !== 1) {
          throw new Error("这不是有效的课序课表代码");
        }
        const courses = this.sanitizeImportedCourses(payload.courses);
        if (!courses.length || courses.length !== payload.courses.length) {
          throw new Error("课表代码中的课程数据不完整");
        }
        const semester = /^\d{4}-\d{4}-[12]$/.test(String(payload.semester || ""))
          ? String(payload.semester)
          : this.syncForm.semester;
        if (!window.confirm(`导入“${semester}”的 ${courses.length} 门课程？当前课表将自动备份后被替换。`)) return;

        if (this.courses.length) this.saveSnapshot("代码导入前自动备份", this.syncForm.semester, this.courses);
        this.courses = courses;
        this.syncForm.semester = semester;
        localStorage.setItem(STORAGE.semester, semester);

        const settings = payload.settings || {};
        const importedWeek = Number(settings.currentWeek);
        if (Number.isInteger(importedWeek) && importedWeek >= 1 && importedWeek <= 30) {
          this.currentWeek = importedWeek;
          this.selectedWeek = importedWeek;
          localStorage.setItem(STORAGE.currentWeek, String(importedWeek));
          localStorage.setItem(STORAGE.selectedWeek, String(importedWeek));
        }
        const importedDuration = Number(settings.periodDuration);
        if (Number.isInteger(importedDuration) && importedDuration >= 30 && importedDuration <= 60) {
          this.periodDuration = importedDuration;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(settings.semesterStartDate || ""))) {
          this.semesterStartDate = settings.semesterStartDate;
        }

        this.persistCourses();
        this.saveSnapshot("课序代码导入", semester, courses);
        this.transferImportCode = "";
        this.transferVisible = false;
        this.activeTab = "schedule";
        this.notify(`已离线导入 ${courses.length} 门课程`);
      } catch (error) {
        this.notify(error.message || "课表代码解析失败", "error");
      } finally {
        this.transferBusy = false;
      }
    },
    saveSnapshot(source, semester, courses) {
      this.syncHistory.unshift({
        id: Date.now(),
        source,
        semester,
        syncedAt: new Date().toISOString(),
        courseCount: courses.length,
        courses: JSON.parse(JSON.stringify(courses))
      });
      this.syncHistory = this.syncHistory.slice(0, 20);
      this.persistSyncHistory();
    },
    restoreSnapshot(record) {
      if (!record.courses || !record.courses.length) {
        this.notify("这条旧记录没有可恢复的课表数据", "warning");
        return;
      }
      if (!window.confirm(`恢复 ${this.formatDate(record.syncedAt)} 的课表？`)) return;
      this.courses = JSON.parse(JSON.stringify(record.courses));
      this.persistCourses();
      this.notify("课表已恢复");
      this.activeTab = "schedule";
    },
    getCourseWeeks(course) {
      const source = String(course.weekRange || "").replace(/第|周|\s/g, "");
      const result = new Set();
      const segments = source.split(/[,，、]/).filter(Boolean);
      segments.forEach(segment => {
        const parity = /单/.test(segment) ? 1 : /双/.test(segment) ? 0 : null;
        const numbers = segment.match(/\d+/g);
        if (!numbers) return;
        const start = Number(numbers[0]);
        const end = Number(numbers[1] || numbers[0]);
        for (let week = start; week <= end; week += 1) {
          if (parity === null || week % 2 === parity) result.add(week);
        }
      });
      return [...result].sort((a, b) => a - b);
    },
    getCourseSections(course) {
      const match = String(course.time || "").match(/(\d+)(?:\s*-\s*(\d+))?/);
      if (!match) return null;
      return { start: Number(match[1]), end: Number(match[2] || match[1]) };
    },
    findCourseConflicts(candidate) {
      const candidateSections = this.getCourseSections(candidate);
      const candidateWeeks = new Set(this.getCourseWeeks(candidate));
      if (!candidateSections || !candidateWeeks.size) return [];
      return this.courses.filter(course => {
        if (course.id === candidate.id || course.day !== candidate.day) return false;
        const sections = this.getCourseSections(course);
        if (!sections || sections.end < candidateSections.start || sections.start > candidateSections.end) return false;
        return this.getCourseWeeks(course).some(week => candidateWeeks.has(week));
      });
    },
    isCourseScheduledForWeek(course, week) {
      const weeks = this.getCourseWeeks(course);
      return !weeks.length || weeks.includes(Number(week));
    },
    isCourseFinished(course) {
      const weeks = this.getCourseWeeks(course);
      return weeks.length > 0 && this.currentWeek > weeks[weeks.length - 1];
    },
    normalizeWeekRange(value) {
      const text = String(value || "未知周次").trim();
      if (text.includes("周")) return text.startsWith("第") ? text : `第 ${text}`;
      return text === "未知周次" ? text : `第 ${text} 周`;
    },
    formatCourseTime(value) {
      const cleaned = String(value || "时间待定").replace(/[第节\s]/g, "");
      return /\d/.test(cleaned) ? `第 ${cleaned} 节` : value;
    },
    firstSection(value) {
      const match = String(value || "").match(/\d+/);
      return match ? Number(match[0]) : 99;
    },
    courseMinuteRange(value) {
      const sections = String(value || "").match(/\d+/g);
      if (!sections || !sections.length) return null;
      const first = Number(sections[0]);
      const last = Number(sections[sections.length - 1]);
      const firstTime = this.sectionTimes.find(item => item.section === first);
      const lastTime = this.sectionTimes.find(item => item.section === last);
      if (!firstTime || !lastTime) return null;
      return { start: clockToMinutes(firstTime.start), end: clockToMinutes(lastTime.end) };
    },
    formatCourseClock(value) {
      const range = this.courseMinuteRange(value);
      return range ? `${minutesToClock(range.start)}-${minutesToClock(range.end)}` : "时间待定";
    },
    shortCourseTime(value) {
      const sections = String(value || "").match(/\d+/g);
      return sections && sections.length ? `${sections[0]}-${sections[sections.length - 1]}节` : "待定";
    },
    toggleScheduleView() {
      this.scheduleView = this.scheduleView === "grid" ? "list" : "grid";
      this.tapFeedback();
    },
    courseGridStyle(course) {
      const dayIndex = WEEK_DAYS.indexOf(course.day);
      const sections = String(course.time || "").match(/\d+/g);
      if (dayIndex < 0 || !sections || !sections.length) return { display: "none" };
      const first = Math.min(12, Math.max(1, Number(sections[0])));
      const last = Math.min(12, Math.max(first, Number(sections[sections.length - 1])));
      const seed = [...String(course.name || course.id)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
      const palette = COURSE_PALETTES[seed % COURSE_PALETTES.length];
      return {
        gridColumn: dayIndex + 2,
        gridRow: `${first + 1} / ${last + 2}`,
        "--course-bg": palette[0],
        "--course-text": palette[1],
        "--course-border": palette[2]
      };
    },
    shortLocation(value) {
      const text = String(value || "地点待定").trim();
      return text.length > 12 ? `${text.slice(0, 12)}…` : text;
    },
    openSemesterSheet(target) {
      this.semesterSheetTarget = target;
      const selected = target === "grade" ? this.gradeForm.semester : this.syncForm.semester;
      const [startYear, _endYear, term] = String(selected || defaultSemester()).split("-").map(Number);
      this.semesterWheelYear = this.semesterYears.includes(startYear) ? startYear : currentAcademicYearStart();
      this.semesterWheelTerm = term === 2 ? 2 : 1;
      this.semesterSheetVisible = true;
      this.$nextTick(() => {
        this.scrollSemesterWheelTo("year", this.semesterWheelYear, false);
        this.scrollSemesterWheelTo("term", this.semesterWheelTerm, false);
      });
    },
    scrollSemesterWheelTo(type, value, smooth = true) {
      const wheel = type === "year" ? this.$refs.semesterYearWheel : this.$refs.semesterTermWheel;
      if (!wheel) return;
      const item = wheel.querySelector(`[data-wheel-value="${value}"]`);
      if (!item) return;
      wheel.scrollTo({
        top: item.offsetTop - wheel.offsetTop - (wheel.clientHeight - item.offsetHeight) / 2,
        behavior: smooth ? "smooth" : "auto"
      });
    },
    setSemesterWheel(type, value) {
      if (type === "year") this.semesterWheelYear = Number(value);
      else this.semesterWheelTerm = Number(value);
      this.scrollSemesterWheelTo(type, value);
      this.tapFeedback();
    },
    onSemesterWheelScroll(type, event) {
      const wheel = event.currentTarget;
      const center = wheel.scrollTop + wheel.clientHeight / 2;
      const items = [...wheel.querySelectorAll("[data-wheel-value]")];
      const closest = items.reduce((best, item) => {
        const distance = Math.abs(item.offsetTop - wheel.offsetTop + item.offsetHeight / 2 - center);
        return !best || distance < best.distance ? { item, distance } : best;
      }, null);
      if (!closest) return;
      const value = Number(closest.item.dataset.wheelValue);
      if (type === "year") this.semesterWheelYear = value;
      else this.semesterWheelTerm = value;
      clearTimeout(this.semesterWheelScrollTimer);
      this.semesterWheelScrollTimer = setTimeout(() => this.scrollSemesterWheelTo(type, value), 90);
    },
    confirmSemesterWheel() {
      this.selectSemester(`${this.semesterWheelYear}-${this.semesterWheelYear + 1}-${this.semesterWheelTerm}`);
    },
    selectSemester(value) {
      if (this.semesterSheetTarget === "grade") this.gradeForm.semester = value;
      else {
        this.syncForm.semester = value;
        this.restoreCloudCoursesForSemester(value);
      }
      localStorage.setItem(STORAGE.semester, value);
      this.semesterSheetVisible = false;
      this.tapFeedback();
    },
    async restoreCloudCoursesForSemester(semester) {
      const cache = await this.loadCloudCache("courses", semester);
      if (!cache) return;
      this.courses = cache.data || [];
      this.persistCourses();
      this.saveSnapshot("云端缓存恢复", semester, this.courses);
      this.notify(`已读取该学期云端缓存（${this.courses.length} 门课程）`);
    },
    getDayCount(day) {
      return this.coursesForSelectedWeek.filter(course => course.day === day).length;
    },
    changeWeek(step) {
      this.selectedWeek = Math.min(30, Math.max(1, this.selectedWeek + step));
      this.tapFeedback();
    },
    openAllCourses() {
      this.selectedDay = "全部";
      this.openTab("allCourses");
    },
    openWeekSheet(mode) {
      this.weekSheetMode = mode;
      this.weekSheetVisible = true;
    },
    selectWeek(week) {
      if (this.weekSheetMode === "current") {
        this.currentWeek = week;
        localStorage.setItem(STORAGE.currentWeek, String(week));
      } else {
        this.selectedWeek = week;
      }
      this.weekSheetVisible = false;
      this.tapFeedback();
    },
    openCourse(course) {
      this.activeCourse = course;
      this.detailVisible = true;
      this.tapFeedback();
    },
    openAddCourse() {
      this.courseForm = {
        name: "",
        day: this.selectedDay === "全部" ? this.todayLabel : this.selectedDay,
        time: "第 1-2 节",
        location: "",
        weekRange: `${this.currentWeek}-16周`
      };
      this.addVisible = true;
    },
    addCourse() {
      if (!this.courseForm.name || !this.courseForm.day || !this.courseForm.time) {
        this.notify("请填写课程名称、星期和节次", "warning");
        return;
      }
      const course = {
        id: Date.now(),
        ...this.courseForm,
        teacher: "教师待定",
        note: "手动添加",
        source: "manual"
      };
      const conflicts = this.findCourseConflicts(course);
      if (conflicts.length) {
        const names = conflicts.slice(0, 2).map(item => item.name).join("、");
        const more = conflicts.length > 2 ? "等" : "";
        if (!window.confirm(`该课程与 ${names}${more} 的时间和周次重叠，仍要添加吗？`)) return;
      }
      this.courses.push(course);
      this.persistCourses();
      this.addVisible = false;
      this.notify(conflicts.length ? "课程已添加，存在时间冲突" : "课程已添加", conflicts.length ? "warning" : "success");
    },
    deleteCourse(id) {
      if (!window.confirm("确定删除这门课程吗？")) return;
      this.courses = this.courses.filter(course => course.id !== id);
      this.persistCourses();
      this.detailVisible = false;
      this.notify("课程已删除");
    },
    clearCourses() {
      if (!this.courses.length) {
        this.notify("当前没有课程", "info");
        return;
      }
      if (!window.confirm("确定清空当前全部课程吗？同步记录仍会保留。")) return;
      this.courses = [];
      this.persistCourses();
      this.notify("课程已清空");
    },
    resetPreferences() {
      if (!window.confirm("恢复默认外观和交互设置吗？课程数据不会受影响。")) return;
      this.themeMode = "system";
      this.accentColor = "#2577f5";
      this.homeScope = "today";
      this.showWeekends = true;
      this.compactCards = false;
      this.bounceEnabled = false;
      this.liquidGlassEnabled = false;
      this.bottomNavGlassEnabled = false;
      this.bottomNavClearGlassEnabled = false;
      this.hapticsEnabled = true;
      this.periodDuration = DEFAULT_PERIOD_DURATION;
      this.reminderEnabled = false;
      this.reminderMinutes = 10;
      this.semesterStartDate = "";
      this.notify("已恢复默认设置");
    },
    adjustPeriodDuration(step) {
      this.periodDuration = Math.min(60, Math.max(30, this.periodDuration + step));
      this.tapFeedback();
    },
    calculateWeekFromDate(startDateStr) {
      return calculateCurrentWeekFromStartDate(startDateStr, this.currentWeek);
    },
    onSemesterStartDateChange(newDate) {
      const trimmed = String(newDate || "").trim();
      if (!trimmed) {
        this.semesterStartDate = "";
        localStorage.removeItem(STORAGE.semesterStartDate);
        this.notify("已清除第一周指定日期");
        return;
      }
      this.semesterStartDate = trimmed;
      localStorage.setItem(STORAGE.semesterStartDate, trimmed);
      const calculatedWeek = this.calculateWeekFromDate(trimmed);
      this.currentWeek = calculatedWeek;
      this.selectedWeek = calculatedWeek;
      localStorage.setItem(STORAGE.currentWeek, String(calculatedWeek));
      localStorage.setItem(STORAGE.selectedWeek, String(calculatedWeek));
      this.notify(`已将 ${trimmed} 所在周设为第 1 周（当前为第 ${calculatedWeek} 周）`);
      if (this.reminderEnabled) {
        this.scheduleCourseReminders().catch(() => {});
      }
    },
    formatDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "时间未知";
      return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    }
  }
}).use(ElementPlus).mount("#app");
