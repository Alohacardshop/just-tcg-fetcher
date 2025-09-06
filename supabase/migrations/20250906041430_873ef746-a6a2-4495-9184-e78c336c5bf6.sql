-- Add unique constraints to prevent duplicate card price entries
-- This will allow proper ON CONFLICT handling for card_prices upserts
ALTER TABLE public.card_prices 
ADD CONSTRAINT card_prices_unique_variant 
UNIQUE (card_id, condition, variant);

-- Add unique constraints to prevent duplicate sealed price entries  
-- This will allow proper ON CONFLICT handling for sealed_prices upserts
ALTER TABLE public.sealed_prices 
ADD CONSTRAINT sealed_prices_unique_variant 
UNIQUE (product_id, condition, variant);