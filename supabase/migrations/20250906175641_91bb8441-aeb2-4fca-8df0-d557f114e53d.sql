-- Create sync_logs table to track automation runs
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL, -- 'automated_sync', 'manual_sync', 'set_sync', etc.
  operation_id TEXT NOT NULL, -- unique identifier for each operation run
  game_id UUID REFERENCES public.games(id),
  set_id UUID REFERENCES public.sets(id),
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'error', 'warning')),
  message TEXT NOT NULL,
  details JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for sync logs
CREATE POLICY "Authenticated users can view sync logs" 
ON public.sync_logs 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage sync logs" 
ON public.sync_logs 
FOR ALL
USING (auth.role() = 'service_role');

-- Create index for better performance
CREATE INDEX idx_sync_logs_operation_created ON public.sync_logs(operation_type, created_at DESC);
CREATE INDEX idx_sync_logs_game_created ON public.sync_logs(game_id, created_at DESC);
CREATE INDEX idx_sync_logs_operation_id ON public.sync_logs(operation_id);