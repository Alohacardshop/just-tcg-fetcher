-- Update the sync_logs status check constraint to include the missing values
ALTER TABLE sync_logs DROP CONSTRAINT sync_logs_status_check;

ALTER TABLE sync_logs ADD CONSTRAINT sync_logs_status_check 
CHECK (status = ANY (ARRAY['started'::text, 'progress'::text, 'completed'::text, 'success'::text, 'error'::text, 'warning'::text]));