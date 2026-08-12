const DEFAULT_SERVER = "http://47.122.105.185";
const state = {
  base: localStorage.getItem("kexu-admin-server") || DEFAULT_SERVER,
  authorization: "",
  username: "",
  users: [],
  filter: "all",
  selectedUser: null,
  loadingUsers: false,
  loadController: null,
  activeOverlay: ""
};

const loginView = document.querySelector("#loginView");
const dashboardView = document.querySelector("#dashboardView");
const loginError = document.querySelector("#loginError");
const dashboardError = document.querySelector("#dashboardError");
const loginStatus = document.querySelector("#loginStatus");
const refreshStatus = document.querySelector("#refreshStatus");
const serverUrl = document.querySelector("#serverUrl");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const loginButton = document.querySelector("#loginButton");
const refreshButton = document.querySelector("#refreshButton");
const users = document.querySelector("#users");
const passwordModal = document.querySelector("#passwordModal");
const newPassword = document.querySelector("#newPassword");
const confirmPassword = document.querySelector("#confirmPassword");
const passwordError = document.querySelector("#passwordError");
const userDetailModal = document.querySelector("#userDetailModal");
const userDetailContent = document.querySelector("#userDetailContent");

serverUrl.value = state.base;

function normaliseBase(value) {
  return value.trim().replace(/\/+$/, "");
}

function authHeader() {
  return { Authorization: `Basic ${state.authorization}` };
}

function messageFrom(response, fallback) {
  return response.json().then((body) => body.detail || fallback).catch(() => fallback);
}

function requestError(error, fallback) {
  if (error?.name === "AbortError") return new Error("服务响应较慢，请检查网络后重试");
  if (/cleartext|network|failed to fetch/i.test(String(error?.message || ""))) return new Error("无法连接账号服务，请确认网络正常后重试");
  return error instanceof Error ? error : new Error(fallback);
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 7000);
  try {
    const headers = { ...authHeader(), ...(options.headers || {}) };
    const url = `${state.base}${path}`;
    const nativeHttp = window.Capacitor?.isNativePlatform() && window.capacitorExports?.CapacitorHttp;
    if (nativeHttp) {
      const response = await nativeHttp.request({
        url,
        method: options.method || "GET",
        headers,
        data: options.body ? JSON.parse(options.body) : undefined,
        responseType: "json",
        connectTimeout: options.timeout || 7000,
        readTimeout: options.timeout || 7000
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(response.data?.detail || "请求失败");
      }
      return response.data;
    }
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    if (!response.ok) throw new Error(await messageFrom(response, "请求失败"));
    return response.json();
  } catch (error) {
    throw requestError(error, "请求失败");
  } finally {
    clearTimeout(timeout);
  }
}

function setButtonLoading(button, loading, loadingText, normalText) {
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function setStats(counts) {
  document.querySelector("#totalCount").textContent = counts.total;
  document.querySelector("#activeCount").textContent = counts.active;
  document.querySelector("#disabledCount").textContent = counts.disabled;
  document.querySelector("#deletedCount").textContent = counts.deleted;
  document.querySelector("#onlineCount").textContent = counts.online || 0;
}

function statusLabel(status) {
  return { active: "正常", disabled: "停用", deleted: "已注销" }[status] || status;
}

function formatDate(value) {
  if (!value) return "尚未记录";
  return `${value}（中国标准时间）`;
}

function renderUsers(items) {
  users.replaceChildren();
  const visibleItems = items.filter((user) => state.filter === "all" || (state.filter === "online" ? user.online : user.status === state.filter));
  if (!visibleItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有符合条件的学生账号";
    users.append(empty);
    return;
  }
  for (const user of visibleItems) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "user";
    const header = document.createElement("div");
    header.className = "user-head";
    const title = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = user.real_name;
    const account = document.createElement("div");
    account.className = "account";
    account.textContent = `学号 ${user.student_id || user.account}`;
    title.append(name, account);
    const status = document.createElement("span");
    status.className = `status ${user.status}`;
    status.textContent = user.online ? "在线" : statusLabel(user.status);
    header.append(title, status);
    const meta = document.createElement("div");
    meta.className = "user-summary";
    meta.textContent = [user.college, user.department, user.major, user.class_name, user.entry_grade && `${user.entry_grade}级`, user.enrollment_status].filter(Boolean).join(" · ") || "个人学籍资料尚未同步";
    const main = document.createElement("div");
    main.className = "user-main";
    main.append(header, meta);
    const arrow = document.createElement("span");
    arrow.className = "user-arrow";
    arrow.textContent = "›";
    card.append(main, arrow);
    card.addEventListener("click", () => openUserDetail(user));
    users.append(card);
  }
}

