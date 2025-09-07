-- Create job tracking table for resumable sync operations
CREATE TABLE public.tcgcsv_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE NULL,
  succeeded_group_ids INTEGER[] DEFAULT '{}',
  failed_group_ids INTEGER[] DEFAULT '{}',
  total_groups INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tcgcsv_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Jobs are viewable by everyone" 
ON public.tcgcsv_jobs 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage jobs" 
ON public.tcgcsv_jobs 
FOR ALL 
USING (auth.role() = 'service_role');

-- Create index for efficient lookups
CREATE INDEX idx_tcgcsv_jobs_category_type ON public.tcgcsv_jobs(category_id, job_type);
CREATE INDEX idx_tcgcsv_jobs_status ON public.tcgcsv_jobs(finished_at) WHERE finished_at IS NULL;

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_tcgcsv_jobs_updated_at
BEFORE UPDATE ON public.tcgcsv_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();