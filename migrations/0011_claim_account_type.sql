-- Store the account type selected by the user at claim submission time.
ALTER TABLE purchase_claims ADD COLUMN account_type TEXT;
