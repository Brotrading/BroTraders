# Bro Rewards — Complete Briefing for Mike

**Instructions for Claude:** Read this entire file before saying anything. Then greet Mike, give him a one-sentence summary of where things stand, and work through the open items in Section 5 **one at a time** — ask one question, wait for the answer, make any code changes needed, then move on. If Mike asks a question at any point, answer it using the background in Sections 3, 4, 6, and 7 before continuing. At the end, summarise what was decided and walk Mike through the go-live checklist in Section 8.

---

## Section 1 — Quick Reference

| Item | Value |
|---|---|
| Production site | `https://propfirmbro.com` (runs from `main` branch) |
| Preview site | `https://nick-rewards-system.propfirmbro.pages.dev` (always the latest push on `nick/rewards-system`; hash URLs like 9998d255.* are frozen snapshots of one deploy — do not use) |
| Working branch | `nick/rewards-system` |
| Admin dashboard | `/admin/rewards.html` |
| Bro Store admin | `/admin/store.html` |
| Admin token | Cloudflare Pages → Settings → Environment Variables → `ADMIN_TOKEN` |
| Test account | `nick.van.duijne+test1@hotmail.com` (active in preview, has points) |
| GitHub account | NickvanDuijne (not Nick-Aiden — that one has no push rights) |
| Supabase project | propfirmbro (dashboard: supabase.com) |
| D1 production DB | `propfirmbro-clicks` |
| D1 preview DB | `propfirmbro-clicks-preview` |
| Cron job | cron-job.org — "Bro Rewards — daily notifications" (currently disabled, enable on launch day) |

---

## Section 2 — Git Rules

- Freely read, edit, commit, and push to `nick/rewards-system`.
- **Never push directly to `main`.**
- If Mike asks to merge to main or go live: ask "Are you sure you want to merge the rewards system to main and make it live on propfirmbro.com?" If Mike confirms, proceed with the merge.
- After merging: enable the cron job (see Section 8).

---

## Section 3 — How the System Works

### Overview

Bro Rewards is a loyalty programme for propfirmbro.com. Users earn Bro Points for actions on the site and redeem them in the Bro Store for real prizes. The programme has two tiers: **Free** (default) and **Pro Bro** (paid Whop subscription, gives 1.5× point multiplier).

### How users earn points

| Action | Free | Pro Bro |
|---|---|---|
| Signup bonus | 2,500 pts | 2,500 pts |
| Complete profile | 1,000 pts | 1,500 pts |
| First claim approved (once ever) | +500 pts | +500 pts |
| Daily login | 100 pts | 150 pts |
| Day-7 streak milestone (once) | +1,000 pts | +1,000 pts |
| Every 30-day streak milestone | +2,500 pts (fixed) | Same |
| Prop firm review approved | 2,500 pts | 3,750 pts |
| Referral signup | 1,000 pts | 1,500 pts |
| Referral first purchase | 10% of friend's purchase pts | Same |
| Pro Bro welcome bonus (once) | — | 5,000 pts |
| Purchase cashback | ~price × 10 pts (~1%) | ~price × 15 pts (~1.5%) |

### Purchase cashback (the main mechanic)

When a user buys a prop firm account via a BRO affiliate link, they submit a cashback claim. Mike reviews it manually in the admin dashboard and approves or rejects it. On approval, the points are instantly added to the user's balance.

Points per purchase are based on fixed tables per firm (in `_lib.js` → `FIRM_POINTS`). The table was built from prop firm pricing screenshots in June 2026. Example: Apex Intraday Trail 100K One Pack ($39.90) = 400 pts base, 600 pts Pro Bro.

### The Bro Store

Users spend points in the Bro Store (`/rewards/catalog.html`). Three types of items:
1. **Prop firm account** — delivered via a one-time discount code. Mike loads a pool of codes per item via admin. User redeems → gets a code instantly → uses it at the prop firm checkout for a free/discounted account.
2. **Pro Bro membership** — fulfilled automatically via Whop. User redeems → system calls Whop → Pro Bro is activated immediately.
3. **Manual** — Mike handles fulfillment himself (e.g. giveaway tickets, merch).

The funded 25K prop firm account (100,000 pts) is behind a gate: only unlocks after the user has earned 90,000 pts specifically from purchases (not from streaks or referrals). This protects Mike's margin.

### Daily streak

