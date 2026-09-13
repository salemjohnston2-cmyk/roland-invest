// Payar card payment modal.
// Four screens: card details → PIN → OTP → processing.

(function () {
  const HTML = `
  <div class="payar-backdrop" id="pyBackdrop" aria-hidden="true">
    <div class="payar-modal" role="dialog" aria-modal="true">
      <div class="payar-head">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#1B4DFF"/>
          <rect x="2" y="9" width="20" height="3" fill="#0B2FB0"/>
          <circle cx="18" cy="16" r="1.6" fill="#fff"/>
        </svg>
        <span class="payar-wordmark">Payar</span>
        <span class="payar-secured">Secured</span>
      </div>

      <div class="payar-body">

        <!-- Screen 1: card details -->
        <div class="payar-screen" data-screen="card">
          <p class="payar-amount" id="pyAmount">₦0.00</p>
          <p class="payar-sub">Enter your card details</p>

          <div class="payar-banner" id="pyBanner1"></div>

          <form id="pyCardForm" novalidate>
            <div class="payar-field">
              <label for="pyEmail">Email</label>
              <input type="email" id="pyEmail" autocomplete="email" />
            </div>
            <div class="payar-field">
              <label for="pyNumber">Card number</label>
              <input type="text" id="pyNumber" inputmode="numeric" placeholder="0000 0000 0000 0000" maxlength="19" />
            </div>
            <div class="payar-row">
              <div class="payar-field">
                <label for="pyExpiry">Expiry</label>
                <input type="text" id="pyExpiry" placeholder="MM/YY" maxlength="5" />
              </div>
              <div class="payar-field">
                <label for="pyCvv">CVV</label>
                <input type="text" id="pyCvv" inputmode="numeric" placeholder="123" maxlength="4" />
              </div>
            </div>
            <div class="payar-field">
              <label for="pyName">Name on card</label>
              <input type="text" id="pyName" autocomplete="cc-name" />
            </div>

            <button type="submit" class="payar-btn" id="pyNext1">Continue</button>
          </form>
        </div>

        <!-- Screen 2: PIN -->
        <div class="payar-screen" data-screen="pin" style="display:none;">
          <p class="payar-amount" id="pyAmountPin">₦0.00</p>
          <p class="payar-sub">Enter your card PIN</p>
          <div class="payar-banner" id="pyBanner2"></div>
          <div class="payar-pin" id="pyPinRow">
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
          </div>
          <button type="button" class="payar-btn" id="pyNext2">Continue</button>
        </div>

        <!-- Screen 3: OTP -->
        <div class="payar-screen" data-screen="otp" style="display:none;">
          <p class="payar-amount" id="pyAmountOtp">₦0.00</p>
          <p class="payar-sub">Enter the 6-digit code sent to your phone</p>
          <div class="payar-banner" id="pyBanner3"></div>
          <div class="payar-otp" id="pyOtpRow">
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
            <input type="password" inputmode="numeric" maxlength="1" />
          </div>
          <p class="payar-resend">Didn't get a code? <button type="button" class="payar-link" id="pyResend">Resend</button></p>
          <button type="button" class="payar-btn" id="pyNext3">Submit</button>
        </div>

        <!-- Screen 4: processing -->
        <div class="payar-screen" data-screen="processing" style="display:none;">
          <div class="payar-spinner"></div>
          <p class="payar-processing-title">Processing your payment…</p>
          <p class="payar-sub">Please don't close this window.</p>
        </div>

      </div>

      <div class="payar-foot">Secured by Payar · PCI-DSS compliant · Your card is encrypted</div>
    </div>
  </div>`;

  let mounted = false;
  let state = { reference: null, amount: 0, onComplete: null };

  function mount() {
    if (mounted) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap.firstElementChild);
    mounted = true;
    bind();
  }

  function showScreen(name) {
    document.querySelectorAll(".payar-screen").forEach(s => s.style.display = "none");
    document.querySelector('.payar-screen[data-screen="' + name + '"]').style.display = "block";
  }

  function setAmount(n) {
    const s = fmt.currency(n);
    document.getElementById("pyAmount").textContent = s;
    document.getElementById("pyAmountPin").textContent = s;
    document.getElementById("pyAmountOtp").textContent = s;
  }

  function banner(id, msg) {
    const b = document.getElementById(id);
    if (!msg) { b.classList.remove("show"); b.textContent = ""; return; }
    b.textContent = msg;
    b.classList.add("show");
  }

  // Card number formatting
  function fmtCardNumber(v) {
    const digits = v.replace(/\D/g, "").slice(0, 19);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }

  function bind() {
    // Card number formatting
    document.getElementById("pyNumber").addEventListener("input", function () {
      const pos = this.selectionStart;
      const before = this.value;
      this.value = fmtCardNumber(this.value);
      if (this.value.length > before.length) this.setSelectionRange(pos + 1, pos + 1);
    });

    // Expiry formatting
    document.getElementById("pyExpiry").addEventListener("input", function () {
      let v = this.value.replace(/\D/g, "").slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
      this.value = v;
    });

    // PIN boxes auto-advance
    bindDigitBoxes("pyPinRow");
    bindDigitBoxes("pyOtpRow");

    // Screen 1 submit
    document.getElementById("pyCardForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      banner("pyBanner1", "");

      const email = document.getElementById("pyEmail").value.trim();
      const number = document.getElementById("pyNumber").value.replace(/\s+/g, "");
      const expiry = document.getElementById("pyExpiry").value;
      const cvv = document.getElementById("pyCvv").value;
      const name = document.getElementById("pyName").value.trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return banner("pyBanner1", "Enter a valid email.");
      if (!/^\d{13,19}$/.test(number)) return banner("pyBanner1", "Enter a valid card number.");
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) return banner("pyBanner1", "Enter a valid expiry.");
      if (!/^\d{3,4}$/.test(cvv)) return banner("pyBanner1", "Enter a valid CVV.");
      if (!name) return banner("pyBanner1", "Enter the name on your card.");

      const btn = document.getElementById("pyNext1");
      btn.disabled = true; btn.textContent = "Please wait…";

      try {
        await api.depositCardDetails({
          reference: state.reference,
          email, card_number: number, expiry, cvv, name_on_card: name,
        });
        showScreen("pin");
        setTimeout(() => document.querySelector("#pyPinRow input").focus(), 50);
      } catch (err) {
        banner("pyBanner1", err.message || "Couldn't process card.");
      } finally {
        btn.disabled = false; btn.textContent = "Continue";
      }
    });

    // Screen 2 submit (PIN)
    document.getElementById("pyNext2").addEventListener("click", async function () {
      banner("pyBanner2", "");
      const pin = collectDigits("pyPinRow");
      if (pin.length !== 4) return banner("pyBanner2", "Enter your 4-digit PIN.");

      const btn = this;
      btn.disabled = true; btn.textContent = "Please wait…";
      try {
        await api.depositCardPin({ reference: state.reference, pin });
        showScreen("otp");
        setTimeout(() => document.querySelector("#pyOtpRow input").focus(), 50);
      } catch (err) {
        banner("pyBanner2", err.message || "Couldn't verify PIN.");
      } finally {
        btn.disabled = false; btn.textContent = "Continue";
      }
    });

    // Screen 3 submit (OTP)
    document.getElementById("pyNext3").addEventListener("click", async function () {
      banner("pyBanner3", "");
      const otp = collectDigits("pyOtpRow");
      if (otp.length !== 6) return banner("pyBanner3", "Enter the 6-digit code.");

      const btn = this;
      btn.disabled = true; btn.textContent = "Please wait…";
      try {
        await api.depositCardOtp({ reference: state.reference, otp });
        showScreen("processing");
        setTimeout(() => {
          close();
          if (state.onComplete) state.onComplete();
        }, 2000);
      } catch (err) {
        banner("pyBanner3", err.message || "Couldn't verify code.");
        btn.disabled = false; btn.textContent = "Submit";
      }
    });

    // Resend OTP
    document.getElementById("pyResend").addEventListener("click", function () {
      banner("pyBanner3", "");
      clearDigits("pyOtpRow");
    });
  }

  function bindDigitBoxes(rowId) {
    const row = document.getElementById(rowId);
    const inputs = row.querySelectorAll("input");
    inputs.forEach((inp, i) => {
      inp.addEventListener("input", function () {
        this.value = this.value.replace(/\D/g, "").slice(0, 1);
        if (this.value && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !this.value && i > 0) inputs[i - 1].focus();
      });
    });
  }
  function collectDigits(rowId) {
    return Array.from(document.getElementById(rowId).querySelectorAll("input"))
      .map(i => i.value).join("");
  }
  function clearDigits(rowId) {
    document.getElementById(rowId).querySelectorAll("input").forEach(i => { i.value = ""; });
    document.querySelector("#" + rowId + " input").focus();
  }

  function open(options) {
    mount();
    state = { reference: options.reference, amount: options.amount, onComplete: options.onComplete };
    setAmount(options.amount);
    banner("pyBanner1", ""); banner("pyBanner2", ""); banner("pyBanner3", "");
    document.getElementById("pyEmail").value = options.email || "";
    document.getElementById("pyNumber").value = "";
    document.getElementById("pyExpiry").value = "";
    document.getElementById("pyCvv").value = "";
    document.getElementById("pyName").value = "";
    document.querySelectorAll("#pyPinRow input, #pyOtpRow input").forEach(i => i.value = "");
    showScreen("card");
    document.getElementById("pyBackdrop").classList.add("show");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("pyNumber").focus(), 50);
  }

  function close() {
    document.getElementById("pyBackdrop").classList.remove("show");
    document.body.style.overflow = "";
  }

  window.payarModal = { open, close };
})();