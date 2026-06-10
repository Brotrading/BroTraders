-- Recalibrate Bro Pack costs to make rewards achievable for regular users.
--
-- Analysis: at 80K pts, Pro Bro was only reachable after 14-18 months of
-- normal usage without heavy referrals. New prices target 3-4 months for
-- an active buyer.
--
--   pro-bro-1-month:  80,000 → 30,000 pts
--   prop-firm-25k:   200,000 → 80,000 pts
--
-- Apply with: Cloudflare dashboard → D1 → Console → paste + Execute
-- Run on BOTH production (propfirmbro-clicks) and preview (propfirmbro-clicks-preview).

UPDATE bro_packages SET points_cost = 30000 WHERE slug = 'pro-bro-1-month';
UPDATE bro_packages SET points_cost = 80000 WHERE slug = 'prop-firm-25k';