Users claim a daily login bonus by visiting the site each day. Missing a day breaks the streak. If they miss exactly one day, they can restore the streak for 250 pts (costs points to recover, but cheaper than restarting). The streak card is on the account page.

### Referral system

Every user gets a unique referral link (visible on account page). When someone signs up via that link and makes their first purchase, the referrer gets bonus points equal to the points awarded for that purchase. Example: friend buys Apex $39.90 (600 pts Pro rate) → referrer gets 600 pts too. This replaced the old flat 25,000 pts which was too generous relative to small commissions.

### Reviews

Users can write prop firm reviews from the account page. Mike approves/rejects reviews in the admin dashboard. Approved reviews earn the user 2,500 pts (Pro: 3,750).

### Leaderboard

Public leaderboard at `/rewards/leaderboard.html` showing top 10 earners and top 10 referrers. Visible without login.

---

## Section 4 — Infrastructure

### Cloudflare (Workers + Pages + D1)

The entire backend runs as Cloudflare Workers (serverless functions in `functions/`). The site is hosted on Cloudflare Pages. The database is Cloudflare D1 (SQLite at the edge).

- **Production database:** `propfirmbro-clicks` — real user data, live
- **Preview database:** `propfirmbro-clicks-preview` — test data only, completely separate. This was specifically set up so testing on preview never touches real production data.
- All 18 database migrations (0001–0018) have already been run on both databases.
- Cloudflare environment variables set: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_TOKEN`, `STATS_TOKEN`, `ANTHROPIC_API_KEY`, `WHOP_WEBHOOK_SECRET`.

### Supabase (authentication)

Supabase handles user login and registration. It stores user sessions and sends verification emails. The D1 database syncs user data from Supabase on every login (via `/api/rewards/sync`).

- Email/password login with email verification ✅
- Google OAuth ✅
- Discord OAuth ✅ (tested by Mike)
- Site URL: `https://propfirmbro.com`
- Redirect URLs: `https://propfirmbro.com/rewards/account.html` and `https://nick-rewards-system.propfirmbro.pages.dev/rewards/account.html`
- SMTP via Resend configured in Supabase for all auth emails (welcome, reset password, etc.)

### Resend (transactional email)

Resend sends all rewards-specific emails from `noreply@propfirmbro.com`. Domain is verified. DMARC record is set. Emails sent: claim approved, claim rejected, review approved, streak-at-risk notification, near-threshold notification ("you're X pts away from [prize]"), discount code delivery.

### Whop (Pro Bro subscriptions)

Pro Bro is sold as a Whop subscription. When someone subscribes or cancels, Whop sends a webhook to `/api/webhooks/whop`. The system updates `is_pro_bro` in D1 accordingly and awards/removes the Pro Bro multiplier. The welcome bonus (5,000 pts) is awarded once on first activation (protected by `pro_bro_bonus_paid` flag). Webhook URL: `https://propfirmbro.com/api/webhooks/whop`. Signing secret is set in Cloudflare.

### Cron job (cron-job.org)

A daily cron job calls `POST /api/rewards/notify` with the admin token. This sends two types of automated emails:
1. **Streak-at-risk** — sent to users who haven't logged in today but have a streak worth protecting
2. **Pending claim reminder** — sent to the admin email if there are claims that have been pending for more than 7 days without review

The job is set up on cron-job.org but is currently **disabled**. Enable it on launch day.

---

## Section 5 — Open Items (work through these with Mike)

### Item 1 — Fill the Bro Store ⚠️ REQUIRED

The Bro Store is empty. Mike needs to add items via the admin UI at:
`https://nick-rewards-system.propfirmbro.pages.dev/admin/store.html`

Enter the admin token, click "+ New Bro Pack". The page has a full how-to guide at the top.

**Ask Mike these questions one at a time:**

**1a.** Does he want to add funded prop firm accounts as prizes? Which firms and which account sizes? Does he have discount codes from those firms (e.g. 100% discount codes Apex generates for him) to load into the pool?

**1b.** Does he want "Pro Bro — 1 month" (30,000 pts) as a redeemable item? This is gate-exempt (always available, no purchase history required) and costs Mike nothing because Pro Bro is a digital Whop product. It's a great conversion tool — users who redeem this often become paying Pro Bro subscribers afterwards.

