const DEFAULT_SERVER = "http://47.122.105.185";
const state = { base: localStorage.getItem("kexu-admin-server") || DEFAULT_SERVER, authorization: "", username: "" };
const loginView = document.querySelector("#loginView");
const dashboardView = document.querySelector("#dashboardView");
const loginError = document.querySelector("#loginError");
const dashboardError = document.querySelector("#dashboardError");
const serverUrl = document.querySelector("#serverUrl");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const loginButton = document.querySelector("#loginButton");
const users = document.querySelector("#users");
const passwordModal = document.querySelector("#passwordModal");
const newPassword = document.querySelector("#newPassword");
const confirmPassword = document.querySelector("#confirmPassword");
const passwordError = document.querySelector("#passwordError");

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
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有注册用户";
    users.append(empty);
    return;
  }
  for (const user of items) {
    const card = document.createElement("article");
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
    meta.className = "meta";
    const profile = [user.college, user.department, user.major, user.class_name].filter(Boolean).join(" · ") || "个人学籍资料尚未同步";
    meta.textContent = `学籍资料：${profile}\n注册：${formatDate(user.created_at)}\n最后活跃：${formatDate(user.last_seen_at)}\n最后登录：${formatDate(user.last_login_at)}`;
    card.append(header, meta);
    if (user.status !== "deleted") {
      const action = document.createElement("button");
      action.className = "action";
      action.textContent = user.status === "active" ? "停用账号" : "恢复账号";
      action.addEventListener("click", () => changeStatus(user));
      card.append(action);
    }
    users.append(card);
  }
}

async function loadUsers() {
  dashboardError.textContent = "";
  document.querySelector("#refreshButton").disabled = true;
  try {
    const response = await fetch(`${state.base}/api/admin/users`, { headers: authHeader() });
    if (!response.ok) throw new Error(await messageFrom(response, "无法读取用户数据"));
    const payload = await response.json();
    setStats(payload.counts);
    renderUsers(payload.users);
  } catch (error) {
    dashboardError.textContent = `请求失败：${error.message}`;
  } finally {
    document.querySelector("#refreshButton").disabled = false;
  }
}

async function changeStatus(user) {
  const next = user.status === "active" ? "disabled" : "active";
  const label = next === "disabled" ? "停用" : "恢复";
  if (!confirm(`确定${label}账号 @${user.account} 吗？`)) return;
  dashboardError.textContent = "";
  try {
    const response = await fetch(`${state.base}/api/admin/users/${user.id}/status`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    if (!response.ok) throw new Error(await messageFrom(response, "状态更新失败"));
    await loadUsers();
  } catch (error) {
    dashboardError.textContent = `操作失败：${error.message}`;
  }
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const base = normaliseBase(serverUrl.value);
  if (!/^https?:\/\/[^\s]+$/i.test(base)) {
    loginError.textContent = "请输入有效的服务地址";
    return;
  }
  loginButton.disabled = true;
  state.base = base;
  state.username = username.value.trim();
  state.authorization = btoa(`${state.username}:${password.value}`);
  try {
    const response = await fetch(`${state.base}/api/admin/users`, { headers: authHeader() });
    if (!response.ok) throw new Error(await messageFrom(response, "管理员账号或密码错误"));
    localStorage.setItem("kexu-admin-server", state.base);
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    document.querySelector("#serverLabel").textContent = state.base;
    const payload = await response.json();
    setStats(payload.counts);
    renderUsers(payload.users);
    password.value = "";
  } catch (error) {
    state.authorization = "";
    loginError.textContent = `登录失败：${error.message}`;
  } finally {
    loginButton.disabled = false;
  }
});

document.querySelector("#refreshButton").addEventListener("click", loadUsers);
setInterval(() => { if (state.authorization) loadUsers(); }, 30000);
document.querySelector("#logoutButton").addEventListener("click", () => {
  state.authorization = "";
  state.username = "";
  password.value = "";
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
});

document.querySelector("#changePasswordButton").addEventListener("click", () => {
  passwordError.textContent = "";
  newPassword.value = "";
  confirmPassword.value = "";
  passwordModal.classList.remove("hidden");
  newPassword.focus();
});

document.querySelector("#cancelPasswordButton").addEventListener("click", () => passwordModal.classList.add("hidden"));

document.querySelector("#passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordError.textContent = "";
  if (newPassword.value !== confirmPassword.value) {
    passwordError.textContent = "两次输入的新密码不一致";
    return;
  }
  const saveButton = document.querySelector("#savePasswordButton");
  saveButton.disabled = true;
  try {
    const response = await fetch(`${state.base}/api/admin/password`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword.value })
    });
    if (!response.ok) throw new Error(await messageFrom(response, "密码修改失败"));
    state.authorization = btoa(`${state.username}:${newPassword.value}`);
    passwordModal.classList.add("hidden");
    newPassword.value = "";
    confirmPassword.value = "";
    alert("管理端密码已修改，请妥善保管新密码");
  } catch (error) {
    passwordError.textContent = `修改失败：${error.message}`;
  } finally {
    saveButton.disabled = false;
  }
});
