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

  // --- Market switch (Futures / CFD / Perps) ---
  // Shown on pages that list their markets: <meta name="bt-markets" content="futures,cfd,perps">.
  // The choice is kept for every page in localStorage ("bt-market"), and every change
  // (here or from a page's own tabs) goes round as a window "bt-market" event.
  const marketMeta = document.querySelector('meta[name="bt-markets"]');
  const marketSwitch = document.getElementById("bt-market");
  if (marketMeta && marketSwitch) {
    const KEY = "bt-market";
    const have = marketMeta.content.split(",").map((s) => s.trim()).filter(Boolean);
    marketSwitch.querySelectorAll("[data-market]").forEach((b) => {
      if (!have.includes(b.dataset.market)) b.remove();
    });
    const stored = () => {
      try { return localStorage.getItem(KEY); } catch { return null; }
    };
    const press = (m) =>
      marketSwitch.querySelectorAll("[data-market]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.market === m));
    const choose = (m) => {
      try { localStorage.setItem(KEY, m); } catch {}
      window.dispatchEvent(new CustomEvent("bt-market", { detail: m }));
    };
    window.addEventListener("bt-market", (e) => press(e.detail));
    marketSwitch.addEventListener("click", (e) => {
      const b = e.target.closest("[data-market]");
      if (b && b.getAttribute("aria-pressed") !== "true") choose(b.dataset.market);
    });
    document.documentElement.classList.add("bt-has-market");
    marketSwitch.hidden = false;
    const now = stored();
    choose(have.includes(now) ? now : have[0]);
  }

  // --- Scroll shrink ---
  const header = document.querySelector(".bt-header");
  const onScroll = () => header?.classList.toggle("bt-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
