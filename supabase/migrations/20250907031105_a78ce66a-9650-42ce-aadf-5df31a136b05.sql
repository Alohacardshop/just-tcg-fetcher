-- Create TCGCSV categories table
CREATE TABLE public.tcgcsv_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text,
  data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tcgcsv_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "TCGCSV categories are viewable by everyone" 
ON public.tcgcsv_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated can insert tcgcsv_categories" 
ON public.tcgcsv_categories 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated can update tcgcsv_categories" 
ON public.tcgcsv_categories 
FOR UPDATE 
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated can delete tcgcsv_categories" 
ON public.tcgcsv_categories 
FOR DELETE 
USING (auth.role() = 'authenticated'::text);

-- Update tcgcsv_groups to add category reference
ALTER TABLE public.tcgcsv_groups 
ADD COLUMN IF NOT EXISTS tcgcsv_category_id text;

-- Update tcgcsv_products to add group reference  
ALTER TABLE public.tcgcsv_products 
ADD COLUMN IF NOT EXISTS tcgcsv_group_id text;

-- Create card_product_links table for mapping JustTCG cards to TCGCSV products
CREATE TABLE public.card_product_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  tcgcsv_product_id text NOT NULL,
  match_confidence numeric DEFAULT 0,
  match_method text,
  verified boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(card_id, tcgcsv_product_id)
);

-- Enable RLS
ALTER TABLE public.card_product_links ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Card product links are viewable by everyone" 
ON public.card_product_links 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated can manage card_product_links" 
ON public.card_product_links 
FOR ALL 
USING (auth.role() = 'authenticated'::text);

-- Create indexes for performance (check if they don't exist first)
CREATE INDEX IF NOT EXISTS idx_tcgcsv_categories_category_id ON public.tcgcsv_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_groups_tcgcsv_category_id ON public.tcgcsv_groups(tcgcsv_category_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_tcgcsv_group_id ON public.tcgcsv_products(tcgcsv_group_id);
CREATE INDEX IF NOT EXISTS idx_card_product_links_card_id ON public.card_product_links(card_id);
CREATE INDEX IF NOT EXISTS idx_card_product_links_product_id ON public.card_product_links(tcgcsv_product_id);

-- Create triggers to auto-update timestamps
CREATE TRIGGER update_tcgcsv_categories_updated_at
  BEFORE UPDATE ON public.tcgcsv_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_card_product_links_updated_at
  BEFORE UPDATE ON public.card_product_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();