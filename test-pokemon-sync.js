// Test Pokemon image sync
const response = await fetch('https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-images-tcgcsv', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA'
  },
  body: JSON.stringify({
    gameSlug: 'pokemon',
    background: false,
    forceUpdate: true,
    dryRun: false
  })
});

const result = await response.json();
console.log('Pokemon sync result:', result);

// Also test with dry run to see what would happen
const dryRunResponse = await fetch('https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-images-tcgcsv', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA'
  },
  body: JSON.stringify({
    gameSlug: 'pokemon',
    background: false,
    forceUpdate: true,
    dryRun: true
  })
});

const dryResult = await dryRunResponse.json();
console.log('Pokemon dry run result:', dryResult);