// Thin API client. Handles auth token, JSON, and 401 redirects.

(function () {
  const TOKEN_KEY = "ri_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || null;
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, { method = "GET", body = null, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const t = getToken();
      if (t) headers["Authorization"] = "Bearer " + t;
    }
    let res;
    try {
      res = await fetch(window.API_BASE + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw { status: 0, message: "Service temporarily unavailable. Please try again." };
    }

    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (res.status === 401) {
      setToken(null);
      // Only redirect if we're on a page that requires auth.
      if (document.body.dataset.requiresAuth === "true") {
        window.location.href = "login.html";
      }
      throw { status: 401, message: (data && data.error) || "Session expired." };
    }

    if (!res.ok) {
      throw { status: res.status, message: (data && data.error) || "Something went wrong." };
    }

    return data;
  }

  window.api = {
    // raw
    request,
    getToken,
    setToken,

    // auth
    signup: (payload) => request("/api/auth/signup", { method: "POST", body: payload, auth: false }),
    login:  (payload) => request("/api/auth/login",  { method: "POST", body: payload, auth: false }),
    logout: ()        => request("/api/auth/logout", { method: "POST" }),

    // current user
    me: () => request("/api/me"),

    // health
    health: () => request("/health", { auth: false }),
  };
})();