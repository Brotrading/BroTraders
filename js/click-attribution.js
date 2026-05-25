// Site-wide affiliate click attribution.
//
// Rewrites every /go/<firm> link on the page to include ?u=<supabase_user_id>
// when the visitor is signed in. Pulls the user id directly from the Supabase
// session cookie that Supabase JS writes into localStorage, so we don't have
// to bundle supabase-js on every page.
//
// Loaded by head.js — runs on all pages of propfirmbro.com.

(function () {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function getUserId() {
    try {
      // Fast path: auth.js writes this key as soon as the session loads.
      // Works even before the async Supabase SDK import completes.
      const cached = localStorage.getItem("bro_uid");
      if (cached && UUID_RE.test(cached)) return cached;
    } catch (e) {}

    // Fallback: parse the Supabase auth token directly from localStorage.
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        const id = obj?.user?.id || obj?.currentSession?.user?.id;
        if (id && UUID_RE.test(id)) return id;
      }
    } catch (e) {}

    return null;
  }

  // Store the last-clicked firm so cashback-prompt.js can show a claim banner on return.
  function storeLastClick(slug) {
    try {
      localStorage.setItem("bro_last_click", JSON.stringify({ firm: slug, at: Date.now() }));
    } catch (e) {}
  }

  function attribute() {
    const uid = getUserId();
    if (!uid) return;
    document.querySelectorAll('a[href*="/go/"]').forEach((a) => {
      try {
        const u = new URL(a.href, window.location.origin);
        if (!u.pathname.startsWith("/go/")) return;
        if (u.searchParams.has("u")) return;
        u.searchParams.set("u", uid);
        a.href = u.toString();
        // Tag once so repeated attribute() calls don't stack listeners.
        if (!a.dataset.broAttrib) {
          a.dataset.broAttrib = "1";
          const slug = u.pathname.replace("/go/", "").toLowerCase();
          a.addEventListener("click", () => storeLastClick(slug), { once: true });
        }
      } catch (e) {}
    });
  }

  function init() {
    attribute();
    // Re-run for links rendered after initial DOM ready (firm-loader.js, dynamic firm cards).
    setTimeout(attribute, 800);
    setTimeout(attribute, 2500);
    // Observe future DOM mutations once — covers any late JS rendering.
    const obs = new MutationObserver(() => attribute());
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
