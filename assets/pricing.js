/**
 * pricing.js — Dynamic best-deal loader for firm pages.
 *
 * Reads best_deal from firm-rules.json and updates the discount card
 * on any firm page that has a data-firm-slug attribute on <body>.
 *
 * Rules (per Bro Trading affiliate policy):
 *   - Badge shows the highest available discount %
 *   - Button always copies the affiliate code (BRO/BROTRADING) for commission
 *   - Promo codes are mentioned in the description text only
 */
(async () => {
  const slug = document.body.dataset.firmSlug;
  if (!slug) return;

  let rules;
  try {
    const depth = window.location.pathname.split("/").length - 2;
    const prefix = depth > 0 ? "../".repeat(depth) : "";
    rules = await fetch(`${prefix}data/firm-rules.json`).then((r) => r.json());
  } catch {
    return;
  }

  const firm = rules.firms?.[slug];
  const deal = firm?.best_deal;
  if (!deal || !deal.badge_pct) return;

  // Update badge
  const badge = document.querySelector(".discount-badge");
  if (badge) {
    badge.innerHTML = `<i class="fas fa-bolt"></i> ${deal.badge_pct}% OFF`;
  }

  // Update description paragraph (first <p> inside .discount-middle)
  const descEl = document.querySelector(".discount-middle > p");
  if (descEl && deal.description) {
    descEl.textContent = deal.description;
  }

  // Update button label (keep data-code as affiliate code for commission)
  const btn = document.querySelector(".firm-btn");
  if (btn && deal.button_code) {
    btn.dataset.code = deal.button_code;
    const icon = btn.querySelector("i");
    btn.innerHTML = "";
    if (icon) btn.appendChild(icon);
    btn.append(` Code : ${deal.button_code}`);
  }
})();
