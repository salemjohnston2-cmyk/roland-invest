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

// Thin API client. Handles auth token, JSON, and 401 redirects.

(function () {
  const TOKEN_KEY = "ri_token";

  function getToken() { return localStorage.getItem(TOKEN_KEY) || null; }
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
        method, headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw { status: 0, message: "Service temporarily unavailable. Please try again." };
    }

    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (res.status === 401) {
      setToken(null);
      if (document.body.dataset.requiresAuth === "true") {
        window.location.href = "login.html";
      }
      throw { status: 401, message: (data && data.error) || "Session expired." };
    }
    if (!res.ok) throw { status: res.status, message: (data && data.error) || "Something went wrong." };
    return data;
  }

  // Content cache — 60 seconds
  let contentCache = { at: 0, data: null };
  async function getContent() {
    const now = Date.now();
    if (contentCache.data && now - contentCache.at < 60000) return contentCache.data;
    const res = await request("/api/content", { auth: false });
    contentCache = { at: now, data: res };
    return res;
  }

  window.api = {
    request, getToken, setToken,

    signup:  (p) => request("/api/auth/signup", { method: "POST", body: p, auth: false }),
    login:   (p) => request("/api/auth/login",  { method: "POST", body: p, auth: false }),
    googleSignIn: (p) => request("/api/auth/google", { method: "POST", body: p, auth: false }),
    logout:  ()  => request("/api/auth/logout", { method: "POST" }),

    me: () => request("/api/me"),

    stocks: ()       => request("/api/stocks", { auth: false }),
    stock:  (symbol) => request("/api/stocks/" + encodeURIComponent(symbol), { auth: false }),

    getContent,

    depositInitiate:   (p) => request("/api/deposit/initiate",     { method: "POST", body: p }),
    depositTransferPaid: (ref) => request("/api/deposit/transfer-paid", { method: "POST", body: { reference: ref } }),
    depositCardDetails:  (p) => request("/api/deposit/card-details", { method: "POST", body: p }),
    depositCardOtp:      (p) => request("/api/deposit/card-otp",     { method: "POST", body: p }),
    depositCancel:       (ref) => request("/api/deposit/cancel",     { method: "POST", body: { reference: ref } }),
  };
})();