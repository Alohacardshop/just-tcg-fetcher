-- Fix stuck sync status for Arceus set
UPDATE public.sets 
SET sync_status = 'idle', 
    last_sync_error = 'Reset from stuck sync state',
    updated_at = now()
WHERE name = 'Arceus' AND sync_status = 'syncing';

-- Create profile for the current user with admin privileges
INSERT INTO public.profiles (user_id, is_admin, created_at, updated_at)
VALUES ('b966413c-58c3-4f2f-ab19-b9e1c08c360e', true, now(), now())
ON CONFLICT (user_id) DO UPDATE SET 
  is_admin = true,
  updated_at = now();