const { createApp } = Vue;

const SCHOOL_BASE = "https://jw.whcibe.com";
const LOGIN_URL = `${SCHOOL_BASE}/xtgl/login_slogin.html`;
const PUBKEY_URL = `${SCHOOL_BASE}/xtgl/login_getPublicKey.html`;
const SCHEDULE_URL = `${SCHOOL_BASE}/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151`;
const SCHEDULE_REFERER = `${SCHOOL_BASE}/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151`;
const GRADE_URL = `${SCHOOL_BASE}/cjcx/cjcx_cxXsgrcj.html?doType=query`;
const GRADE_REFERER = `${SCHOOL_BASE}/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005`;
const GRADE_DETAIL_URL = "http://jw.whcibe.com/cjcx/cjcx_cxCjxqGjh.html";
const GRADE_DETAIL_REFERER = "http://jw.whcibe.com/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005&layout=default";
const APP_VERSION = "0.9.4-stable";
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
  username: "campusflow-school-username",
  semester: "campusflow-school-semester",
  privacyConsent: "campusflow-privacy-consent"
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

function defaultSemester() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return `${year}-${year + 1}-1`;
  return `${year - 1}-${year}-2`;
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
      tabs: [
        { value: "schedule", label: "首页", icon: "House" },
        { value: "allCourses", label: "课表", icon: "CalendarDays" },
        { value: "grades", label: "成绩", icon: "ChartNoAxesCombined" },
        { value: "settings", label: "我的", icon: "UserRound" }
      ],
      activeTab: "schedule",
      weekDays: WEEK_DAYS,
      selectedDay: "全部",
      currentWeek: Number(localStorage.getItem(STORAGE.currentWeek)) || 1,
      selectedWeek: Number(localStorage.getItem(STORAGE.selectedWeek)) || Number(localStorage.getItem(STORAGE.currentWeek)) || 1,
      weekSheetVisible: false,
      weekSheetMode: "view",
      semesterSheetVisible: false,
      semesterSheetTarget: "course",
      privacyVisible: false,
      detailVisible: false,
      gradeDetailVisible: false,
      addVisible: false,
      activeCourse: null,
      activeGrade: null,
      courses: readJson(STORAGE.courses, []),
      syncHistory: readJson(STORAGE.history, []),
      grades: readJson(STORAGE.grades, []),
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
      backButtonListener: null,
      showPassword: false,
      privacyConsent: localStorage.getItem(STORAGE.privacyConsent) === "true",
      tabTransitioning: false,
      tabTransitionTimer: null,
      suppressTabTransition: false,
      syncLoading: false,
      syncStep: "正在连接教务系统",
      gradeLoading: false,
      gradeStep: "正在连接教务系统",
      schoolStatus: { type: "unknown", text: "等待连接" },
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
    weekCalendarDays() {
      const today = new Date();
      const weekday = today.getDay() || 7;
      const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday + 1);
      monday.setDate(monday.getDate() + (this.selectedWeek - this.currentWeek) * 7);
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
      const currentYear = new Date().getFullYear();
      const options = [];
      for (let start = currentYear; start >= currentYear - 4; start -= 1) {
        options.push({ value: `${start}-${start + 1}-1`, label: `${start}-${start + 1} 学年 第一学期` });
        options.push({ value: `${start}-${start + 1}-2`, label: `${start}-${start + 1} 学年 第二学期` });
      }
      return options;
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
    this.initializePersistentStorage();
    this.checkSchoolStatus();
  },
  beforeUnmount() {
    window.onNativeBackEvent = null;
    window.onKexuUpdateEvent = null;
    document.body.classList.remove("liquid-glass", "nav-glass", "nav-clear-glass");
    if (this.backButtonListener) this.backButtonListener.remove();
    if (this.tabTransitionTimer) clearTimeout(this.tabTransitionTimer);
    if (!this.systemThemeQuery) return;
    if (this.systemThemeQuery.removeEventListener) this.systemThemeQuery.removeEventListener("change", this.applyTheme);
    else this.systemThemeQuery.removeListener(this.applyTheme);
  },
  methods: {
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
      if (this.activeTab === tab) return;
      this.activeTab = tab;
      this.tapFeedback();
    },
    returnToHome() {
      if (this.activeTab === "schedule") return;
      this.suppressTabTransition = true;
      this.activeTab = "schedule";
      this.tapFeedback();
    },
    async setupNativeBackButton() {
      if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;
      this.nativeApp = window.capacitorExports.registerPlugin("App");
      this.backButtonListener = await this.nativeApp.addListener("backButton", () => {
        if (!window.__kexuNativeBackBridge) this.handleBackButton();
      });
    },
    handleBackButton() {
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
        this.grades = loaded.grades;
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
    async checkForUpdate() {
      if (this.updateChecking) return;
      this.updateChecking = true;
      this.updateStatusText = "正在检查最新版本";
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
        const release = (releases || []).find(item => (item.assets || []).some(asset => String(asset.name).endsWith(".apk")));
        const asset = (release?.assets || []).find(item => String(item.name).endsWith(".apk"));
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
        this.updateChecking = false;
        if (this.isNewerVersion(payload.version)) {
          this.updateInfo = payload;
          this.updateStatusText = "已找到可安装的新版本";
        } else {
          this.updateInfo = null;
          this.updateStatusText = "当前已是最新版本";
          this.notify("当前已是最新版本", "success");
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
        this.updateChecking = false;
        this.updateDownloading = false;
        this.updateStatusText = "检查更新失败";
        this.notify(`更新失败：${payload.message || "未知错误"}`, "error");
      }
    },
    startAppUpdate() {
      if (!this.updateInfo?.downloadUrl) return;
      if (!window.confirm(`下载并安装 ${this.updateInfo.version} 吗？`)) return;
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
        connectTimeout: 10000,
        readTimeout: 22000,
        responseType: options.responseType || "text",
        headers: options.headers || {},
        params: options.params,
        data: options.data
      };
      const response = await http.request(request);
      if (response.status < 200 || response.status >= 400) {
        const error = new Error(`教务系统返回异常（${response.status}）`);
        error.status = response.status;
        throw error;
      }
      return response;
    },
    async checkSchoolStatus() {
      try {
        await this.httpRequest("GET", LOGIN_URL, { responseType: "text" });
        this.schoolStatus = { type: "online", text: "可连接" };
      } catch (_error) {
        this.schoolStatus = { type: "offline", text: "暂不可用" };
      }
    },
    async authenticateSchool(credentials, setStep) {
      const cookies = window.capacitorExports && window.capacitorExports.CapacitorCookies;
      if (cookies) await cookies.clearAllCookies();

      setStep("正在获取登录信息");
      const loginPage = await this.httpRequest("GET", LOGIN_URL, {
        headers: { "Accept-Language": "zh-CN,zh;q=0.9" }
      });
      const loginHtml = htmlText(loginPage);
      const csrfMatch = loginHtml.match(/id=["']csrftoken["'][^>]*value=["']([^"']+)["']/i)
        || loginHtml.match(/value=["']([^"']+)["'][^>]*id=["']csrftoken["']/i);
      if (!csrfMatch) throw new Error("教务系统未返回登录令牌，可能正在维护");

      const publicKeyResponse = await this.httpRequest("GET", PUBKEY_URL, {
        params: { time: String(Date.now()) },
        headers: { Referer: LOGIN_URL }
      });
      const publicKey = responseData(publicKeyResponse);
      if (!publicKey || !publicKey.modulus || !publicKey.exponent) throw new Error("教务系统未返回密码加密公钥");

      setStep("正在安全登录");
      const encryptedPassword = encryptSchoolPassword(credentials.password, publicKey.modulus, publicKey.exponent);
      const loginResponse = await this.httpRequest("POST", `${LOGIN_URL}?time=${Date.now()}`, {
        data: { csrftoken: csrfMatch[1], yhm: credentials.username, mm: encryptedPassword },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: SCHOOL_BASE,
          Referer: LOGIN_URL
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
      if (!this.syncForm.username || !this.syncForm.password) {
        this.notify("请填写学号和密码", "warning");
        return;
      }
      this.syncLoading = true;
      this.schoolStatus = { type: "unknown", text: "连接中" };
      try {
        await this.authenticateSchool(this.syncForm, step => { this.syncStep = step; });

        this.syncStep = "正在获取课程";
        const [startYear, _endYear, term] = this.syncForm.semester.split("-");
        const scheduleResponse = await this.httpRequest("POST", SCHEDULE_URL, {
          responseType: "json",
          data: { xnm: startYear, xqm: term === "1" ? "3" : "12", kzlx: "ck" },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "application/json, text/javascript, */*; q=0.01",
            Origin: SCHOOL_BASE,
            Referer: SCHEDULE_REFERER,
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const payload = responseData(scheduleResponse);
        const rawCourses = payload && (payload.kbList || payload.data || []);
        if (!Array.isArray(rawCourses)) throw new Error("教务系统返回了无法识别的课表数据");
        const newCourses = rawCourses.map((course, index) => this.normalizeSchoolCourse(course, index));
        if (newCourses.length) {
          this.courses = newCourses;
          this.persistCourses();
          this.saveSnapshot("教务系统直接同步", this.syncForm.semester, newCourses);
        }

        localStorage.setItem(STORAGE.username, this.syncForm.username);
        localStorage.setItem(STORAGE.semester, this.syncForm.semester);
        this.syncForm.password = "";
        this.selectedDay = "全部";
        this.schoolStatus = { type: "online", text: "同步成功" };
        this.notify(`已同步 ${newCourses.length} 门课程`);
        this.activeTab = "schedule";
      } catch (error) {
        this.schoolStatus = { type: "offline", text: error.status === 401 ? "登录失败" : "连接失败" };
        const message = error.status === 401
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
      const cachedGrades = this.grades.filter(grade => this.gradeMatchesSemester(grade, this.gradeForm.semester));
      if (cachedGrades.length) {
        this.selectedGradeSemester = semesterLabel;
        this.gradeSyncVisible = false;
        this.notify(`已显示本地保存的 ${cachedGrades.length} 门成绩`);
        return;
      }
      if (!this.privacyConsent) {
        this.notify("请先阅读并同意隐私说明", "warning");
        this.privacyVisible = true;
        return;
      }
      if (!this.gradeForm.username || !this.gradeForm.password) {
        this.notify("请填写学号和密码", "warning");
        return;
      }
      this.gradeLoading = true;
      try {
        await this.authenticateSchool(this.gradeForm, step => { this.gradeStep = step; });
        this.gradeStep = "正在查询成绩";
        const [startYear, _endYear, term] = this.gradeForm.semester.split("-");
        const rawGrades = await this.fetchSchoolGrades(startYear, term === "1" ? "3" : "12");
        const newGrades = rawGrades.map((grade, index) => this.normalizeSchoolGrade(grade, index));
        this.replaceGradesForSemester(this.gradeForm.semester, newGrades);
        this.saveGradeSnapshot(this.gradeForm.semester, newGrades);
        localStorage.setItem(STORAGE.username, this.gradeForm.username);
        localStorage.setItem(STORAGE.semester, this.gradeForm.semester);
        this.gradeForm.password = "";
        this.selectedGradeSemester = this.gradeSemesterLabel(this.gradeForm.semester);
        this.gradeSyncVisible = false;
        this.notify(`已保存 ${newGrades.length} 条成绩`);
      } catch (error) {
        const message = error.status === 401 ? error.message : `${error.message || "教务系统当前无法连接"}，已保存的成绩不受影响`;
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
      const allRows = [];
      let page = 1;
      let total = null;
      const seenPages = new Set();
      while (page <= 30) {
        const response = await this.httpRequest("POST", GRADE_URL, {
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
            Origin: SCHOOL_BASE,
            Referer: GRADE_REFERER,
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const payload = responseData(response);
        const rows = payload && (payload.items || payload.rows || payload.data || []);
        if (!Array.isArray(rows)) throw new Error("教务系统返回了无法识别的成绩数据");
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
      this.grades = [...this.grades.filter(grade => !this.gradeMatchesSemester(grade, semesterValue)), ...grades];
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
        const response = await this.httpRequest("POST", `${GRADE_DETAIL_URL}?time=${Date.now()}&gnmkdm=N305005`, {
          responseType: "text",
          data: detailData,
          headers: {
            Referer: GRADE_DETAIL_REFERER,
            Origin: "http://jw.whcibe.com",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const components = this.parseGradeDetailHtml(htmlText(response));
        if (components.length) grade.components = components;
        grade.detailFetched = components.length > 0;
        this.persistGrades();
      } catch (error) {
        this.notify(`分项成绩读取失败：${error.status || error.message || "教务系统未返回详情"}`, "warning");
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
    selectSemester(value) {
      if (this.semesterSheetTarget === "grade") this.gradeForm.semester = value;
      else this.syncForm.semester = value;
      localStorage.setItem(STORAGE.semester, value);
      this.semesterSheetVisible = false;
      this.tapFeedback();
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
