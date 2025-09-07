import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting TCGCSV data cleanup...');

    // Clear tables in dependency order (products first, then groups, then categories)
    console.log('Clearing tcgcsv_products...');
    const { error: productsError } = await supabase
      .from('tcgcsv_products')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (productsError) {
      console.error('Error clearing products:', productsError);
      throw new Error(`Failed to clear products: ${productsError.message}`);
    }

    console.log('Clearing tcgcsv_groups...');
    const { error: groupsError } = await supabase
      .from('tcgcsv_groups')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (groupsError) {
      console.error('Error clearing groups:', groupsError);
      throw new Error(`Failed to clear groups: ${groupsError.message}`);
    }

    console.log('Clearing tcgcsv_categories...');
    const { error: categoriesError } = await supabase
      .from('tcgcsv_categories')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (categoriesError) {
      console.error('Error clearing categories:', categoriesError);
      throw new Error(`Failed to clear categories: ${categoriesError.message}`);
    }

    console.log('Clearing tcgcsv_jobs...');
    const { error: jobsError } = await supabase
      .from('tcgcsv_jobs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (jobsError) {
      console.error('Error clearing jobs:', jobsError);
      throw new Error(`Failed to clear jobs: ${jobsError.message}`);
    }

    console.log('TCGCSV data cleanup completed successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'All TCGCSV data cleared successfully',
      clearedTables: [
        'tcgcsv_products',
        'tcgcsv_groups', 
        'tcgcsv_categories',
        'tcgcsv_jobs'
      ]
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error clearing TCGCSV data:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});