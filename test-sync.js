// Test script to call the sync-images-tcgcsv function
const response = await fetch('https://ljywcyhnpzqgpowwrpre.supabase.co/functions/v1/sync-images-tcgcsv', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA'
  },
  body: JSON.stringify({
    gameSlug: 'pokemon',
    categoryId: '3',
    background: false,
    forceUpdate: true
  })
});

const result = await response.json();
console.log('Sync result:', result);