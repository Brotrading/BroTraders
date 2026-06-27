# Bro Rewards — Briefing for Mike

Hi Claude! Please read this entire file first, then introduce yourself to Mike and walk him through the open items **one at a time** — don't dump everything at once. Ask one question, wait for the answer, make any necessary code changes, then move to the next item. At the end, summarise what was decided and what still needs to happen.

---

## Context

This is the **propfirmbro.com** codebase. Nick (the other developer) has built a complete Bro Rewards loyalty system for Mike's prop firm comparison site. The system is finished and fully tested on a preview environment. It is not yet live.

**Preview URL:** `https://9998d255.propfirmbro.pages.dev`  
**Working branch:** `nick/rewards-system` (make sure you're on this branch)  
**Production site:** `https://propfirmbro.com` (running from `main`)

The rewards system includes: user registration & login (email + Google + Discord), daily login streaks, cashback claims for prop firm purchases, a Bro Store where users redeem points, an admin dashboard, fraud prevention, and automated emails via Resend.

---

## Git rules

- You can freely **read, edit, commit, and push** to `nick/rewards-system`.
- **Never push directly to `main`.**
- If Mike asks to merge to main: **always ask for explicit confirmation first** ("Are you sure you want to merge the rewards system to main and make it live on propfirmbro.com?"). If Mike confirms, you may proceed with the merge.
- Use the GitHub account **NickvanDuijne** (not Nick-Aiden — that account has no push rights).

---

## What's already done ✅

- Full rewards system built and tested end-to-end
- Cloudflare D1 database (migrations 0001–0018) — live on both production and preview
- Supabase auth (email, Google, Discord) — configured and tested
- Resend email — all transactional emails working
- Whop webhook — Pro Bro activation/deactivation tested and working
- Fraud prevention — IP logging, proof hash dedup, firm email verification, rate limiting
- Admin dashboard at `/admin/rewards.html` and Bro Store admin at `/admin/store.html`
- Bro Store has discount code pool system — Mike manages it via the admin UI, no code needed
- Financial model confirmed: Mike keeps ~8.5–9% of the 10% affiliate commission

---

## What Mike needs to do — open items

Work through these in order. Items 1–3 must be resolved before going live. Items 4–5 are quick confirmations. Items 6+ are post-launch.

---

### 1. Fill the Bro Store (REQUIRED before launch)

The Bro Store is currently empty. Mike needs to add items via the admin UI — no code required.

**How:** Open `https://9998d255.propfirmbro.pages.dev/admin/store.html`, enter the admin token, and click "+ New Bro Pack". There's an instruction block at the top of that page explaining the three types:
- **Prop Firm Account** — fulfilled via a one-time discount code Mike adds to the pool
- **Pro Bro membership** — auto-fulfilled via Whop, no codes needed (already configured)
- **Other / manual** — Mike handles fulfillment himself

**Questions to ask Mike one at a time:**
- a) Does he want to add any funded prop firm accounts? If so, which firms and account sizes — and does he have discount codes from those firms to load into the pool?
- b) Does he want Pro Bro (1 month, 30,000 pts) as a redeemable item? (It's already configured — just needs to be activated.)
- c) Does he want any low-cost "intermediate" items to keep the program engaging? Suggestions: exclusive discount code (~5,000 pts), extra giveaway ticket (~10,000 pts), Pro Bro 3 months (~60,000 pts). These have near-zero cost to Mike and give users something to work towards before the big prizes.
- d) Does he want to cap how many of each item can be redeemed? (Leave empty for unlimited, or set a number. For discount code packs, the code pool is already the natural cap.)

---

### 2. Monthly subscription account types (REQUIRED before launch)

NexGen Evaluation accounts ($30–$80/month) and TopOne Elite Daily accounts ($89–$199/month) have been removed from the claim form because it's unclear whether Mike wants users to claim cashback on recurring monthly subscriptions.

