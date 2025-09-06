-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to run automated sync daily at 2 AM
SELECT cron.schedule(
  'automated-tcg-sync',
  '0 2 * * *', -- Daily at 2:00 AM
  $$
  SELECT
    net.http_post(
        url:='https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/automated-sync',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA"}'::jsonb,
        body:='{"manual": false}'::jsonb
    ) as request_id;
  $$
);