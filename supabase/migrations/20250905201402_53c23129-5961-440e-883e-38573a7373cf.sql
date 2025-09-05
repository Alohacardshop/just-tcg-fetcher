-- Add sealed_products table
CREATE TABLE public.sealed_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jt_product_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  product_type TEXT,
  image_url TEXT,
  data JSONB,
  set_id UUID NOT NULL,
  game_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add sealed_prices table
CREATE TABLE public.sealed_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  variant TEXT,
  condition TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  market_price NUMERIC,
  low_price NUMERIC,
  high_price NUMERIC,
  source TEXT NOT NULL DEFAULT 'JustTCG',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add sealed_synced_count to sets table
ALTER TABLE public.sets 
ADD COLUMN sealed_synced_count INTEGER NOT NULL DEFAULT 0;

-- Enable RLS on sealed_products
ALTER TABLE public.sealed_products ENABLE ROW LEVEL SECURITY;

-- Create policies for sealed_products
CREATE POLICY "Sealed products are viewable by everyone" 
ON public.sealed_products 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated can insert sealed_products" 
ON public.sealed_products 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated can update sealed_products" 
ON public.sealed_products 
FOR UPDATE 
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated can delete sealed_products" 
ON public.sealed_products 
FOR DELETE 
USING (auth.role() = 'authenticated'::text);

-- Enable RLS on sealed_prices
ALTER TABLE public.sealed_prices ENABLE ROW LEVEL SECURITY;

-- Create policies for sealed_prices
CREATE POLICY "Sealed prices are viewable by everyone" 
ON public.sealed_prices 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated can insert sealed_prices" 
ON public.sealed_prices 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated can update sealed_prices" 
ON public.sealed_prices 
FOR UPDATE 
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated can delete sealed_prices" 
ON public.sealed_prices 
FOR DELETE 
USING (auth.role() = 'authenticated'::text);

-- Add triggers for updating timestamps
CREATE TRIGGER update_sealed_products_updated_at
BEFORE UPDATE ON public.sealed_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sealed_prices_updated_at
BEFORE UPDATE ON public.sealed_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();