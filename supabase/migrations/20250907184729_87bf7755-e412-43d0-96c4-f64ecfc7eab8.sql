-- Clear all data from both TCGCSV and JustTCG tables
TRUNCATE TABLE tcgcsv_products CASCADE;
TRUNCATE TABLE tcgcsv_groups CASCADE;
TRUNCATE TABLE tcgcsv_categories CASCADE;

TRUNCATE TABLE card_prices CASCADE;
TRUNCATE TABLE card_product_links CASCADE;
TRUNCATE TABLE sealed_prices CASCADE;
TRUNCATE TABLE sealed_products CASCADE;
TRUNCATE TABLE cards CASCADE;
TRUNCATE TABLE sets CASCADE;
TRUNCATE TABLE games CASCADE;

-- Remove TCGCSV fields from JustTCG tables to completely separate them
ALTER TABLE games DROP COLUMN IF EXISTS tcgcsv_category_id;
ALTER TABLE sets DROP COLUMN IF EXISTS tcgcsv_group_id;

-- Clear sync status and logs to start fresh
TRUNCATE TABLE sync_status CASCADE;
TRUNCATE TABLE sync_logs CASCADE;
TRUNCATE TABLE sync_control CASCADE;