-- Create combined_cards materialized view
CREATE MATERIALIZED VIEW public.combined_cards AS
SELECT 
  c.id as card_id,
  c.name as card_name,
  c.number as card_number,
  c.rarity,
  c.image_url as card_image_url,
  g.name as game_name,
  s.name as set_name,
  tp.name as tcgcsv_product_name,
  tp.image_url as tcgcsv_image_url,
  tp.url as tcgcsv_url,
  cpl.match_confidence,
  cpl.match_method,
  cpl.verified as match_verified
FROM public.cards c
LEFT JOIN public.games g ON c.game_id = g.id
LEFT JOIN public.sets s ON c.set_id = s.id
LEFT JOIN public.card_product_links cpl ON c.id = cpl.card_id
LEFT JOIN public.tcgcsv_products tp ON cpl.tcgcsv_product_id = tp.product_id;

-- Create indexes on materialized view
CREATE INDEX idx_combined_cards_card_id ON public.combined_cards(card_id);
CREATE INDEX idx_combined_cards_game_name ON public.combined_cards(game_name);
CREATE INDEX idx_combined_cards_set_name ON public.combined_cards(set_name);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION public.refresh_combined_cards()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.combined_cards;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;