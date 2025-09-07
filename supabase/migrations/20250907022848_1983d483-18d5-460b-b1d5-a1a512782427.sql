-- Phase 1: Database Foundations
-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cards_jt_game_set ON cards(jt_game_id, jt_set_id);
CREATE INDEX IF NOT EXISTS idx_cards_number ON cards(number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_name_gin ON cards USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_game_group ON tcgcsv_products(game_id, group_id);
CREATE INDEX IF NOT EXISTS idx_tcgcsv_products_number ON tcgcsv_products(number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_logs_operation_status ON sync_logs(operation_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- Add resume tracking to sets
ALTER TABLE sets ADD COLUMN IF NOT EXISTS resume_token text;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS partial_sync_data jsonb;

-- Add better tracking fields
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS progress_current integer DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS progress_total integer DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0;

-- Add constraints to prevent duplicate cards
ALTER TABLE cards ADD CONSTRAINT IF NOT EXISTS unique_card_per_set UNIQUE(jt_game_id, jt_set_id, jt_card_id);

-- Add matching confidence tracking
ALTER TABLE cards ADD COLUMN IF NOT EXISTS tcgcsv_match_confidence decimal(3,2);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS tcgcsv_match_method text;

-- Create a consolidated sync status table
CREATE TABLE IF NOT EXISTS sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL UNIQUE,
  operation_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  game_id uuid,
  set_id uuid,
  progress_current integer DEFAULT 0,
  progress_total integer DEFAULT 0,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  error_message text,
  resume_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on sync_status
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;

-- Policies for sync_status
CREATE POLICY "Authenticated users can view sync status" 
ON sync_status FOR SELECT 
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Service role can manage sync status" 
ON sync_status FOR ALL 
USING (auth.role() = 'service_role'::text);

-- Create trigger for sync_status updated_at
CREATE TRIGGER update_sync_status_updated_at
  BEFORE UPDATE ON sync_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();