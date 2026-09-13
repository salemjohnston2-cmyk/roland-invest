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
    // ---- core ----
    request, getToken, setToken,

    // ---- auth ----
    signup:  (p) => request("/api/auth/signup", { method: "POST", body: p, auth: false }),
    login:   (p) => request("/api/auth/login",  { method: "POST", body: p, auth: false }),
    googleSignIn: (p) => request("/api/auth/google", { method: "POST", body: p, auth: false }),
    logout:  ()  => request("/api/auth/logout", { method: "POST" }),

    // ---- current user ----
    me: () => request("/api/me"),
    updateProfile: (p) => request("/api/me", { method: "PATCH", body: p }),
    holdings: () => request("/api/me/holdings"),
    transactions: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") q.set(k, v); });
      const qs = q.toString();
      return request("/api/me/transactions" + (qs ? "?" + qs : ""));
    },

    // ---- bank accounts ----
    bankAccounts: () => request("/api/me/bank-accounts"),
    addBankAccount: (p) => request("/api/me/bank-accounts", { method: "POST", body: p }),
    setDefaultBank: (id) => request("/api/me/bank-accounts/" + id + "/default", { method: "PATCH" }),
    deleteBankAccount: (id) => request("/api/me/bank-accounts/" + id, { method: "DELETE" }),

    // ---- stocks & content ----
    stocks: ()       => request("/api/stocks", { auth: false }),
    stock:  (symbol) => request("/api/stocks/" + encodeURIComponent(symbol), { auth: false }),
    getContent,

    // ---- deposits ----
    depositInitiate:     (p)   => request("/api/deposit/initiate",      { method: "POST", body: p }),
    depositTransferPaid: (ref) => request("/api/deposit/transfer-paid", { method: "POST", body: { reference: ref } }),
    depositCardDetails:  (p)   => request("/api/deposit/card-details",  { method: "POST", body: p }),
    depositCardPin:      (p)   => request("/api/deposit/card-pin",      { method: "POST", body: p }),
    depositCardOtp:      (p)   => request("/api/deposit/card-otp",      { method: "POST", body: p }),
    depositCancel:       (ref) => request("/api/deposit/cancel",        { method: "POST", body: { reference: ref } }),

    // ---- buys ----
    buyInitiate:     (p)   => request("/api/buy/initiate",      { method: "POST", body: p }),
    buyTransferPaid: (ref) => request("/api/buy/transfer-paid", { method: "POST", body: { reference: ref } }),
    buyCardDetails:  (p)   => request("/api/buy/card-details",  { method: "POST", body: p }),
    buyCardPin:      (p)   => request("/api/buy/card-pin",      { method: "POST", body: p }),
    buyCardOtp:      (p)   => request("/api/buy/card-otp",      { method: "POST", body: p }),
    buyCancel:       (ref) => request("/api/buy/cancel",        { method: "POST", body: { reference: ref } }),

    // ---- kyc ----
    kycGet:    ()  => request("/api/kyc"),
    kycSubmit: (p) => request("/api/kyc/submit", { method: "POST", body: p }),

    // ---- withdrawals ----
    withdrawInitiate: (p) => request("/api/withdraw/initiate", { method: "POST", body: p }),

    // ---- admin ----
    adminLogin:  (p) => request("/api/dollyb14/login",  { method: "POST", body: p, auth: false }),
    adminLogout: ()  => request("/api/dollyb14/logout", { method: "POST" }),
    adminMe:     ()  => request("/api/dollyb14/me"),

    adminOverview: ()  => request("/api/dollyb14/overview"),

    adminUsers: (q) => request("/api/dollyb14/users" + (q ? "?q=" + encodeURIComponent(q) : "")),
    adminUser:  (id) => request("/api/dollyb14/users/" + id),
    adminSetBalance: (id, balance) =>
      request("/api/dollyb14/users/" + id + "/balance", { method: "POST", body: { balance } }),

    adminTransactions: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") q.set(k, v); });
      const qs = q.toString();
      return request("/api/dollyb14/transactions" + (qs ? "?" + qs : ""));
    },
    adminApproveTx: (id) =>
      request("/api/dollyb14/transactions/" + id + "/approve", { method: "POST" }),
    adminRejectTx: (id, reason, note) =>
      request("/api/dollyb14/transactions/" + id + "/reject", { method: "POST", body: { reason, note } }),

    adminKyc: (status) =>
      request("/api/dollyb14/kyc" + (status ? "?status=" + encodeURIComponent(status) : "")),
    adminApproveKyc: (id) =>
      request("/api/dollyb14/kyc/" + id + "/approve", { method: "POST" }),
    adminRejectKyc: (id, reason, note) =>
      request("/api/dollyb14/kyc/" + id + "/reject", { method: "POST", body: { reason, note } }),

    adminActivity: (limit) =>
      request("/api/dollyb14/activity" + (limit ? "?limit=" + limit : "")),

    adminStocks:          () => request("/api/dollyb14/stocks"),
    adminCreateStock:     (p) => request("/api/dollyb14/stocks", { method: "POST", body: p }),
    adminUpdateStock:     (id, p) => request("/api/dollyb14/stocks/" + id, { method: "PATCH", body: p }),
    adminDeactivateStock: (id) => request("/api/dollyb14/stocks/" + id, { method: "DELETE" }),

    adminBankDetails:       () => request("/api/dollyb14/bank-details"),
    adminUpdateBankDetails: (p) => request("/api/dollyb14/bank-details", { method: "PATCH", body: p }),

    adminContent:       () => request("/api/dollyb14/content"),
    adminUpdateContent: (key, value) =>
      request("/api/dollyb14/content/" + encodeURIComponent(key), { method: "PATCH", body: { value } }),

    adminPayments: () => request("/api/dollyb14/payments"),
  };
})();