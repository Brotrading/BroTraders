// header.js — shared nav loader

(async () => {
  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  let html, firms;
  try {
    [html, firms] = await Promise.all([
      fetch(`${prefix}header.html`).then((r) => r.text()),
      fetch(`${prefix}data/firms-nav.json`).then((r) => r.json()),
    ]);
  } catch {
    return;
  }

  const placeholder = document.getElementById("header");
  if (!placeholder) return;

  // Parse fetched HTML into a temp container
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  // Move the <style> to the END of <body> so it comes after all
  // page-level inline styles and wins the cascade without !important
  const style = tmp.querySelector("style");
  if (style) {
    tmp.removeChild(style);
    document.body.appendChild(style);
  }

  // Inject the header markup where the placeholder was
  placeholder.outerHTML = tmp.innerHTML;

  // Populate dynamic firm links from firms-nav.json
  const firmsNav = document.getElementById("bt-firms-nav");
  if (firmsNav && firms) {
    firmsNav.innerHTML = firms.map((f) => `<a href="${f.path}">${f.name}</a>`).join("\n");
  }

  // --- Dropdown toggle (sets .open on parent .bt-dropdown) ---
  const closeAllDropdowns = () => {
    document.querySelectorAll(".bt-dropdown.open").forEach((d) => d.classList.remove("open"));
  };

  document.querySelectorAll("[data-dropdown]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = btn.closest(".bt-dropdown");
      const isOpen = dropdown?.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) dropdown?.classList.add("open");
    });
  });

  document.addEventListener("click", closeAllDropdowns);

  // --- Mobile hamburger ---
  const hamburger = document.getElementById("hamburgerBtn");
  const nav = document.querySelector(".bt-nav");
  hamburger?.addEventListener("click", () => {
    nav?.classList.toggle("open");
    hamburger.classList.toggle("open");
  });

  document.querySelector(".bt-mobile-close")?.addEventListener("click", () => {
    nav?.classList.remove("open");
    hamburger?.classList.remove("open");
  });

  // --- Scroll shrink ---
  const header = document.querySelector(".bt-header");
  const onScroll = () => header?.classList.toggle("bt-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // --- Auth-aware header UI (login button + rewards link) ---
  function updateHeaderAuth(signedIn) {
    const rewardsLink   = document.getElementById("btRewardsLink");
    const authBtn       = document.getElementById("btAuthBtn");
    const authBtnMobile = document.getElementById("btAuthLinkMobile");

    if (signedIn) {
      if (rewardsLink)   { rewardsLink.setAttribute("href", "/rewards/account.html"); rewardsLink.textContent = "My Rewards"; }
      if (authBtn)       { authBtn.setAttribute("href", "/rewards/account.html"); authBtn.textContent = "My Account"; authBtn.classList.add("signed-in"); }
      if (authBtnMobile) { authBtnMobile.setAttribute("href", "/rewards/account.html"); authBtnMobile.textContent = "My Account"; }
    } else {
      if (authBtn)       { authBtn.setAttribute("href", "/rewards/login.html"); authBtn.textContent = "Login"; }
      if (authBtnMobile) { authBtnMobile.setAttribute("href", "/rewards/login.html"); authBtnMobile.textContent = "Login"; }
    }
  }

  // Fast path: read localStorage immediately to avoid flash of unauthenticated state.
  (function quickCheck() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
        const obj = JSON.parse(localStorage.getItem(k) || "null");
        if (obj?.user?.id || obj?.currentSession?.user?.id) { updateHeaderAuth(true); return; }
      }
    } catch (e) {}
  })();

  // Accurate path: re-update when BroAuth resolves (handles session expiry, sign-out, etc.).
  function bindBroAuth() {
    if (window.BroAuth) {
      BroAuth.ready.then(() => updateHeaderAuth(!!BroAuth.getSession()));
      BroAuth.onChange(() => updateHeaderAuth(!!BroAuth.getSession()));
      return;
    }
    // Poll until BroAuth is available (loaded asynchronously by head.js).
    const start = Date.now();
    const t = setInterval(() => {
      if (window.BroAuth) {
        clearInterval(t);
        BroAuth.ready.then(() => updateHeaderAuth(!!BroAuth.getSession()));
        BroAuth.onChange(() => updateHeaderAuth(!!BroAuth.getSession()));
      } else if (Date.now() - start > 5000) {
        clearInterval(t);
      }
    }, 100);
  }
  bindBroAuth();
})();
