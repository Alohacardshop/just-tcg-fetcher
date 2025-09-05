import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import App from './App.tsx'
import './index.css'
import { initJustTCGGuard } from './lib/justtcg-client-guard'

// Enable JustTCG API browser protection
initJustTCGGuard();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