**1c.** Does he want intermediate prizes to keep the programme engaging between small daily rewards and the big funded account? Suggested ladder (all near-zero cost to Mike):
- Exclusive discount code for a specific firm (~5,000 pts) — e.g. a deeper BRO code deal
- Extra giveaway ticket (~10,000 pts)
- Pro Bro 3 months (~60,000 pts)
- Funded 25K prop firm account (100,000 pts, gate-protected)

Without intermediate items, users might lose motivation because the funded account takes a long time to reach.

**1d.** Does he want a stock limit on anything? Leave empty for unlimited. Note: for discount code packs, the code pool itself is already the natural cap — when codes run out the item shows "Temporarily unavailable" automatically.

### Item 2 — Monthly subscription accounts ⚠️ REQUIRED

NexGen Evaluation ($30–$80/month) and TopOne Elite Daily ($89–$199/month) have been removed from the claim form for now. The question is whether users should be able to claim cashback on recurring monthly subscriptions.

**Ask Mike:** Should users be able to claim Bro Points every month when they pay their subscription fee?

- **Yes** → add them back (one line of code change). Accept that these will always show as "high risk" in the admin because the affiliate click is older than 30 days by the time month 2 arrives — but Mike can simply approve them manually since the pattern is expected.
- **No** → leave as-is. Users with these firms can't claim cashback.

### Item 3 — Confirm earn rates ⚠️ REQUIRED

Show Mike the table from Section 3 and ask if he's happy with the numbers. Key points to explain if he asks:

- **Why 1,000 pts = $1?** → Calibrated so the funded account prize ($100 value at 100,000 pts) only unlocks after ~$9,000 in purchases via BRO links (= ~$900 commission at 10% = safe margin for Mike). See Section 6 for full financial rationale.
- **Why is the referral bonus proportional now?** → The old flat 25,000 pts ($25) was unsustainable for small accounts. If a friend bought an Apex $20 account, Mike earned ~$2 commission but owed $25 in referral points. The new system gives the referrer the same points as the friend's purchase — so if the friend buys a $20 account (200 pts), the referrer gets 200 pts ($0.20). Fair and always profitable for Mike.
- **Why is Pro Bro gate-exempt?** → Getting users into Pro Bro converts them to paying subscribers. The cost to Mike is zero (digital product). It's worth giving away as a Bro Store item.

### Item 4 — Alpha Futures + YRM Prop (quick)

These firms are currently not in the claim form. Their pricing wasn't confirmed when the system was built.

**Ask Mike:** Does he have current prices for Alpha Futures and YRM Prop? If yes, Claude can add them to the system. If not, launch without them and add later.

If Mike has prices: Claude will add them to `data/firm-accounts.json` and `functions/api/rewards/_lib.js` (FIRM_POINTS table) and re-add the dropdown options in `rewards/claim.html`.

### Item 5 — Test the claim flow (5 minutes)

Mike should try the full user experience before going live:
1. Open `https://nick-rewards-system.propfirmbro.pages.dev/rewards/claim.html`
2. Log in or create an account
3. Select any firm, any account type, enter any date and order reference, upload any screenshot
4. Submit the claim
5. Go to `/admin/rewards.html`, find the claim, and approve it
6. Check that points appear in the account page ledger

This confirms everything works end-to-end from a user perspective.

### Item 6 — Post-launch website strategy (no blocker, for later)

Note these for Mike to think about — they don't block launch:
- **"Mike's pick" on homepage** — which firm does Mike currently use himself? Could be a high-conversion section for his YouTube/Discord audience.
- **Post-livestream landing page** at `/stream` — a simple page Mike updates after each stream with the firm/deal from that day. To be linked in stream descriptions and pinned in Discord. Requires Mike's commitment to keep it current.
- **Giveaway funnel** — add a thank-you page after giveaway signup + optional email ("You're entered — but you can also buy your own account now with code BRO").
- **Compare tool** — needs Mike to provide a list of which account combinations across firms are comparable (e.g. "Apex 100K Standard vs FundedSeat 100K Flex are comparable"). Without this list the tool can't be built.
- **BRO code advantage** — for which firms does the BRO code give an extra discount vs the public deal? Crucial for site messaging.

---

## Section 6 — Financial Model & Rationale

### The core model

Mike earns ~10% affiliate commission on every prop firm account purchased via a BRO affiliate link. The Bro Rewards programme pays users back a small fraction of that in points. The model is calibrated so Mike keeps 8.5–9% and users get ~1–1.5%.

### Why 1,000 pts = $1

