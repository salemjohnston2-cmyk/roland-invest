// Include on any page that requires the user to be logged in.
// Sets body[data-requires-auth="true"] so api.js can redirect on 401.

document.addEventListener("DOMContentLoaded", async function () {
  document.body.dataset.requiresAuth = "true";
  const token = api.getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  try {
    const me = await api.me();
    window.__me = me.user;
    // Optional hook: page scripts can listen for this.
    window.dispatchEvent(new CustomEvent("ri:ready", { detail: me.user }));
  } catch (err) {
    window.location.href = "login.html";
  }
});