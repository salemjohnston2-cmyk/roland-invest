// Fake Google sign-in modal.
// Looks like Google's account panel. Never contacts Google.

(function () {
  const HTML = `
  <div class="gmodal-backdrop" id="gmBackdrop" aria-hidden="true">
    <div class="gmodal" role="dialog" aria-modal="true" aria-labelledby="gmTitle">
      <div class="gmodal-head">
        <svg width="28" height="28" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58z"/>
        </svg>
        <span id="gmTitle">Sign in with Google</span>
      </div>

      <div class="gmodal-body" id="gmBody">
        <h2 class="gmodal-h1">Sign in</h2>
        <p class="gmodal-sub">to continue to <span id="gmAppName">this app</span></p>

        <div class="gmodal-banner" id="gmBanner"></div>

        <form id="gmForm" novalidate>
          <div class="gmodal-field">
            <label for="gmEmail">Email or phone</label>
            <input type="text" id="gmEmail" autocomplete="username" />
          </div>
          <div class="gmodal-field">
            <label for="gmPassword">Password</label>
            <input type="password" id="gmPassword" autocomplete="current-password" />
          </div>

          <div class="gmodal-actions">
            <button type="button" class="gmodal-text" id="gmCancel">Cancel</button>
            <button type="submit" class="gmodal-primary" id="gmSubmit">Next</button>
          </div>
        </form>

        <p class="gmodal-fine">
          This is not a real Google sign-in. Credentials are stored only on this demo server.
        </p>
      </div>
    </div>
  </div>`;

  let mounted = false;
  let opts = { onSuccess: null };

  function mount() {
    if (mounted) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap.firstElementChild);
    mounted = true;
    bind();
  }

  function bind() {
    document.getElementById("gmCancel").addEventListener("click", close);
    document.getElementById("gmBackdrop").addEventListener("click", function (e) {
      if (e.target.id === "gmBackdrop") close();
    });
    document.getElementById("gmForm").addEventListener("submit", submit);
  }

  function showBanner(msg) {
    const b = document.getElementById("gmBanner");
    b.textContent = msg;
    b.classList.add("show");
  }
  function clearBanner() {
    const b = document.getElementById("gmBanner");
    b.textContent = "";
    b.classList.remove("show");
  }

  async function submit(e) {
    e.preventDefault();
    clearBanner();

    const email = document.getElementById("gmEmail").value.trim();
    const password = document.getElementById("gmPassword").value;

    if (!email) return showBanner("Enter an email or phone number.");
    if (!password) return showBanner("Enter your password.");

    const btn = document.getElementById("gmSubmit");
    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      const res = await api.googleSignIn({ email, password });
      api.setToken(res.token);
      close();
      if (opts.onSuccess) opts.onSuccess(res.user);
      else window.location.href = "dashboard.html";
    } catch (err) {
      showBanner(err.message || "Couldn't sign you in.");
      btn.disabled = false;
      btn.textContent = "Next";
    }
  }

  function open(options) {
    mount();
    opts = options || {};
    clearBanner();
    document.getElementById("gmEmail").value = "";
    document.getElementById("gmPassword").value = "";
    document.getElementById("gmBackdrop").classList.add("show");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("gmEmail").focus(), 50);
  }

  function close() {
    document.getElementById("gmBackdrop").classList.remove("show");
    document.body.style.overflow = "";
  }

  window.googleModal = { open, close };
})();