function detailItem(label, value, wide = false) {
  const item = document.createElement("div");
  item.className = `detail-item${wide ? " wide" : ""}`;
  const caption = document.createElement("span");
  caption.textContent = label;
  const text = document.createElement("strong");
  text.textContent = value || "未同步";
  item.append(caption, text);
  return item;
}

function showOverlay(name) {
  state.activeOverlay = name;
  (name === "detail" ? userDetailModal : passwordModal).classList.remove("hidden");
}

function closeOverlay() {
  if (!state.activeOverlay) return false;
  userDetailModal.classList.add("hidden");
  passwordModal.classList.add("hidden");
  state.activeOverlay = "";
  return true;
}

function openUserDetail(user) {
  state.selectedUser = user;
  document.querySelector("#userDetailTitle").textContent = user.real_name || "学生资料";
  document.querySelector("#userDetailSubtitle").textContent = `学号 ${user.student_id || user.account} · ${user.online ? "当前在线" : statusLabel(user.status)}`;
  userDetailContent.replaceChildren(
    detailItem("学院", user.college), detailItem("专业", user.major),
    detailItem("班级", user.class_name), detailItem("年级", user.entry_grade && `${user.entry_grade} 级`),
    detailItem("学籍状态", user.enrollment_status), detailItem("账号状态", user.online ? "在线" : statusLabel(user.status)),
    detailItem("注册时间", formatDate(user.created_at), true), detailItem("最后活跃", formatDate(user.last_seen_at), true),
    detailItem("资料更新时间", formatDate(user.profile_updated_at), true)
  );
  const action = document.querySelector("#userStatusAction");
  if (user.status === "deleted") action.classList.add("hidden");
  else {
    const disable = user.status === "active";
    action.classList.toggle("danger", disable);
    action.textContent = disable ? "停用此账号" : "恢复此账号";
    action.classList.remove("hidden");
  }
  showOverlay("detail");
}

async function loadUsers({ silent = false } = {}) {
  if (state.loadingUsers) return;
  state.loadingUsers = true;
  dashboardError.textContent = "";
  if (!silent) refreshStatus.textContent = "正在更新…";
  setButtonLoading(refreshButton, true, "更新中…", "刷新");
  try {
    const payload = await apiRequest("/api/admin/users", { timeout: 6500 });
    setStats(payload.counts);
    state.users = payload.users;
    renderUsers(state.users);
    refreshStatus.textContent = `刚刚更新 · ${payload.users.length} 个账号`;
  } catch (error) {
    dashboardError.textContent = `请求失败：${error.message}`;
    if (!silent) refreshStatus.textContent = "更新失败";
  } finally {
    state.loadingUsers = false;
    setButtonLoading(refreshButton, false, "更新中…", "刷新");
  }
}

