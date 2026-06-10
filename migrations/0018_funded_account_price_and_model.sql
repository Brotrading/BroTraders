-- Funded 25K account: 80,000 → 100,000 pts.
--
-- Financial model (decided 2026-06-10):
--   FIRM_POINTS base = price_usd × 10 and 1,000 pts ≈ $1, so purchase points are
--   ~1% cashback (1.5% Pro). At ~10% affiliate commission, the 100,000 pts price
--   means a redeemer generated ~$10,000 purchase volume = ~$1,000 commission.
--   Giving away a ~$150 account leaves Mike with ~8.5% — the agreed 8.5-9% target.
--
--   Combined with REDEMPTION_GATE_PTS = 90,000 (in _lib.js): at least 90% of the
--   points must come from purchases; engagement may fill the remaining 10%.
--   Worst case Mike keeps ~8.3%.
--
-- Pro Bro stays at 30,000 pts and gate_exempt = 1 (zero marginal cost, conversion tool).
--
-- Apply with: Cloudflare dashboard → D1 → Console → paste + Execute
-- Run on BOTH production (propfirmbro-clicks) and preview (propfirmbro-clicks-preview).

UPDATE bro_packages SET points_cost = 100000 WHERE slug = 'prop-firm-25k';
