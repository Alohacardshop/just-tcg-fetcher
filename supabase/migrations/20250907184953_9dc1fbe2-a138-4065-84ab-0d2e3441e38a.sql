-- Drop all existing tables (CASCADE will handle foreign key dependencies)
DROP TABLE IF EXISTS automation_settings CASCADE;
DROP TABLE IF EXISTS card_prices CASCADE;
DROP TABLE IF EXISTS card_product_links CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS sealed_prices CASCADE;
DROP TABLE IF EXISTS sealed_products CASCADE;
DROP TABLE IF EXISTS sets CASCADE;
DROP TABLE IF EXISTS sync_control CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS sync_status CASCADE;
DROP TABLE IF EXISTS tcgcsv_categories CASCADE;
DROP TABLE IF EXISTS tcgcsv_groups CASCADE;
DROP TABLE IF EXISTS tcgcsv_products CASCADE;

-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS combined_cards CASCADE;

-- Drop custom functions (keep only the essential user profile handler)
DROP FUNCTION IF EXISTS public.refresh_combined_cards() CASCADE;

-- Keep the profiles table and user handler function as they're essential for auth
-- But recreate profiles table to ensure clean state
DROP TABLE IF EXISTS profiles CASCADE;

-- Recreate essential profiles table for user management
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  username text,
  avatar_url text,
  is_admin boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create updated_at trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();