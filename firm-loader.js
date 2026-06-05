// firm-loader.js — populates firm profile, rating, summary, and hero CTA from firm-profiles.json
(async () => {
  const slug = document.body.dataset.firmSlug;
  if (!slug) return;

  const depth = window.location.pathname.split("/").length - 2;
  const prefix = depth > 0 ? "../".repeat(depth) : "";

  let profiles;
  try {
    profiles = await fetch(`${prefix}data/firm-profiles.json`).then((r) => r.json());
  } catch {
    return;
  }

  const p = profiles.firms?.[slug];
  if (!p) return;

  // Firm logo (profile section)
  const logoImg = document.querySelector(".firm-logo img");
  if (logoImg && p.logo_img) {
    logoImg.src = p.logo_img;
    logoImg.alt = p.name + " Logo";
  } else if (!logoImg && p.logo_icon) {
    const logoI = document.querySelector(".firm-logo i");
    if (logoI) logoI.className = p.logo_icon;
  }

  // Firm name
  const h1 = document.querySelector(".firm-details h1");
  if (h1) h1.textContent = p.name;

  // Meta section (rebuild for standard layout)
  const metaEl = document.querySelector(".firm-meta");
  if (metaEl) metaEl.innerHTML = buildMeta(p);

  // Rating card
  const scoreH2 = document.querySelector(".rating-score h2");
  if (scoreH2) scoreH2.textContent = p.rating_score;

  const starsEl = document.querySelector(".rating-score .stars");
  if (starsEl) starsEl.innerHTML = p.rating_stars;

  const reviewsEl = document.querySelector(".rating-score p");
  if (reviewsEl) reviewsEl.textContent = p.rating_reviews;

  // Rating bars
  const barsEl = document.querySelector(".rating-bars");
  if (barsEl && p.rating_bars) {
    const labels = ["5★", "4★", "3★", "2★", "1★"];
    barsEl.innerHTML = p.rating_bars
      .map(
        (b, i) => `<div class="bar-row">
        <span>${labels[i]}</span>
        <div class="bar"><div style="width: ${b.pct}"></div></div>
        <span>${b.count}</span>
      </div>`
      )
      .join("");
  }

  // AI Summary
  const summaryEl = document.querySelector(".fps-summary-text");
  if (summaryEl && p.summary) summaryEl.textContent = p.summary;

  // Hero logo
  const heroLogoImg = document.querySelector(".apex-logo-box img");
  if (heroLogoImg && p.logo_img) heroLogoImg.src = p.logo_img;

  // Hero description
  const heroDesc = document.querySelector(".apex-content > p");
  if (heroDesc && p.hero_description) {
    heroDesc.innerHTML = p.hero_description.replace(/\n\n/g, "<br><br>");
  }

  // Hero CTA link
  const heroLink = document.querySelector(".apex-content .apex-btn:not(.copy-code)");
  if (heroLink && p.affiliate_url) {
    heroLink.href = p.affiliate_url;
    heroLink.target = "_blank";
    heroLink.rel = "noopener";
    if (p.hero_btn_text) heroLink.textContent = p.hero_btn_text;
  }

  // Hero copy code button
  const copyBtn = document.querySelector(".apex-content .copy-code");
  if (copyBtn && p.code_default) {
    copyBtn.dataset.code = p.code_default;
    copyBtn.dataset.affiliateUrl = p.affiliate_url;
    copyBtn.textContent = `Code : ${p.code_default}`;
  }

  // Cashback note — injected once below the hero buttons.
  const buttonsEl = document.querySelector(".apex-buttons");
  if (buttonsEl && !document.getElementById("bro-cashback-note")) {
    const note = document.createElement("p");
    note.id = "bro-cashback-note";
    note.innerHTML =
      `Koop via onze link &amp; verdien <strong>Bro Points</strong> op je aankoop ` +
      `&mdash; <a href="/rewards/signup.html" class="bro-cb-link">activeer Bro Rewards</a>`;
    buttonsEl.insertAdjacentElement("afterend", note);

    if (!document.getElementById("bro-cashback-note-css")) {
      const s = document.createElement("style");
      s.id = "bro-cashback-note-css";
      s.textContent = `
        #bro-cashback-note {
          margin: 12px 0 0;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
        }
        #bro-cashback-note strong { color: #ff6b00; }
        #bro-cashback-note .bro-cb-eg { color: #64748b; }
        #bro-cashback-note .bro-cb-link {
          color: #00c2ff;
          text-decoration: none;
          white-space: nowrap;
        }
        #bro-cashback-note .bro-cb-link:hover { text-decoration: underline; }
      `;
      document.head.appendChild(s);
    }
  }

  function buildMeta(profile) {
    const rows = [];

    if (profile.ceo) {
      rows.push(`<div>
      <span>CEO / Founder</span>
      <strong><i class="fas fa-user-tie"></i> ${profile.ceo}</strong>
    </div>`);
    }

    rows.push(`<div>
      <span>Country</span>
      <strong><img src="https://flagcdn.com/w80/${profile.flag_code}.png" alt="${profile.flag_alt}" /> ${profile.country_display}</strong>
    </div>`);

    rows.push(`<div>
      <span>Trustpilot</span>
      <strong><i class="fas fa-star"></i> ${profile.trustpilot_score}</strong>
    </div>`);

    if (profile.founded_display) {
      rows.push(`<div>
      <span>Founded</span>
      <strong><i class="fas fa-calendar-alt"></i> ${profile.founded_display}</strong>
    </div>`);
    }

    if (profile.years) {
      rows.push(`<div>
      <span>Years Active</span>
      <strong><i class="fas fa-chart-line"></i> ${profile.years}</strong>
    </div>`);
    }

    return rows.join("\n");
  }
})();
