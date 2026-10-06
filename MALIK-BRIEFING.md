# Malik's Briefing — propfirmbro.com

**Instructions for Claude:** If Malik opens this repo with Claude Code, read this file first, then help him within the scope and rules below.

Welcome Malik! This doc is your map of the site, what you can work on, and the house rules.

---

## 1. What this site is

**propfirmbro.com** is Mike's (Bro Trading) affiliate site for futures prop firms. Visitors compare firms, click through via Mike's affiliate links (`/go/<firm>` redirects), and buy accounts with his codes — that's the revenue. Everything on the site exists to make comparing easy and clicking attractive.

## 2. Scope

You can work on **everything on the website**: design/layout, comparison pages and tools, firm pages, the daily deals, new sections, performance, SEO.

Ask Mike first before touching:
- `functions/` and `admin/` (affiliate redirects, click tracking — they handle money and tracking)
- `migrations/` (database)
- `GiveAway.html`, `giveaway/`, `wheel/` (Mike runs the Friday giveaways)

There is no rewards/points system in this repo anymore (parked and archived by Mike) — don't build or restore one.

## 3. House rules (non-negotiable)

1. **Nothing goes to `main` without Mike.** `main` deploys straight to propfirmbro.com within a minute. GitHub enforces this: a Pull Request and Mike's approval are required. Work on a branch `malik/<topic>`, push, check the preview, open a PR, send Mike the preview link. Mike approves and merges — and gives a final "yes" before it goes live. Pushing more commits after approval resets the approval.
2. **Affiliate codes are sacred:** the site only ever shows Mike's codes **BRO** or **BROTRADING** — never a firm's own public promo code, even if their site advertises one. Link to firms via `/go/<firm>` only (never paste raw affiliate URLs into pages); all URLs live in `functions/go/_links.js`.
3. **Official firm sites are the source of truth** for prices, rules and payouts — never review/comparison sites. When in doubt, screenshot the firm's own pricing page.
4. **Never invent numbers.** Discount %, prices, ratings: if you don't have a verified value, show a neutral label (e.g. "BRO Code") or ask Mike. Mike's own affiliate deal percentages are private — he must confirm them.
5. **Payout-speed claims:** never state "payout after X days" based on minimum trading days alone — consistency rules also delay payouts. Check `data/firm-rules.json`.
6. **Logos:** local files in `Photos/firms/` only, never hotlinked. Ask Mike before adding a new logo file.
7. **Secrets:** never commit `.env`, API keys, tokens or passwords — this repo is public. If you ever see a secret in the repo, tell Mike immediately. Don't paste screenshots of internal dashboards publicly.
8. The repo uses linear history (squash or rebase merges only) — Mike handles merging.

## 4. Tech setup (simple)

- Pure **HTML/CSS/JS, no framework, no build step**. What you commit is what ships.
- Hosting: **Cloudflare Pages**, auto-deploy on every push.
  - `main` → **propfirmbro.com** (production)
  - any branch → its own preview at `https://<branch-name-with-dashes>.propfirmbro.pages.dev` (`malik/new-hero` → `malik-new-hero.propfirmbro.pages.dev`). Push, wait ~1 minute, refresh.
- Run locally: `python3 -m http.server 8000` in the repo root, or `npx wrangler pages dev .` if you need the `/go/<firm>` redirects to work locally.
- Shared layout: `header.html` + `header.js`, `footer.html` + `footer.js`, `head.js` (loaded on every page). Change the header once, every page gets it.
- You don't get Cloudflare, Supabase or any dashboard access — everything you need is in this repo plus the preview links.

## 5. Active firms — priority order

This is the order Mike wants everywhere (nav, footer, deals, tables). Code in brackets.

1. Tradeify (BRO) 2. TakeProfitTrader (BRO) 3. My Funded Futures (BRO) 4. FundedNext (BROTRADING) 5. Lucid Trading (BROTRADING) 6. Apex Trader Funding (BRO) 7. Top One Futures (BRO) 8. Phidias (BROTRADING) 9. Legends Trading (BRO) 10. DayTraders (BROTRADING) 11. Alpha Futures (BROTRADING) 12. IQ Capital (BRO) 13. BluSky (no code yet — show "TBD", never a guessed one).

**Gone (bankrupt) — never re-add or link:** FundedSeat, NexGen. `/go/fundedseat` and `/go/nexgen` intentionally redirect to the homepage so old links don't break.

## 6. Map of the repo

| Path | What it is |
|---|---|
| `index.html` | Homepage (big file). `const deals = [...]` = the **deals carousel** (name, logo, discount, rating, details, code, link). `const firms = [...]` = the "all firms at 50K" comparison table |
| `CompareTopFirms/` | `comparison.html` (main tool), `TrueCost.html`, `Drawdown.html`, `StartCost.html`, `QuickFunding.html`, `bestDeals.html` (deal cards) |
| `Firms/` | One landing page per firm, filled by `firm-loader.js` / `firm.js` from `data/firm-profiles.json` |
| `More/About-us.html` | Also contains a firm table |
| `data/*.json` | The **data** behind everything: `firm-rules.json` (prices/rules per plan & size), `firm-profiles.json` (firm pages), `firms-nav.json` (header dropdown **and** footer), `comparison-rows.json`, `truecost-firms.json`, `drawdown-firms.json`, `startcost-firms.json`, `quickfunding-firms.json` |
| `scripts/_gen_comparison_json.py` | Generates `data/comparison-rows.json` from `firm-rules.json`. **Don't hand-edit comparison-rows.json** — change `firm-rules.json` and run `python3 scripts/_gen_comparison_json.py` |
| `functions/go/_links.js` | Affiliate URL per firm (Mike's territory) |
| `sitemap.xml` | List of pages for Google |
| `Photos/firms/` | Local firm logos |
| `assets/`, `design-refresh.css` | Shared CSS/JS |

## 7. Adding or removing a firm — checklist

A firm lives in **many** places; missing one is the classic bug. Search the repo for the firm's name (`grep -ri "<name>" .`) before and after.

Add: `data/firm-rules.json`, `data/firm-profiles.json`, `data/firms-nav.json`, firm page in `Firms/`, logo in `Photos/firms/`, `const deals` and `const firms` in `index.html`, card in `bestDeals.html`, `More/About-us.html`, `sitemap.xml`, the other `data/*-firms.json` tool files, `scripts/_gen_comparison_json.py` (then regenerate rows), and ask Mike to add the `/go/<slug>` link. Keep the priority order from section 5.

Remove: all of the above, but **keep** the `/go/<slug>` redirect (Mike repoints it to the homepage). Delete the firm's page and logo, and regenerate `comparison-rows.json`.

## 8. Your daily deals routine

1. Check each firm's current promo on its **official site** (or Mike messages you the new deal).
2. Update the entry in the `deals` array in `index.html` (`discount`, `details`, `rating`); `code` stays BRO/BROTRADING, `link` stays `/go/<firm>`.
3. Keep `bestDeals.html`, firm pages and `data/*.json` consistent with it — a discount % must be the same everywhere.
4. Push your branch, check the preview, open the PR, send Mike the link.

## 9. Site style

Dark navy + bright blue + gold. Backgrounds `#020617` / `#000814` / `#0a1c3a`, primary blue `#2c9eff` / `#3db4ff`, gold accent `#ffcf40`, text gradient white → `#94b5ff`. Match these in anything new.

## 10. Questions?

Ask Mike — or open the repo with Claude Code and ask Claude; it knows this codebase. Welcome aboard!

*Prepared by Mike & Claude, 2026-10-06.*
