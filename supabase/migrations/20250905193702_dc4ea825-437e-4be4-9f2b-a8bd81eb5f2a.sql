-- Add admin flag to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_admin boolean DEFAULT false;

-- Create sync control table for server-side cancellation
CREATE TABLE public.sync_control (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type text NOT NULL,
  operation_id text NOT NULL,
  should_cancel boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(operation_type, operation_id)
);

-- Enable RLS on sync_control table
ALTER TABLE public.sync_control ENABLE ROW LEVEL SECURITY;

-- Create policies for sync_control
CREATE POLICY "Admins can manage sync control" 
ON public.sync_control 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Everyone can read sync control" 
ON public.sync_control 
FOR SELECT 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_sync_control_updated_at
BEFORE UPDATE ON public.sync_control
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();