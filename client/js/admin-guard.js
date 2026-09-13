// Admin pages require admin session. On failure, redirect to /dollyb14/.

document.addEventListener("DOMContentLoaded", async function () {
  document.body.dataset.requiresAuth = "true";
  const token = api.getToken();
  if (!token) { window.location.href = "/dollyb14/index.html"; return; }
  try {
    const me = await api.adminMe();
    window.__admin = me.admin;
    window.dispatchEvent(new CustomEvent("admin:ready", { detail: me.admin }));
  } catch (_) {
    api.setToken(null);
    window.location.href = "/dollyb14/index.html";
  }
});