**Question for Mike:** Should users be able to claim Bro Points for monthly subscription accounts?
- **Yes** → Claude adds them back to the claim form (one line of code).
- **No** → Leave as-is.

Note: if yes, these claims will always show as "high risk" in the admin dashboard (because the affiliate click is older than 30 days by the time the second month rolls around). Mike would need to manually approve them regardless.

---

### 3. Confirm earn rates (REQUIRED before launch)

The financial model is finalised but Mike hasn't formally signed off. Ask Mike if he's happy with these numbers:

| Action | Free | Pro Bro |
|---|---|---|
| Signup bonus | 5,000 pts | 7,500 pts |
| Complete profile | 1,000 pts | 1,500 pts |
| First claim approved (once) | +500 pts | +500 pts |
| Daily login | 100 pts | 150 pts |
| Day-7 streak milestone | +5,000 pts | +5,000 pts |
| Every 30-day streak milestone | Mystery chest: 2,000–5,000 pts (random) | Same |
| Review approved | 2,500 pts | 3,750 pts |
| Referral signup | 1,000 pts | 1,500 pts |
| Referral first purchase | = same pts as friend's purchase | = 1.5× friend's purchase |
| Pro Bro welcome bonus | — | 25,000 pts |
| Purchase cashback | ~price × 10 pts (~1%) | ~price × 15 pts (~1.5%) |

**Bro Store prices:**
- Pro Bro 1 month: 30,000 pts (no gate — always redeemable)
- Funded 25K account: 100,000 pts (only unlocks after 90,000 purchase pts earned)

**Important on the referral bonus:** this is no longer a flat 25,000 pts. It's now proportional — if a friend buys an Apex $39.90 account (worth ~600 pts), the referrer also gets ~600 pts. This fixes the concern about referral bonuses being too high relative to commissions.

**1,000 pts = $1 in redemption value.** This means ~1% cashback on purchases, and the funded account prize ($100 value) requires roughly $9,000 in purchases to unlock — giving Mike a safe margin.

---

### 4. Alpha Futures + YRM Prop (quick decision)

These two firms have been removed from the claim form because their pricing wasn't confirmed. They're on the backlog.

**Question:** Does Mike have current prices for Alpha Futures and YRM Prop? If yes, Claude can add them. If not, launch without them and add later.

---

### 5. Test the claim flow as a user (5 minutes)

Mike should try submitting a claim himself to experience the user flow:
1. Go to `https://9998d255.propfirmbro.pages.dev/rewards/claim.html`
2. Log in (create an account or use an existing one)
3. Select a firm, choose an account type, enter any date and order reference, upload any screenshot
4. Submit — then approve it in the admin dashboard at `/admin/rewards.html`

This is just to verify everything feels right from a user perspective before going live.

---

### 6. After launch — website strategy (discuss with Nick)

These don't block launch but are worth noting:
- **"Mike's pick" on homepage** — which firm does Mike currently use himself?
- **Post-livestream landing page** (/stream) — a simple page Mike updates after each stream with the firm/deal he discussed
- **Giveaway funnel** — does Mike want to add a thank-you page + email after giveaway signup?
- **Compare tool** — needs a list from Mike of which account combinations across firms are comparable
- **BRO code advantage** — which firms give an *extra* discount with the BRO code vs the public deal?

---

## When everything is ready

Once items 1–3 are resolved and Mike is happy:
1. Push any remaining changes to `nick/rewards-system`
2. Ask Mike explicitly: "Are you ready to go live?"
3. If yes: confirm once more ("This will merge the rewards system to main and make it live on propfirmbro.com — are you sure?")
4. If confirmed: merge `nick/rewards-system` into `main` and push
5. Enable the daily cron job on cron-job.org: job name "Bro Rewards — daily notifications", URL `https://propfirmbro.com/api/rewards/notify`, method POST, header `X-Admin-Token: [admin token]`

---

*This briefing was prepared by Nick. Questions about the codebase? Ask Claude — the full rewards system is documented in the code and commit history on the `nick/rewards-system` branch.*
