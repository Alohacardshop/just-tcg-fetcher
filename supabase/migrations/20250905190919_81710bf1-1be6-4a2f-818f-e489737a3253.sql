
-- 1) Add tracking columns

-- Games: track when the games/sets list was last synced
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Sets: track per-set card sync status and recency
ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cards_synced_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- 2) Helpful indexes for quick filtering/sorting
CREATE INDEX IF NOT EXISTS idx_sets_game_id ON public.sets (game_id);
CREATE INDEX IF NOT EXISTS idx_sets_sync_status ON public.sets (sync_status);
CREATE INDEX IF NOT EXISTS idx_sets_last_synced_at ON public.sets (last_synced_at);
CREATE INDEX IF NOT EXISTS idx_games_last_synced_at ON public.games (last_synced_at);
CREATE INDEX IF NOT EXISTS idx_cards_set_id ON public.cards (set_id);

-- 3) Auto-maintain updated_at via existing trigger function (if not already)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_games_updated_at') THEN
    CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sets_updated_at') THEN
    CREATE TRIGGER update_sets_updated_at
    BEFORE UPDATE ON public.sets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_cards_updated_at') THEN
    CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON public.cards
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_card_prices_updated_at') THEN
    CREATE TRIGGER update_card_prices_updated_at
    BEFORE UPDATE ON public.card_prices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- 4) Enable realtime on games and sets (safe re-run)
ALTER TABLE public.games REPLICA IDENTITY FULL;
ALTER TABLE public.sets REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'games'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.games';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sets';
  END IF;
END
$$;
