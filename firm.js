/* firm.js — shared scripts for all firm profile pages */

// ── Click attribution helpers ──────────────────────────────────────────────
// Mirrors the logic in click-attribution.js so copy-code buttons also record
// the user's click in localStorage and pass ?u=uid through /go/ redirects.
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function _broGetUid() {
  try {
    const cached = localStorage.getItem("bro_uid");
    if (cached && _UUID_RE.test(cached)) return cached;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const obj = JSON.parse(localStorage.getItem(k) || "{}");
      const id = obj?.user?.id || obj?.currentSession?.user?.id;
      if (id && _UUID_RE.test(id)) return id;
    }
  } catch (e) {}
  return null;
}

function _broAttribUrl(url) {
  try {
    const uid = _broGetUid();
    if (!uid) return url;
    const u = new URL(url, window.location.origin);
    if (!u.pathname.startsWith("/go/")) return url;
    if (!u.searchParams.has("u")) u.searchParams.set("u", uid);
    return u.toString();
  } catch (e) { return url; }
}

function _broStoreClick(url) {
  try {
    const slug = new URL(url, window.location.origin).pathname.replace(/^\/go\//, "").split("/")[0].toLowerCase();
    if (slug) localStorage.setItem("bro_last_click", JSON.stringify({ firm: slug, at: Date.now() }));
  } catch (e) {}
}

// Accordion
document.querySelectorAll(".fps-title").forEach((btn) => {
  btn.addEventListener("click", () => {
    const content = btn.nextElementSibling;
    const arrow = btn.querySelector(".fps-arrow");
    const isActive = content.classList.contains("active");

    content.classList.toggle("active", !isActive);
    if (arrow) arrow.style.transform = isActive ? "rotate(0deg)" : "rotate(45deg)";
  });
});

// Copy button — .firm-btn (accordion discount card)
document.querySelectorAll(".firm-btn[data-code]").forEach((btn) => {
  btn.addEventListener("click", function () {
    const code = this.dataset.code;
    navigator.clipboard.writeText(code).catch(() => {});

    const affiliateLink = document.querySelector(".apex-content .apex-btn:not(.copy-code)");
    if (affiliateLink?.href) {
      _broStoreClick(affiliateLink.href);
      window.open(_broAttribUrl(affiliateLink.href), "_blank", "noopener");
    }

    const originalHTML = this.innerHTML;
    this.innerHTML = '<i class="fas fa-check"></i> Copied ✓ · Opening site…';
    setTimeout(() => {
      this.innerHTML = '<i class="fas fa-copy"></i> Code : ' + code;
    }, 2000);
  });
});

// Copy button — .copy-code (hero CTA section)
document.querySelectorAll(".copy-code").forEach((btn) => {
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    const code = this.dataset.code;
    navigator.clipboard.writeText(code).catch(() => {});

    if (this.dataset.affiliateUrl) {
      _broStoreClick(this.dataset.affiliateUrl);
      window.open(_broAttribUrl(this.dataset.affiliateUrl), "_blank", "noopener");
    }

    const original = this.innerText;
    this.innerText = "Copied ✓ · Opening…";
    setTimeout(() => { this.innerText = original; }, 2000);
  });
});

// CTF Compare slider
(function () {
  const shell = document.getElementById("ctfSlider");
  if (!shell) return;
  const prevBtn = document.getElementById("ctfPrev");
  const nextBtn = document.getElementById("ctfNext");

  function updateButtons() {
    const maxScroll = shell.scrollWidth - shell.clientWidth;
    prevBtn.classList.toggle("disabled", shell.scrollLeft <= 5);
    nextBtn.classList.toggle("disabled", shell.scrollLeft >= maxScroll - 5);
  }

  nextBtn.addEventListener("click", () => shell.scrollBy({ left: shell.clientWidth, behavior: "smooth" }));
  prevBtn.addEventListener("click", () => shell.scrollBy({ left: -shell.clientWidth, behavior: "smooth" }));
  shell.addEventListener("scroll", updateButtons);
  window.addEventListener("resize", updateButtons);
  updateButtons();
})();
