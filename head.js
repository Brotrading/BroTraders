// head.js — injects shared <head> resources (favicon, Google Fonts, Font Awesome)
// and loads site-wide scripts (click attribution).
(function () {
  const depth = window.location.pathname.split("/").filter(Boolean).length - 1;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  function link(attrs) {
    const el = document.createElement("link");
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    document.head.appendChild(el);
  }

  function script(src) {
    const el = document.createElement("script");
    el.src = src;
    el.defer = true;
    document.head.appendChild(el);
  }

  link({ rel: "shortcut icon", href: prefix + "bro-trading-logo.jpeg", type: "image/x-icon" });
  link({ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@500;700&family=DM+Sans:wght@400;500;600;700&display=swap" });
  link({ rel: "stylesheet", href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" });

  // Rewrites /go/* links to ?u=<user_id> when the visitor is signed in.
  script(prefix + "js/click-attribution.js");
  // Shows cashback claim banner when a logged-in user returns after clicking a /go/ link.
  script(prefix + "js/cashback-prompt.js");
})();