async function changeStatus(user) {
  const next = user.status === "active" ? "disabled" : "active";
  const label = next === "disabled" ? "停用" : "恢复";
  if (!confirm(`确定${label}账号 @${user.account} 吗？`)) return;
  dashboardError.textContent = "";
  try {
    await apiRequest(`/api/admin/users/${user.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    closeOverlay();
    await loadUsers();
  } catch (error) {
    dashboardError.textContent = `操作失败：${error.message}`;
  }
}

function enterDashboard(payload = { counts: { total: 0, active: 0, disabled: 0, deleted: 0, online: 0 }, users: [] }) {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  document.querySelector("#serverLabel").textContent = state.base;
  setStats(payload.counts);
  state.users = payload.users;
  renderUsers(state.users);
  refreshStatus.textContent = `已连接 · ${payload.users.length} 个账号`;
  password.value = "";
}

function logout() {
  closeOverlay();
  state.authorization = "";
  state.username = "";
  state.users = [];
  password.value = "";
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginStatus.textContent = "";
}

function handleBackNavigation() {
  if (closeOverlay()) return true;
  if (!dashboardView.classList.contains("hidden")) {
    logout();
    return true;
  }
  return false;
}

window.onNativeBackEvent = () => handleBackNavigation();
window.addEventListener("popstate", () => handleBackNavigation());

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  loginStatus.textContent = "";
  const base = normaliseBase(serverUrl.value);
  if (!/^https?:\/\/[^\s]+$/i.test(base)) {
    loginError.textContent = "请输入有效的服务地址";
    return;
  }
  state.base = base;
  state.username = username.value.trim();
  state.authorization = btoa(`${state.username}:${password.value}`);
  setButtonLoading(loginButton, true, "正在验证…", "进入管理后台");
  loginStatus.textContent = "正在连接账号服务…";
  try {
    // 管理员密码使用较高强度校验，移动网络加上数据库唤醒时需要比普通刷新更长的等待窗口。
    await apiRequest("/api/admin/session", { timeout: 15000 });
    localStorage.setItem("kexu-admin-server", state.base);
    enterDashboard();
    loadUsers();
  } catch (error) {
    state.authorization = "";
    const message = /timeout/i.test(String(error?.message || ""))
      ? "管理员验证超时，请检查网络后重试"
      : error.message;
    loginError.textContent = `登录失败：${message}`;
  } finally {
    setButtonLoading(loginButton, false, "正在验证…", "进入管理后台");
    loginStatus.textContent = "";
  }
});

refreshButton.addEventListener("click", () => loadUsers());
document.querySelector("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll("#filters .filter").forEach((item) => item.classList.toggle("active", item === button));
  renderUsers(state.users);
});
document.querySelector("#closeUserDetail").addEventListener("click", closeOverlay);
userDetailModal.addEventListener("click", (event) => { if (event.target === userDetailModal) closeOverlay(); });
document.querySelector("#userStatusAction").addEventListener("click", async () => {
  if (state.selectedUser) await changeStatus(state.selectedUser);
});
setInterval(() => { if (state.authorization && !document.hidden) loadUsers({ silent: true }); }, 10000);
document.querySelector("#logoutButton").addEventListener("click", logout);

document.querySelector("#changePasswordButton").addEventListener("click", () => {
  passwordError.textContent = "";
  newPassword.value = "";
  confirmPassword.value = "";
  showOverlay("password");
  newPassword.focus();
});
document.querySelector("#cancelPasswordButton").addEventListener("click", closeOverlay);

document.querySelector("#passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordError.textContent = "";
  if (newPassword.value !== confirmPassword.value) {
    passwordError.textContent = "两次输入的新密码不一致";
    return;
  }
  const saveButton = document.querySelector("#savePasswordButton");
  setButtonLoading(saveButton, true, "保存中…", "保存新密码");
  try {
    await apiRequest("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword.value })
    });
    state.authorization = btoa(`${state.username}:${newPassword.value}`);
    closeOverlay();
    newPassword.value = "";
    confirmPassword.value = "";
    alert("管理端密码已修改，请妥善保管新密码");
  } catch (error) {
    passwordError.textContent = `修改失败：${error.message}`;
  } finally {
    setButtonLoading(saveButton, false, "保存中…", "保存新密码");
  }
});
