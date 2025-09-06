-- Remove duplicate entries from card_prices before adding unique constraint
-- Keep the most recent entry for each (card_id, condition, variant) combination
DELETE FROM public.card_prices 
WHERE id NOT IN (
  SELECT DISTINCT ON (card_id, condition, variant) id 
  FROM public.card_prices 
  ORDER BY card_id, condition, variant, created_at DESC
);

-- Remove duplicate entries from sealed_prices before adding unique constraint
-- Keep the most recent entry for each (product_id, condition, variant) combination  
DELETE FROM public.sealed_prices 
WHERE id NOT IN (
  SELECT DISTINCT ON (product_id, condition, variant) id 
  FROM public.sealed_prices 
  ORDER BY product_id, condition, variant, created_at DESC
);

-- Now add unique constraints to prevent future duplicates
ALTER TABLE public.card_prices 
ADD CONSTRAINT card_prices_unique_variant 
UNIQUE (card_id, condition, variant);

ALTER TABLE public.sealed_prices 
ADD CONSTRAINT sealed_prices_unique_variant 
UNIQUE (product_id, condition, variant);