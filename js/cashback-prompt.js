// Cashback claim prompt — shows a bottom banner when a logged-in user returns to the
// site after clicking a /go/<firm> affiliate link, letting them claim their 2.5% back
// in BRO points with a single form submission.
//
// Data flow:
//   1. click-attribution.js writes bro_last_click = { firm, at } to localStorage on click.
//   2. This script reads it on every page load and shows the banner when appropriate.
//   3. On successful claim, bro_last_click is cleared so the banner doesn't repeat.
//
// Loaded by head.js — runs on all pages.

(function () {
  const FIRM_NAMES = {
    apex:       "Apex Trader Funding",
    alpha:      "Alpha Futures",
    daytraders: "Daytraders.com",
    fundedseat: "FundedSeat",
    lucid:      "Lucid Trading",
    phidias:    "Phidias PropFirm",
    mffu:       "My Funded Futures",
    nexgen:     "NexGen Funding",
    topone:     "Top One Futures",
    tradeify:   "Tradeify",
    yrm:        "YRM Prop",
  };

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function getSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
        const obj = JSON.parse(localStorage.getItem(k) || "{}");
        const id = obj?.user?.id || obj?.currentSession?.user?.id;
        const token = obj?.access_token || obj?.currentSession?.access_token;
        if (id && UUID_RE.test(id) && token) return { id, token };
      }
    } catch (e) {}
    return null;
  }

  function getLastClick() {
    try {
      const raw = localStorage.getItem("bro_last_click");
      if (!raw) return null;
      const { firm, at } = JSON.parse(raw);
      if (!firm || !at) return null;
      if (Date.now() - at > SEVEN_DAYS) { localStorage.removeItem("bro_last_click"); return null; }
      return { firm, at };
    } catch (e) { return null; }
  }

  function clearLastClick() {
    try { localStorage.removeItem("bro_last_click"); } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById("bro-cashback-styles")) return;
    const s = document.createElement("style");
    s.id = "bro-cashback-styles";
    s.textContent = `
      #bro-cashback-banner {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
        background: #131626; border-top: 1px solid #232a3d;
        padding: 14px 20px; display: flex; align-items: center;
        gap: 14px; flex-wrap: wrap;
        font-family: "DM Sans", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
        font-size: 14px; color: #fff;
        animation: bro-slide-up 0.3s ease;
      }
      @keyframes bro-slide-up {
        from { transform: translateY(100%); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      #bro-cashback-banner .bro-cb-icon { font-size: 22px; flex-shrink: 0; }
      #bro-cashback-banner .bro-cb-text { flex: 1; min-width: 200px; }
      #bro-cashback-banner .bro-cb-text strong { color: #ff6b00; }
      #bro-cashback-banner .bro-cb-text span { color: #94a3b8; font-size: 12px; margin-left: 6px; }
      #bro-cashback-banner .bro-cb-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .bro-cb-btn {
        padding: 8px 16px; border-radius: 8px; border: 0; cursor: pointer;
        font: 600 13px/1 "DM Sans", sans-serif; transition: filter 0.15s;
      }
      .bro-cb-btn:hover { filter: brightness(1.1); }
      .bro-cb-btn.primary { background: #ff6b00; color: #fff; }
      .bro-cb-btn.ghost   { background: transparent; color: #94a3b8; border: 1px solid #232a3d; }

      #bro-cashback-overlay {
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(0,0,0,0.7); display: flex;
        align-items: center; justify-content: center; padding: 16px;
        font-family: "DM Sans", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
      }
      #bro-cashback-modal {
        background: #131626; border: 1px solid #232a3d; border-radius: 16px;
        padding: 28px; width: 100%; max-width: 420px; color: #fff;
      }
      #bro-cashback-modal h3 { margin: 0 0 6px; font-size: 18px; }
      #bro-cashback-modal p  { margin: 0 0 20px; color: #94a3b8; font-size: 13px; line-height: 1.5; }
      .bro-cb-field { margin-bottom: 14px; }
      .bro-cb-label { display: block; margin-bottom: 5px; font-size: 12px; color: #94a3b8; }
      .bro-cb-input {
        width: 100%; padding: 10px 12px; border-radius: 8px; box-sizing: border-box;
        background: #1a1f2e; border: 1px solid #232a3d;
        color: #fff; font: inherit; font-size: 14px;
      }
      .bro-cb-input:focus { outline: none; border-color: #ff6b00; }
      .bro-cb-row { display: flex; gap: 10px; margin-top: 20px; }
      .bro-cb-row .bro-cb-btn { flex: 1; padding: 11px 0; font-size: 14px; }
      #bro-cb-success {
        text-align: center; padding: 8px 0;
      }
      #bro-cb-success .bro-cb-check { font-size: 36px; margin-bottom: 10px; }
      #bro-cb-success h3 { margin: 0 0 8px; font-size: 17px; }
      #bro-cb-success p  { margin: 0; color: #94a3b8; font-size: 13px; }
      #bro-cb-err { color: #ef4444; font-size: 12px; margin-top: 8px; display: none; }
    `;
    document.head.appendChild(s);
  }

  function removeBanner() {
    const el = document.getElementById("bro-cashback-banner");
    if (el) el.remove();
  }

  function showBanner(firm, firmName) {
    removeBanner();
    const banner = document.createElement("div");
    banner.id = "bro-cashback-banner";
    banner.innerHTML = `
      <div class="bro-cb-icon">🎯</div>
      <div class="bro-cb-text">
        Did you buy at <strong>${firmName}</strong>?
        <span>Claim your 2.5% cashback in BRO points</span>
      </div>
      <div class="bro-cb-actions">
        <button class="bro-cb-btn primary" id="bro-cb-claim">Claim cashback →</button>
        <button class="bro-cb-btn ghost" id="bro-cb-dismiss">Dismiss</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById("bro-cb-claim").addEventListener("click", () => {
      window.location.href = `/rewards/claim.html?firm=${encodeURIComponent(firm)}`;
    });
    document.getElementById("bro-cb-dismiss").addEventListener("click", () => {
      clearLastClick();
      removeBanner();
    });
  }

  function showModal(firm, firmName) {
    const overlay = document.createElement("div");
    overlay.id = "bro-cashback-overlay";
    overlay.innerHTML = `
      <div id="bro-cashback-modal">
        <h3>Claim cashback — ${firmName}</h3>
        <p>
          Enter your purchase details. We'll verify and credit your BRO points
          within 24 hours. Free members earn 2.5%, Pro Bros earn 3.75%.
        </p>

        <div class="bro-cb-field">
          <label class="bro-cb-label">Order reference / confirmation number <em style="color:#94a3b8;">(optional)</em></label>
          <input class="bro-cb-input" id="bro-cb-ref" type="text" placeholder="e.g. ATF-123456" maxlength="200" />
        </div>

        <div class="bro-cb-field">
          <label class="bro-cb-label">Purchase amount (€) <em style="color:#ef4444;">*</em></label>
          <input class="bro-cb-input" id="bro-cb-amount" type="number" min="1" step="0.01" placeholder="e.g. 97" required />
        </div>

        <div id="bro-cb-err"></div>

        <div class="bro-cb-row">
          <button class="bro-cb-btn ghost" id="bro-cb-cancel">Cancel</button>
          <button class="bro-cb-btn primary" id="bro-cb-submit">Submit claim</button>
        </div>

        <div id="bro-cb-success" style="display:none;">
          <div class="bro-cb-check">✅</div>
          <h3>Claim submitted!</h3>
          <p>Your points will be added once we verify your purchase (usually within 24 hours).</p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("bro-cb-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById("bro-cb-submit").addEventListener("click", async () => {
      const ref = (document.getElementById("bro-cb-ref").value || "").trim();
      const amountRaw = parseFloat(document.getElementById("bro-cb-amount").value);
      const errEl = document.getElementById("bro-cb-err");

      if (!amountRaw || amountRaw <= 0) {
        errEl.textContent = "Please enter a valid purchase amount.";
        errEl.style.display = "block";
        return;
      }

      const session = getSession();
      if (!session) {
        errEl.textContent = "You need to be signed in to claim cashback.";
        errEl.style.display = "block";
        return;
      }

      const btn = document.getElementById("bro-cb-submit");
      btn.disabled = true;
      btn.textContent = "Submitting…";
      errEl.style.display = "none";

      try {
        const res = await fetch("/api/rewards/claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.token}`,
          },
          body: JSON.stringify({ firm_slug: firm, order_ref: ref, amount_eur: amountRaw }),
        });
        const data = await res.json();

        if (!res.ok) {
          const msg = data.error === "claim_already_pending"
            ? "You already have a pending claim for this firm. Check your account page."
            : (data.error || `Error ${res.status}`);
          errEl.textContent = msg;
          errEl.style.display = "block";
          btn.disabled = false;
          btn.textContent = "Submit claim";
          return;
        }

        clearLastClick();
        document.getElementById("bro-cashback-modal").querySelector("h3").style.display = "none";
        document.getElementById("bro-cashback-modal").querySelector("p").style.display = "none";
        document.querySelectorAll(".bro-cb-field, .bro-cb-row").forEach((el) => el.style.display = "none");
        document.getElementById("bro-cb-success").style.display = "block";

        setTimeout(() => overlay.remove(), 4000);
      } catch (e) {
        errEl.textContent = "Something went wrong. Please try again.";
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Submit claim";
      }
    });
  }

  function init() {
    const click = getLastClick();
    if (!click) return;

    const firmName = FIRM_NAMES[click.firm];
    if (!firmName) return;

    // Only show for logged-in users.
    const session = getSession();
    if (!session) return;

    // Don't show on the rewards pages themselves to avoid UI clutter.
    if (window.location.pathname.startsWith("/rewards/") ||
        window.location.pathname.startsWith("/admin/")) return;

    injectStyles();
    showBanner(click.firm, firmName);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