This exchange rate was chosen to make the funded account prize financially safe for Mike:
- Funded 25K account prize = 100,000 pts = $100 value to the user
- Gate: user needs 90,000 purchase pts before the funded account unlocks
- 90,000 purchase pts = ~$9,000 in purchases via BRO links
- At 10% commission: ~$900 earned by Mike on those purchases
- After paying out $100 in prizes: Mike keeps $800 minimum = 8.9% net margin
- In practice better, because not every user who reaches the gate will redeem

### Why the gate is 90,000 purchase pts (not 0)

Without the gate, a user could sign up, get 2,500 signup pts + 5,000 Pro Bro welcome bonus + a few streak pts, and try to redeem the funded account having spent almost nothing via BRO links. The gate ensures Mike has earned at least ~$900 in commissions from that user before ever paying out the $100 prize. Purchase pts come only from approved cashback claims — streaks, referrals, and bonuses don't count toward the gate.

### Why ~1% cashback (not more)

Prop firm margins vary. Some firms pay 10%, some less. At 1% cashback to the user, Mike always keeps 9× more than he pays out — regardless of which firm. Even on a $20 Apex account (where commission might be $2), paying out 200 pts ($0.20) is safe.

### Why Pro Bro gets 1.5× (not more)

The multiplier needs to be generous enough to feel valuable but not so high that it eats into margins. 1.5× means Pro users earn ~1.5% cashback vs 1% for Free users. On a $100 purchase: Free earns 1,000 pts ($1), Pro earns 1,500 pts ($1.50). The extra $0.50 cost to Mike is covered by the Whop subscription revenue from Pro Bro.

### Why the streak bonuses are what they are

- **Day-7 milestone (5,000 pts = $5):** A meaningful one-time reward for establishing a habit. Duolingo-inspired. Costs Mike $5 per user who reaches it, but these users are already engaged enough to come back 7 days in a row — they're valuable.
- **Mystery chest every 30 days (2,000–5,000 pts, avg ~3,500 pts = ~$3.50):** Keeps long-term users engaged. The randomness (Duolingo-style) makes it more exciting than a fixed amount. Cost is low and only incurred by highly loyal users.

---

## Section 7 — Fraud Prevention & Risk Levels

### Why manual review (not automatic approval)

Mike can't automatically verify purchases against prop firm data — there's no API for that. Manual review lets Mike cross-check the uploaded proof of purchase against the claimed firm, amount, and date. The system provides tools to make this fast (bulk approve, risk badges, click correlation) but the final call is always Mike's.

### Risk levels explained

Every claim gets an automatic risk badge in the admin dashboard:

| Badge | Meaning |
|---|---|
| 🟢 **Click** | User had an affiliate click for this firm recorded within 6 days before their purchase date. Low risk — they clearly came via BRO. |
| 🟡 **Present** | An affiliate click exists for this firm, but it was more than 6 days before the purchase date. Medium risk — could be legitimate (they clicked weeks ago and came back to buy). |
| 🔴 **No click** | No affiliate click found for this firm at all. High risk — they may not have used the BRO link, or used a different device/browser. |

Additional high-risk flags:
- Amount > $500 (large claims get extra scrutiny)
- Shared email address (same firm email used by another user — possible fraud ring)
- Duplicate proof hash (exact same file uploaded before — automatic block, not just a flag)

### Fraud prevention layers

1. **Firm email verification** — Before submitting a claim, users must verify the email address they used when signing up at the prop firm. A 6-digit code is sent to that email. Once a claim is approved, that email address is locked to the user and can't be changed. In the admin, Mike can see the verified firm email next to each claim to cross-check against the purchase confirmation.

2. **Order reference deduplication** — Each claim requires an order reference number. The system blocks duplicate order refs, so the same purchase can't be claimed twice.

3. **Proof of purchase hash** — A SHA-256 hash of the uploaded file is stored. If the same file is submitted again (even from a different account), it's automatically blocked.

4. **IP logging** — The IP address of every claim submission is recorded. Visible in admin for pattern detection.

5. **Brute-force protection** — The firm email verification code is blocked after 5 wrong attempts.

6. **Rate limiting** — Cloudflare WAF rule blocks IPs that make more than 3 requests per 10 seconds to `/api/rewards/`.

7. **Max 1 claim per firm** — A user can only have one pending claim per prop firm at a time. They can't flood the queue.

---

## Section 8 — Admin Dashboard Guide

### Reviewing claims

