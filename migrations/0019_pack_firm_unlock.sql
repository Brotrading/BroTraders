-- Per-firm unlock rule for Bro Packs (decided by Mike, 2026-07-03).
--
-- A non-exempt account reward unlocks when the user has EITHER:
--   a) >= 10 approved purchase claims at the pack's firm (firm_slug), OR
--   b) >= 90,000 purchase_cashback points total across all firms (~$9,000 spend)
--      — from that point ALL account rewards are unlocked, no per-firm minimum.
--
-- bro_packages.firm_slug links a pack to a firm (matches purchase_claims.firm_slug,
-- e.g. 'apex', 'tradeify'). NULL = not firm-bound: only the global 90,000 rule
-- applies (unless gate_exempt = 1, e.g. Pro Bro).
--
-- Apply with: Cloudflare dashboard → D1 → Console → paste + Execute
-- Run on BOTH production (propfirmbro-clicks) and preview (propfirmbro-clicks-preview).

ALTER TABLE bro_packages ADD COLUMN firm_slug TEXT;
