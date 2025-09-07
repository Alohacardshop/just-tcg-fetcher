-- Add tcgplayer_product_id and product_url columns to cards table
ALTER TABLE public.cards 
ADD COLUMN tcgplayer_product_id INTEGER,
ADD COLUMN product_url TEXT;