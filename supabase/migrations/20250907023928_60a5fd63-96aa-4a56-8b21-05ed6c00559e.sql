-- Add index for name-based matching performance
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_name_gin ON tcgcsv_products USING gin(to_tsvector('english', name));

-- Add index for faster name lookups
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_name_lower ON tcgcsv_products(lower(name));