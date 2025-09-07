-- Add tcgcsv mapping columns to games and sets tables
ALTER TABLE public.games 
ADD COLUMN tcgcsv_category_id text;

ALTER TABLE public.sets 
ADD COLUMN tcgcsv_group_id text;

-- Add some initial mappings for Pokemon
UPDATE public.games 
SET tcgcsv_category_id = '3' 
WHERE slug = 'pokemon';

-- Add comment for clarity
COMMENT ON COLUMN public.games.tcgcsv_category_id IS 'Maps to tcgcsv.com category ID for image sync';
COMMENT ON COLUMN public.sets.tcgcsv_group_id IS 'Maps to tcgcsv.com group ID for image sync';