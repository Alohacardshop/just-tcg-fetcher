import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId = 3, groupId = 1938 } = await req.json().catch(() => ({}));
    
    // Use the same URL variants as the working bulk sync
    const urls = [
      `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/ProductsAndPrices.csv`,
      `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/productsandprices.csv`,
      `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/ProductsAndPrices.CSV`,
      `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/Products.csv`,
      `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/products.csv`
    ];
    
    const headers = {
      'Accept': 'text/csv, */*',
      'Cache-Control': 'no-cache',
      'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
      'Referer': 'https://tcgcsv.com/'
    };
    
    let lastError = '';
    let workingUrl = '';
    
    for (const url of urls) {
      console.log(`Testing URL: ${url}`);
      
      const startTime = Date.now();
      try {
        const response = await fetch(url, { headers });
        
        if (response.ok) {
          workingUrl = url;
          
          const text = await response.text();
          const lines = text.split('\n');
          const actualLineCount = lines.length;
          const nonEmptyLines = lines.filter(line => line.trim()).length;
          
          // Get response headers
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          
          const result = {
            workingUrl,
            allUrlsTested: urls,
            responseTime: Date.now() - startTime,
            statusCode: response.status,
            contentLength: text.length,
            actualLineCount,
            nonEmptyLines,
            headers: responseHeaders,
            firstFewLines: lines.slice(0, 5),
            lastFewLines: lines.slice(-5),
            sampleLine59: lines[58] || 'Not found',
            sampleLine60: lines[59] || 'Not found',
            sampleLine61: lines[60] || 'Not found',
            hasTrailingContent: lines.length > 60,
            // Check for common CSV issues
            containsHtml: text.includes('<br>') || text.includes('<em>'),
            containsQuotes: text.includes('"'),
            maxLineLength: Math.max(...lines.map(line => line.length))
          };
          
          console.log('CSV Analysis:', result);
          
          return new Response(JSON.stringify(result, null, 2), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          lastError = `${url}: HTTP ${response.status}`;
          console.log(`Failed: ${lastError}`);
        }
      } catch (err) {
        lastError = `${url}: ${err.message}`;
        console.log(`Error: ${lastError}`);
      }
    }
    
    // If we get here, all URLs failed
    return new Response(JSON.stringify({
      error: `All URLs failed. Last error: ${lastError}`,
      allUrlsTested: urls
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error testing CSV:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});