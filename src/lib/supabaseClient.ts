import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ljywcyhnpzqgpowwrpre.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});