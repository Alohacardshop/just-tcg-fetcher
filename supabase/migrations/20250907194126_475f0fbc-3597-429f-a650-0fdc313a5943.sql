-- Create table for TCGCSV groups
CREATE TABLE public.tcgcsv_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id INTEGER NOT NULL UNIQUE,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT,
  release_date TIMESTAMP WITH TIME ZONE,
  is_supplemental BOOLEAN,
  sealed_product BOOLEAN,
  url_slug TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for TCGCSV products
CREATE TABLE public.tcgcsv_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id INTEGER NOT NULL UNIQUE,
  group_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  clean_name TEXT NOT NULL,
  number TEXT,
  rarity TEXT,
  product_type TEXT,
  url_slug TEXT,
  extended_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.tcgcsv_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcgcsv_products ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Groups are viewable by everyone" 
ON public.tcgcsv_groups 
FOR SELECT 
USING (true);

CREATE POLICY "Products are viewable by everyone" 
ON public.tcgcsv_products 
FOR SELECT 
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_tcgcsv_groups_category_id ON public.tcgcsv_groups(category_id);
CREATE INDEX idx_tcgcsv_groups_group_id ON public.tcgcsv_groups(group_id);
CREATE INDEX idx_tcgcsv_products_group_id ON public.tcgcsv_products(group_id);
CREATE INDEX idx_tcgcsv_products_category_id ON public.tcgcsv_products(category_id);
CREATE INDEX idx_tcgcsv_products_product_id ON public.tcgcsv_products(product_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_tcgcsv_groups_updated_at
  BEFORE UPDATE ON public.tcgcsv_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tcgcsv_products_updated_at
  BEFORE UPDATE ON public.tcgcsv_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();