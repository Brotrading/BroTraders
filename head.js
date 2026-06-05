// head.js — injects shared <head> resources (favicon, Google Fonts, Font Awesome)
// and loads site-wide scripts (click attribution).
(function () {
  // OAuth callback fallback: Supabase lands on the Site URL when redirectTo isn't
  // whitelisted. Detect the token fragment and forward to the account page so the
  // Supabase client there can establish the session normally.
  if (
    window.location.hash.includes("access_token=") &&
    !window.location.pathname.startsWith("/rewards/")
  ) {
    window.location.replace("/rewards/account.html" + window.location.hash);
    return;
  }

  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  function link(attrs) {
    const el = document.createElement("link");
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    document.head.appendChild(el);
  }

  // Load scripts sequentially: each fires only after the previous one has executed.
  // This ensures supabase-config → auth → click-attribution order so BroAuth exists
  // by the time click-attribution.js runs.
  function scriptSeq(srcs, idx) {
    if (idx >= srcs.length) return;
    const el = document.createElement("script");
    el.src = srcs[idx];
    el.onload = el.onerror = () => scriptSeq(srcs, idx + 1);
    document.head.appendChild(el);
  }

  link({ rel: "shortcut icon", href: prefix + "bro-trading-logo.jpeg", type: "image/x-icon" });
  link({ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@500;700&family=DM+Sans:wght@400;500;600;700&display=swap" });
  link({ rel: "stylesheet", href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" });

  scriptSeq([
    prefix + "js/supabase-config.js",     // sets SUPABASE_CONFIG
    prefix + "js/auth.js",                 // creates BroAuth (guard skips if already loaded)
    prefix + "js/click-attribution.js",    // rewrites /go/ links with ?u=<user_id>
    prefix + "js/cashback-prompt.js",      // shows cashback banner on return
  ], 0);
})();
