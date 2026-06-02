-- Allow specific packages to bypass the purchase-cashback unlock gate.
-- Used to make the Pro Bro 1-month package redeemable without earning 5000 pts first.
ALTER TABLE bro_packages ADD COLUMN gate_exempt INTEGER DEFAULT 0;
UPDATE bro_packages SET gate_exempt = 1 WHERE slug = 'pro-bro-1-month';
