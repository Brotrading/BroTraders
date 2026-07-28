# Kruchi's Briefing — propfirmbro.com

**Instructions for Claude:** If Kruchi opens this repo with Claude Code, read this file first, then help him within the scope and rules below. The rewards system is out of scope for him — that's Mike's (see `MIKE-BRIEFING.md`).

Welcome Kruchi! 👊 This doc is your map of the site, your focus areas, and the house rules.

---

## 1. What this site is

**propfirmbro.com** is Mike's (Bro Trading) affiliate site for futures prop firms. Visitors compare firms, click through via Mike's affiliate links (`/go/<firm>` redirects), and buy accounts with his codes — that's the revenue. Everything on the site exists to make comparing easy and clicking attractive.

## 2. Team & scope

| Who | Does |
|---|---|
| **Mike** (+ Claude) | Bro Rewards points system (`rewards/`, `functions/api/rewards/`, `admin/`), go-lives, all production merges |
| **You (Kruchi)** | **Site layout/design · prop-firm comparison pages & data · keeping the daily deals up to date** |

Please don't change anything under `rewards/`, `functions/`, `admin/`, or `migrations/` — that's the points system and its backend. If something there blocks you, ask Mike.

## 3. House rules (non-negotiable)

1. **Never push or merge to `main`.** `main` deploys straight to propfirmbro.com within a minute. Work on branches (`kruchi/<topic>`), open a Pull Request, Mike reviews and merges.
2. **Affiliate codes are sacred:** the site always shows Mike's codes **BRO** or **BROTRADING** — never a firm's own public promo code (PASS30 etc.), even if their site advertises one. All affiliate URLs live in `functions/go/_links.js`; on pages, always link via `/go/<firm>` so clicks are tracked.
3. **Official firm sites are the source of truth** for prices, rules, and payouts — never comparison/review sites. When in doubt, screenshot the firm's own pricing page.
4. **Payout-speed claims:** never state "payout after X days" based on minimum trading days alone — consistency rules also delay payouts. Check `data/firm-rules.json` for the full rule set per firm.
5. Phidias affiliate amounts are in **USD** (since May 2026).

## 4. Tech setup (the good news: it's simple)

- Pure **HTML/CSS/JS, no framework, no build step**. What you commit is what ships.
- Hosting: **Cloudflare Pages**, auto-deploy on every push.
  - `main` → **propfirmbro.com** (production)
  - any branch → its own preview at `https://<branch-name-with-dashes>.propfirmbro.pages.dev` (e.g. branch `kruchi/new-hero` → `kruchi-new-hero.propfirmbro.pages.dev`). Push, wait ±1 minute, refresh.
- Shared layout parts: `header.html` + `header.js`, `footer.html` + `footer.js`, `head.js` (loaded on every page). Change the header once, every page gets it.

## 5. Map of the repo (your areas)

| Path | What it is |
|---|---|
| `index.html` | Homepage (big file). Hero, BRO Deals carousel, firm sections |
| `index.html` → `const deals = [...]` (~line 593) | **THE DAILY DEALS.** Array of deal cards: `name`, `logo`, `discount`, `rating`, `details` (HTML allowed), `code`, `link` (always `/go/<firm>`) |
| `CompareTopFirms/` | Comparison pages: `comparison.html`, `TrueCost.html`, `Drawdown.html`, `StartCost.html`, `QuickFunding.html`, `bestDeals.html` |
| `data/*.json` | The comparison **data** (edit these, not the HTML tables): `comparison-rows.json`, `truecost-firms.json`, `drawdown-firms.json`, `startcost-firms.json`, `quickfunding-firms.json`, `firm-profiles.json`, `firm-rules.json`, `firms-nav.json` |
| `Firms/` | Per-firm landing pages (Apex, Tradeify, FundedSeat, …), rendered data-driven via `firm-loader.js` / `firm.js` + `data/firm-profiles.json` |
| `Photos/firms/` | Locally hosted firm logos — never hotlink external logo URLs |
| `Resourses/`, `More/` | Trading tools catalog, about/contact/privacy |
| `GiveAway.html`, `giveaway/`, `wheel/` | Friday giveaway pages (Mike runs these — coordinate before changing) |
| `assets/` | CSS/JS assets |
| ❌ `rewards/`, `functions/`, `admin/`, `migrations/`, `scripts/` | Rewards system + backend — **Mike's territory** |

## 6. Your daily deals routine

1. Check each firm's current promo on its **official site** (or Mike messages you the new deal).
2. Update the matching entry in the `deals` array in `index.html`: `discount`, `details`, and `rating` if changed. `code` stays BRO/BROTRADING, `link` stays `/go/<firm>`.
3. If a deal appears on other pages too (`CompareTopFirms/bestDeals.html`, firm pages, `data/*.json`), keep them consistent.
4. Push your branch → check the preview → PR → Mike merges.

## 7. Site style

Dark navy + bright blue + gold. Backgrounds `#020617` / `#000814` / `#0a1c3a`, primary blue `#2c9eff` / `#3db4ff`, gold accent `#ffcf40`, text gradient white → `#94b5ff`. Match these in anything new.

## 8. Questions?

Ask Mike (WhatsApp) — or open the repo with Claude Code and ask Claude; it knows this codebase well. Welcome aboard! 🚀

*Prepared by Mike & Claude, 2026-07-28.*
