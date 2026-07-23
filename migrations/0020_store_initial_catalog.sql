-- Initial Bro Store catalog (Mike, 2026-07-23).
-- 25K / 50K / 100K eval accounts for Apex, Tradeify, MFFU and Lucid.
--
-- Chosen line per firm (the standard/popular eval):
--   Apex     → EOD Trail | Standard      ($40 / $45 / $60 after BRO discount)
--   Tradeify → Growth (funding in 1 day) ($65 / $95 / $165)
--   MFFU     → Rapid                     ($87.50 / $115 / $212.50)
--   Lucid    → LucidFlex                 ($70 / $97.50 / $157.50)
--
-- Prices = current real (discounted) prices from FIRM_POINTS (cashback pts / 10).
-- points_cost = price × 667, rounded up to the next 1,000 (user pays ~2/3 of
-- price in points value).
--
-- All packs are firm-bound (firm_slug) → unlock via 10 approved claims at that
-- firm, or 90K total purchase pts (migration 0019). Fulfillment via sponsored
-- discount codes (bro_pack_codes) — codes present for Apex only for now; the
-- other firms' packs show as "coming soon" (0 available codes) until codes land.
--
-- Also deactivates the old test/legacy packs (keeps pro-bro-1-month).
--
-- Run on preview first (propfirmbro-clicks-preview); prod at go-live.

-- Old test/legacy items out of the storefront (soft-disable, no delete).
UPDATE bro_packages SET is_active = 0 WHERE slug = 'bro-pack-apex-eod-trail-standard-50k-one-pack';
UPDATE bro_packages SET is_active = 0 WHERE slug = 'prop-firm-25k';

-- Apex — EOD Trail | Standard
INSERT OR REPLACE INTO bro_packages (slug, title, description, points_cost, fulfillment, is_active, stock, created_at, gate_exempt, uses_discount_codes, firm_slug) VALUES
('bro-pack-apex-eod-25k',  'Bro Pack — Apex 25K (EOD Trail)',  'A 25K Apex EOD Trail | Standard eval account, delivered via discount code at checkout.',  27000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'apex'),
('bro-pack-apex-eod-50k',  'Bro Pack — Apex 50K (EOD Trail)',  'A 50K Apex EOD Trail | Standard eval account, delivered via discount code at checkout.',  30000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'apex'),
('bro-pack-apex-eod-100k', 'Bro Pack — Apex 100K (EOD Trail)', 'A 100K Apex EOD Trail | Standard eval account, delivered via discount code at checkout.', 40000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'apex');

-- Tradeify — Growth
INSERT OR REPLACE INTO bro_packages (slug, title, description, points_cost, fulfillment, is_active, stock, created_at, gate_exempt, uses_discount_codes, firm_slug) VALUES
('bro-pack-tradeify-growth-25k',  'Bro Pack — Tradeify 25K (Growth)',  'A 25K Tradeify Growth eval account (funding in 1 day), delivered via discount code at checkout.',  44000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'tradeify'),
('bro-pack-tradeify-growth-50k',  'Bro Pack — Tradeify 50K (Growth)',  'A 50K Tradeify Growth eval account (funding in 1 day), delivered via discount code at checkout.',  64000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'tradeify'),
('bro-pack-tradeify-growth-100k', 'Bro Pack — Tradeify 100K (Growth)', 'A 100K Tradeify Growth eval account (funding in 1 day), delivered via discount code at checkout.', 110000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'tradeify');

-- MFFU — Rapid
INSERT OR REPLACE INTO bro_packages (slug, title, description, points_cost, fulfillment, is_active, stock, created_at, gate_exempt, uses_discount_codes, firm_slug) VALUES
('bro-pack-mffu-rapid-25k',  'Bro Pack — MFFU 25K (Rapid)',  'A 25K MyFundedFutures Rapid eval account, delivered via discount code at checkout.',  59000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'mffu'),
('bro-pack-mffu-rapid-50k',  'Bro Pack — MFFU 50K (Rapid)',  'A 50K MyFundedFutures Rapid eval account, delivered via discount code at checkout.',  77000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'mffu'),
('bro-pack-mffu-rapid-100k', 'Bro Pack — MFFU 100K (Rapid)', 'A 100K MyFundedFutures Rapid eval account, delivered via discount code at checkout.', 142000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'mffu');

-- Lucid — LucidFlex
INSERT OR REPLACE INTO bro_packages (slug, title, description, points_cost, fulfillment, is_active, stock, created_at, gate_exempt, uses_discount_codes, firm_slug) VALUES
('bro-pack-lucid-flex-25k',  'Bro Pack — Lucid 25K (LucidFlex)',  'A 25K Lucid LucidFlex eval account, delivered via discount code at checkout.',  47000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'lucid'),
('bro-pack-lucid-flex-50k',  'Bro Pack — Lucid 50K (LucidFlex)',  'A 50K Lucid LucidFlex eval account, delivered via discount code at checkout.',  65000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'lucid'),
('bro-pack-lucid-flex-100k', 'Bro Pack — Lucid 100K (LucidFlex)', 'A 100K Lucid LucidFlex eval account, delivered via discount code at checkout.', 105000, 'prop_firm_account', 1, NULL, datetime('now'), 0, 1, 'lucid');
