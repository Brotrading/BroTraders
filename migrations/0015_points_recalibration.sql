-- Recalibrate Bro Pack costs ×10 to match the new earn-rate system.
--
-- All earn rates and FIRM_POINTS were multiplied by 10 (2026-06-05):
--   CASHBACK_RATE 0.025 → 0.25, FIRM_POINTS formula /25 → /2.5
--
-- Previous costs (migration 0004):
--   pro-bro-1-month:  8,000 pts (≈ €320 in purchases to unlock)
--   prop-firm-25k:   20,000 pts (≈ €800 in purchases to unlock)
--
-- New costs (×10, same relative effort):
--   pro-bro-1-month:  80,000 pts
--   prop-firm-25k:   200,000 pts
--
-- Apply with: Cloudflare dashboard → D1 → propfirmbro-clicks → Console → paste + Execute
-- Run on BOTH production (propfirmbro-clicks) and preview (propfirmbro-clicks-preview).

UPDATE bro_packages SET points_cost = 80000  WHERE slug = 'pro-bro-1-month';
UPDATE bro_packages SET points_cost = 200000 WHERE slug = 'prop-firm-25k';
