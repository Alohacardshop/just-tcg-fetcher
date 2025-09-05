import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initJustTCGGuard } from './lib/justtcg-client-guard'

// Enable JustTCG API browser protection
initJustTCGGuard();

createRoot(document.getElementById("root")!).render(<App />);
