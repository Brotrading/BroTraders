# Click Tracking — Cloudflare D1 Setup

> One-time deployment steps for the affiliate click tracking system.
> After this, every click on `/go/<firm>` is logged to D1 and queryable via `/api/click-stats`.

## What this PR adds
- `functions/go/[firm].js` — redirect + click logger
- `functions/go/_links.js` — single source of truth for affiliate URLs
- `functions/api/click-stats.js` — aggregated stats endpoint
- `migrations/0001_clicks.sql` — D1 schema
- All affiliate URLs across 16 HTML files migrated to `/go/<slug>` redirects

## Setup steps (5 min, one time)

### 1. Create the D1 database

Cloudflare dashboard → **Workers & Pages** → **D1** → **Create database**

- Name: `propfirmbro-clicks`
- Click **Create**
- Copy the **Database ID** that's shown (you won't need it for binding, but good to keep)

### 2. Apply the schema

In the D1 database overview → **Console** tab → paste the contents of `migrations/0001_clicks.sql` → **Execute**.

Should report `3 commands executed successfully` (CREATE TABLE + 3× CREATE INDEX, treating IF NOT EXISTS as 1 command each).

### 3. Bind D1 to the Pages project

Cloudflare dashboard → **Workers & Pages** → select the `propfirmbro` Pages project → **Settings** → **Functions** → **D1 database bindings** → **Add binding**

- Variable name: `DB` *(exactly this, code reads `env.DB`)*
- D1 database: `propfirmbro-clicks` *(the one you just created)*
- Click **Save**

### 4. Set the stats token (for /api/click-stats access)

Same Settings page → **Environment variables** → **Add variable**

- Variable name: `STATS_TOKEN`
- Value: pick a random secret (e.g. `bro-stats-7f3a91b2`)
- Environment: Production
- Type: Secret (encrypted)
- Click **Save**

Save the token somewhere — you'll need it to access the stats endpoint.

### 5. Redeploy

Cloudflare deploys automatically on the next git push, OR trigger manually:
- Pages project → **Deployments** → **... menu** on latest → **Retry deployment**

After deploy, the bindings are live.

## Verify it works

1. Open `https://propfirmbro.com/go/fundedseat` in a new tab — should redirect to FundedSeat with `/bro` slug.
2. Visit `https://propfirmbro.com/api/click-stats?token=<YOUR_TOKEN>&days=1`
3. Should see JSON with at least 1 click (the one you just did).

```json
{
  "range_days": 1,
  "total_clicks": 1,
  "by_firm": [{ "firm": "fundedseat", "clicks": 1 }],
  ...
}
```

## Optional: enable Cloudflare Web Analytics

For basic pageview/source data (free, no cookies):

Cloudflare dashboard → **Web Analytics** → **Add a site** → enter `propfirmbro.com`

If your domain is already on Cloudflare DNS, it can auto-inject the beacon — no code change needed. Otherwise add the snippet to all HTML pages.

## Adding/updating an affiliate URL later

Edit `functions/go/_links.js` only. Every `/go/<slug>` link on the site automatically uses the new URL. No HTML changes needed.

## Stats access from your phone / browser

Bookmark:
```
https://propfirmbro.com/api/click-stats?token=<YOUR_TOKEN>&days=7
```

Returns clicks for the last 7 days, broken down by firm, day, referrer, and country.

A nice dashboard UI can be built on top of this endpoint later (next iteration).
