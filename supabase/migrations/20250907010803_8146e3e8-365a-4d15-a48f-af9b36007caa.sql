
-- 1) Staging table for TCGCSV groups (aka TCGplayer groups)
CREATE TABLE IF NOT EXISTS public.tcgcsv_groups (
  group_id       text PRIMARY KEY,
  category_id    text NOT NULL,            -- TCGplayer category id (e.g. '3' for Pokemon)
  game_id        uuid NOT NULL,            -- Our games.id (no FK to keep schema flexible like other tables)
  name           text NOT NULL,
  slug           text,
  release_date   date,
  data           jsonb,                    -- Raw payload for audit/debugging
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes to speed lookups/matching
CREATE INDEX IF NOT EXISTS idx_tcgcsv_groups_category_id ON public.tcgcsv_groups (category_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_groups_game_id ON public.tcgcsv_groups (game_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_groups_name_ci ON public.tcgcsv_groups (lower(name));

-- Auto-update updated_at on row updates
DROP TRIGGER IF EXISTS trg_tcgcsv_groups_updated_at ON public.tcgcsv_groups;
CREATE TRIGGER trg_tcgcsv_groups_updated_at
BEFORE UPDATE ON public.tcgcsv_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS and set policies
ALTER TABLE public.tcgcsv_groups ENABLE ROW LEVEL SECURITY;

-- Readable by everyone
DROP POLICY IF EXISTS "TCGCSV groups are viewable by everyone" ON public.tcgcsv_groups;
CREATE POLICY "TCGCSV groups are viewable by everyone"
  ON public.tcgcsv_groups
  FOR SELECT
  USING (true);

-- Modifications by authenticated only
DROP POLICY IF EXISTS "Authenticated can insert tcgcsv_groups" ON public.tcgcsv_groups;
CREATE POLICY "Authenticated can insert tcgcsv_groups"
  ON public.tcgcsv_groups
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can update tcgcsv_groups" ON public.tcgcsv_groups;
CREATE POLICY "Authenticated can update tcgcsv_groups"
  ON public.tcgcsv_groups
  FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete tcgcsv_groups" ON public.tcgcsv_groups;
CREATE POLICY "Authenticated can delete tcgcsv_groups"
  ON public.tcgcsv_groups
  FOR DELETE
  USING (auth.role() = 'authenticated');



-- 2) Staging table for TCGCSV products (aka TCGplayer products)
CREATE TABLE IF NOT EXISTS public.tcgcsv_products (
  product_id     text PRIMARY KEY,         -- TCGplayer product id
  group_id       text NOT NULL,            -- TCGplayer group id
  category_id    text NOT NULL,            -- TCGplayer category id
  game_id        uuid NOT NULL,            -- Our games.id (no FK)
  name           text NOT NULL,            -- Product name (often includes number & variant)
  number         text,                     -- Parsed card number if available (e.g. '123/165', 'SVP-001')
  url            text,                     -- TCGplayer product URL
  image_url      text,                     -- Image URL (prefer stable CDN variant)
  data           jsonb,                    -- Raw payload for audit/debugging
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes to speed lookups/matching
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_group_id ON public.tcgcsv_products (group_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_game_id ON public.tcgcsv_products (game_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_number ON public.tcgcsv_products (number);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_name_ci ON public.tcgcsv_products (lower(name));

-- Auto-update updated_at on row updates
DROP TRIGGER IF EXISTS trg_tcgcsv_products_updated_at ON public.tcgcsv_products;
CREATE TRIGGER trg_tcgcsv_products_updated_at
BEFORE UPDATE ON public.tcgcsv_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS and set policies
ALTER TABLE public.tcgcsv_products ENABLE ROW LEVEL SECURITY;

-- Readable by everyone
DROP POLICY IF EXISTS "TCGCSV products are viewable by everyone" ON public.tcgcsv_products;
CREATE POLICY "TCGCSV products are viewable by everyone"
  ON public.tcgcsv_products
  FOR SELECT
  USING (true);

-- Modifications by authenticated only
DROP POLICY IF EXISTS "Authenticated can insert tcgcsv_products" ON public.tcgcsv_products;
CREATE POLICY "Authenticated can insert tcgcsv_products"
  ON public.tcgcsv_products
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can update tcgcsv_products" ON public.tcgcsv_products;
CREATE POLICY "Authenticated can update tcgcsv_products"
  ON public.tcgcsv_products
  FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete tcgcsv_products" ON public.tcgcsv_products;
CREATE POLICY "Authenticated can delete tcgcsv_products"
  ON public.tcgcsv_products
  FOR DELETE
  USING (auth.role() = 'authenticated');