Go to `/admin/rewards.html`, enter the admin token. Pending claims appear at the top. For each claim:
- Check the risk badge (click/present/no click)
- Check the verified firm email matches what you'd expect
- Check the proof of purchase screenshot
- Check amount and account type look plausible
- Click **Approve** (awards points + sends approval email to user) or **Reject** (requires a reason, sends rejection email)

**Bulk approve:** Check multiple claims, click "Approve selected". Good for a batch of low-risk claims.

**Rejection reasons available:**
- Proof of purchase unclear or missing
- Firm email not verified
- Duplicate proof of purchase
- Amount doesn't match our records
- Purchase older than 30 days
- Other (custom text)

### Points management

In the admin dashboard you can manually add or subtract points from any user (e.g. for promotions or corrections). Every manual adjustment creates a ledger entry visible to the user.

### Referral overview

A referral section in the admin shows who referred who and how many points have been earned per referral.

### Bro Store admin

`/admin/store.html` — manage packages, add/remove discount codes. See the instruction block at the top of that page for a full guide.

---

## Section 9 — Anticipated Questions & Answers

**Q: Can I change the earn rates after launch?**
A: Yes. Edit `EARN_RATES` in `functions/api/rewards/_lib.js`. Changes apply to new events only — existing ledger entries are permanent. If you want to backfill, that requires a manual SQL update on D1.

**Q: Can I add new firms after launch?**
A: Yes. Add the firm to `data/firm-accounts.json` (account types + prices), add to `FIRM_POINTS` in `_lib.js` and in `admin/rewards.html`, and add an `<option>` to the firm dropdown in `rewards/claim.html`.

**Q: What if a discount code pool runs out?**
A: The Bro Store shows "Temporarily unavailable" on that item automatically. Add more codes via admin/store.html → "Manage codes".

