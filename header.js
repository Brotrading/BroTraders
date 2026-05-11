// header.js — shared nav loader
(async () => {
  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  let html;
  try {
    html = await fetch(`${prefix}header.html`).then((r) => r.text());
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
})();
