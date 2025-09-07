import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type',
    'Vary': 'Origin'
  };
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), { 
    status, 
    headers: { 
      'Content-Type': 'application/json', 
      ...cors(req ?? new Request('')) 
    }
  });
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  try {
    console.log('Testing TCGCSV URL with correct casing...');
    
    // Test the URL you confirmed works
    const url = 'https://tcgcsv.com/tcgplayer/3/Groups.csv';
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/csv, */*',
        'Cache-Control': 'no-cache',
        'User-Agent': 'AlohaCardShopBot/1.0 (+https://www.alohacardshop.com)',
        'Referer': 'https://tcgcsv.com/'
      }
    });
    
    console.log(`Response: ${response.status} ${response.statusText}`);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Content-Length:', response.headers.get('content-length'));
    
    // Read first few lines to verify it's CSV
    const text = await response.text();
    const firstLines = text.split('\n').slice(0, 3).join('\n');
    
    return json({
      success: response.ok,
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      firstLines,
      totalLines: text.split('\n').length
    }, 200, req);

  } catch (error: any) {
    console.error('Test error:', error);
    return json({
      success: false,
      error: error.message
    }, 500, req);
  }
});