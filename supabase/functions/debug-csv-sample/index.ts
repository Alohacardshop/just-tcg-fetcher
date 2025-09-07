import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    // Test fetch the Alternate Art Promos CSV directly
    const url = 'https://tcgcsv.com/tcgplayer/3/1938/ProductsAndPrices.csv';
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/csv, */*',
        'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
        'Referer': 'https://tcgcsv.com/'
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: `HTTP ${response.status}`,
        url
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const text = await response.text();
    const lines = text.split('\n').slice(0, 10); // First 10 lines including header
    
    return new Response(JSON.stringify({
      url,
      headers: lines[0]?.split(',') || [],
      sampleRows: lines.slice(1, 6),
      totalLines: text.split('\n').length,
      firstChars: text.substring(0, 500)
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});