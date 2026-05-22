-- Rename "Bro Packages" → "Bro Packs" and recalibrate point costs.
--
-- New costs are based on Mike's 10% commission rate and average €80 purchase price:
--   - Pro Bro month (€10 value):  8,000 pts  → requires ~€320 in purchases to earn
--   - 25K Account  (€60 value): 20,000 pts  → requires ~€800 in purchases to earn
--
-- Apply with: Cloudflare dashboard → D1 → propfirmbro-clicks → Console → paste + Execute

UPDATE bro_packages
SET title       = 'Bro Pack — 1 Maand Pro Bro',
    description = 'One free month of Pro Bro membership. Instant fulfillment via Whop.',
    points_cost = 8000
WHERE slug = 'pro-bro-1-month';

UPDATE bro_packages
SET title       = 'Bro Pack — 25K Prop Firm Account',
    description = 'A 25K funded account at one of our partner firms (FundedSeat, Apex, or similar — selected at fulfillment).',
    points_cost = 20000
WHERE slug = 'prop-firm-25k';