**Q: What happens when someone redeems Pro Bro from the store?**
A: The system calls Whop automatically and activates the Pro Bro membership. The user gets 25,000 welcome bonus points immediately (if they haven't had Pro Bro before). No manual action needed from Mike.

**Q: What does the cron job actually do?**
A: It runs daily and sends two types of emails: (1) streak-at-risk reminders to users who haven't claimed their daily login today but have a streak to protect, and (2) a reminder to the admin if there are pending claims older than 7 days. It should be enabled on launch day.

**Q: How do I find a specific user?**
A: In the admin dashboard, claims are listed with email addresses. You can also look up users directly in the Supabase dashboard (Auth → Users) or in D1 (Cloudflare dashboard → D1 → propfirmbro-clicks → `users` table).

**Q: What is the difference between the production and preview databases?**
A: They are completely separate SQLite databases in Cloudflare D1. Production (`propfirmbro-clicks`) holds real user data. Preview (`propfirmbro-clicks-preview`) is only used by the preview deployment and holds test data. Nick set this up specifically so testing never pollutes real data.

**Q: Can I test on the preview site without affecting real users?**
A: Yes, that's exactly what the preview site is for. Any accounts created on `nick-rewards-system.propfirmbro.pages.dev` are completely isolated from `propfirmbro.com`.

**Q: Why did we remove Alpha Futures and YRM Prop from the claim form?**
A: Their current prices weren't confirmed at build time, so we can't set accurate fixed points for their accounts. Rather than use an unreliable estimate, Nick removed them and put them on the backlog. Once Mike provides current prices, they can be added in minutes.

**Q: Why are monthly subscriptions removed from the claim form?**
A: It's unclear whether Mike wants to pay cashback every month when a user renews their subscription. One-time purchases are straightforward — the user buys once, claims once. Monthly subscriptions mean the user could claim every 30 days indefinitely. Nick removed them pending Mike's decision.

**Q: What does "mystery chest" mean?**
A: Every time a user completes a 30-day login streak, instead of a fixed reward they open a mystery chest for a random amount between 2,000 and 5,000 pts. The randomness (inspired by Duolingo) makes it more exciting and encourages users to keep streaking. Average payout is ~3,500 pts ($3.50), which is a low cost for Mike relative to the engagement it drives.

**Q: Why does the referral bonus equal the friend's purchase points?**
A: The original flat 25,000 pts ($25) was problematic: if a friend bought a cheap $20 account generating ~$2 commission for Mike, Mike couldn't afford a $25 referral payout. The proportional system is always safe: if the friend buys 400 pts worth of accounts, the referrer gets 400 pts. The referral bonus is always proportional to the commission Mike earned.

**Q: How does click attribution work?**
A: When a user visits propfirmbro.com via a BRO affiliate link, a click event is recorded in D1 (user ID + firm + timestamp). When they later submit a cashback claim, the system checks whether a matching click exists for that user + firm combination. If a click within 6 days is found → "click" (low risk). If a click exists but is older → "present" (medium risk). If no click at all → "no click" (high risk). This helps Mike identify claims where the user may not have actually used the BRO affiliate link.

**Q: Where is the admin token and how do I use it?**
A: The token is stored in Cloudflare Pages → Settings → Environment Variables → `ADMIN_TOKEN` (production) and the same for preview. You paste it into the token field on the admin dashboard login screen. Never share it publicly — it gives full admin access to the rewards system.

**Q: Why is there a separate ADMIN_TOKEN instead of using the STATS_TOKEN?**
A: They were split for security. The STATS_TOKEN is used for analytics read-access. The ADMIN_TOKEN gives write access (approve claims, adjust points, manage store). Having them separate means a stats integration can't accidentally (or maliciously) approve claims.

**Q: Can I change Bro Store items after launch?**
A: Yes, any time. Edit/deactivate/delete items via admin/store.html. Changes take effect immediately.

**Q: How does the email verification for firm emails work?**
A: When a user selects a prop firm on the claim page, they're asked to enter the email address they used to register at that firm. The system sends a 6-digit verification code to that email. Once they verify, they can submit the claim. After the first claim from that firm is approved, the email is locked and can't be changed — this prevents swapping in a friend's email after the fact.

---

## Section 10 — Key Files Reference

| File | Purpose |
|---|---|
| `functions/api/rewards/_lib.js` | Core logic: FIRM_POINTS table, earn rates, point calculations, ledger writes |
| `functions/api/rewards/admin.js` | Admin API: approve/reject claims, manage store, adjust points |
| `functions/api/rewards/claim.js` | User cashback claim submission |
| `functions/api/rewards/me.js` | User data endpoint (balance, ledger, claims, streak) |
| `functions/api/rewards/sync.js` | Syncs Supabase auth to D1 on login |
| `functions/api/rewards/redeem.js` | Bro Store redemption logic |
| `functions/api/rewards/daily.js` | Daily login streak claim |
| `functions/api/rewards/notify.js` | Cron endpoint: streak-at-risk + pending claim emails |
| `functions/api/rewards/firm-email.js` | Firm email verification (send code, verify code) |
| `functions/api/webhooks/whop.js` | Whop webhook handler (Pro Bro activate/deactivate) |
| `rewards/account.html` | User account page (balance, ledger, claims, streak, referral) |
| `rewards/claim.html` | Cashback claim submission form |
| `rewards/catalog.html` | Bro Store (redemption) |
| `rewards/login.html` | Login page |
| `rewards/signup.html` | Signup page |
| `admin/rewards.html` | Admin dashboard (claims, referrals, points management) |
| `admin/store.html` | Bro Store management (packages, discount codes) |
| `data/firm-accounts.json` | Account types and reference prices per firm |
| `js/auth.js` | Shared auth layer (Supabase session, D1 sync, BroAuth API) |
| `js/click-attribution.js` | Records affiliate clicks per user per firm |
| `migrations/` | D1 database schema (0001–0018, all already run) |

---

## Section 11 — Go-Live Checklist

Once all items in Section 5 are resolved and Mike confirms he's ready:

1. Push any final changes to `nick/rewards-system`
2. Ask Mike: "Are you ready to go live?"
3. If yes, confirm: "This will merge the rewards system to main and make it live on propfirmbro.com — are you sure?"
4. If confirmed:
   - Run: `git checkout main && git pull origin main`
   - Run: `git merge nick/rewards-system`
   - Run: `git push origin main`
   - Cloudflare Pages will auto-deploy within ~1 minute
5. Enable the cron job on cron-job.org:
   - Job name: "Bro Rewards — daily notifications"
   - URL: `https://propfirmbro.com/api/rewards/notify`
   - Method: POST
   - Header: `X-Admin-Token: [value from Cloudflare ADMIN_TOKEN]`
   - Schedule: daily (e.g. 09:00)
   - Status: **Enable**
6. Verify production site: open `https://propfirmbro.com/rewards/login.html` — the rewards system should be live.

---

*Briefing prepared by Nick. Last updated: 2026-06-27.*
