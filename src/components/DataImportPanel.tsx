import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Upload, 
  Download, 
  Database, 
  Play, 
  Pause, 
  CheckCircle, 
  AlertCircle, 
  Search, 
  ChevronDown, 
  ChevronRight,
  Package,
  Loader2,
  FileText,
  X,
  Shield,
  RefreshCw,
  Zap,
  AlertTriangle,
  Unlock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { CardDataModal } from './CardDataModal';

interface Game {
  id: string;
  name: string;
  jt_game_id: string;
  sets_count: number;
  cards_count: number;
  last_synced_at: string | null;
}

interface GameSet {
  id: string;
  jt_set_id: string;
  name: string;
  code: string;
  total_cards: number;
  release_date: string;
  game_id: string;
  sync_status: string;
  cards_synced_count: number;
  sealed_synced_count: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export const DataImportPanel = () => {
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; successful: number; failed: number } | null>(null);
  const [bulkCancelRequested, setBulkCancelRequested] = useState(false);
  const [currentOperationId, setCurrentOperationId] = useState<string | null>(null);
  
  const [games, setGames] = useState<Game[]>([]);
  const [filteredGames, setFilteredGames] = useState<Game[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Sets management
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [setsByGame, setSetsByGame] = useState<Map<string, GameSet[]>>(new Map());
  const [selectedSets, setSelectedSets] = useState<Map<string, Set<string>>>(new Map());
  const [setsSearchTerm, setSetsSearchTerm] = useState('');
  const [setsLoading, setSetsLoading] = useState<Set<string>>(new Set());
  const [showUnsyncedOnly, setShowUnsyncedOnly] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Card data modal state
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

  // Status polling state
  const [pollingSetIds, setPollingSetIds] = useState<Set<string>>(new Set());

  // Check if user is admin
  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('Error checking admin status:', error);
        return;
      }
      
      setIsAdmin(data?.is_admin || false);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  // Admin force stop function
  const handleAdminForceStop = async () => {
    if (!isAdmin || !currentOperationId) return;
    
    try {
      // Cancel client-side operations immediately
      setBulkCancelRequested(true);
      setIsImporting(false);
      
      // Insert multiple control records to ensure cancellation
      await supabase
        .from('sync_control')
        .upsert([
          {
            operation_type: 'bulk_sync',
            operation_id: currentOperationId,
            should_cancel: true,
            created_by: user?.id
          },
          {
            operation_type: 'any',
            operation_id: 'force_stop_all',
            should_cancel: true,
            created_by: user?.id
          }
        ]);
      
      // Also try to update any existing records
      await supabase
        .from('sync_control')
        .update({ should_cancel: true })
        .eq('operation_id', currentOperationId);
      
      toast({
        title: "Force Stop Initiated",
        description: "All sync operations stopped immediately",
      });
      
      // Reset states
      setBulkProgress(null);
      setCurrentOperationId(null);
      
    } catch (error) {
      console.error('Error setting force stop:', error);
      
      // Force stop locally even if database update fails
      setBulkCancelRequested(true);
      setIsImporting(false);
      setBulkProgress(null);
      setCurrentOperationId(null);
      
      toast({
        title: "Force Stopped Locally",
        description: "Operations stopped on client side",
        variant: "destructive",
      });
    }
  };

  // Set status polling for background syncs
  const startSetStatusPolling = (setId: string) => {
    if (pollingSetIds.has(setId)) return; // Already polling
    
    setPollingSetIds(prev => new Set(prev).add(setId));
    
    const pollInterval = setInterval(async () => {
      try {
        const { data: setData, error } = await supabase
          .from('sets')
          .select('sync_status, last_synced_at')
          .eq('jt_set_id', setId)
          .single();
        
        if (error) {
          console.error('Polling error:', error);
          clearInterval(pollInterval);
          setPollingSetIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(setId);
            return newSet;
          });
          return;
        }
        
        // Stop polling if no longer syncing
        if (setData?.sync_status !== 'syncing') {
          clearInterval(pollInterval);
          setPollingSetIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(setId);
            return newSet;
          });
        }
      } catch (pollError) {
        console.error('Set polling error:', pollError);
        clearInterval(pollInterval);
        setPollingSetIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(setId);
          return newSet;
        });
      }
    }, 5000); // Poll every 5 seconds
    
    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setPollingSetIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(setId);
        return newSet;
      });
    }, 10 * 60 * 1000);
  };

  // Reset set status (admin only)
  const handleResetSetStatus = async (setInternalId: string, setName: string) => {
    if (!isAdmin) return;
    
    try {
      const { error } = await supabase
        .from('sets')
        .update({ 
          sync_status: 'error',
          last_sync_error: 'Manually unstuck by admin'
        })
        .eq('id', setInternalId);
      
      if (error) throw error;
      
      // Log the reset action
      await supabase
        .from('sync_control')
        .insert({
          operation_type: 'unstick_set',
          operation_id: `unstick_${setInternalId}_${Date.now()}`,
          created_by: user?.id
        });
      
      toast({
        title: "Set Unstuck",
        description: `${setName} has been marked as Error to allow retry`,
      });
      
      // Refresh sets if expanded
      if (expandedGameId) {
        fetchSets(expandedGameId);
      }
    } catch (error) {
      console.error('Error unsticking set:', error);
      toast({
        title: "Unstick Failed",
        description: "Failed to unstick set",
        variant: "destructive",
      });
    }
  };
  
  // Reset set to idle (admin only)
  const handleResetToIdle = async (setInternalId: string, setName: string) => {
    if (!isAdmin) return;
    
    try {
      const { error } = await supabase
        .from('sets')
        .update({ 
          sync_status: 'idle',
          last_sync_error: null
        })
        .eq('id', setInternalId);
      
      if (error) throw error;
      
      // Log the reset action
      await supabase
        .from('sync_control')
        .insert({
          operation_type: 'reset_to_idle',
          operation_id: `reset_idle_${setInternalId}_${Date.now()}`,
          created_by: user?.id
        });
      
      toast({
        title: "Set Reset to Idle",
        description: `${setName} has been reset to idle state`,
      });
      
      // Refresh sets if expanded
      if (expandedGameId) {
        fetchSets(expandedGameId);
      }
    } catch (error) {
      console.error('Error resetting set to idle:', error);
      toast({
        title: "Reset Failed",
        description: "Failed to reset set to idle",
        variant: "destructive",
      });
    }
  };

  // Emergency stop all operations
  const handleEmergencyStop = async () => {
    console.log('🚨 EMERGENCY STOP ACTIVATED');
    
    try {
      // IMMEDIATE CLIENT-SIDE STOP
      setBulkCancelRequested(true);
      setIsImporting(false);
      setBulkProgress(null);
      setCurrentOperationId(null);
      
      // Try to clear sync control records (may fail due to constraints)
      try {
        await supabase
          .from('sync_control')
          .delete()
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Delete last 24h
      } catch (dbError) {
        console.log('DB cleanup failed, continuing with local stop');
      }
      
      // Try to insert new stop signal with unique ID
      try {
        await supabase
          .from('sync_control')
          .insert({
            operation_type: 'emergency_stop',
            operation_id: 'emergency_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            should_cancel: true,
            created_by: user?.id
          });
      } catch (dbError) {
        console.log('Stop signal failed, but local operations are stopped');
      }
        
      toast({
        title: "🚨 EMERGENCY STOP ACTIVATED",
        description: "All operations halted immediately",
        variant: "destructive",
      });
      
      // Force page refresh after 2 seconds to clear any stuck states
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Emergency stop error:', error);
      
      // GUARANTEED LOCAL STOP regardless of any failures
      setBulkCancelRequested(true);
      setIsImporting(false);
      setBulkProgress(null);
      setCurrentOperationId(null);
      
      toast({
        title: "🚨 FORCE STOPPED",
        description: "Operations stopped locally. Refreshing page...",
      });
      
      // Force refresh on any error
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Refresh all status data
  const handleRefreshStatuses = async () => {
    setIsRefreshing(true);
    try {
      await fetchGames();
      if (expandedGameId) {
        await fetchSets(expandedGameId);
      }
      toast({
        title: "Status Updated",
        description: "All sync statuses have been refreshed",
      });
    } catch (error) {
      console.error('Error refreshing statuses:', error);
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh sync statuses",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch games from database
  const fetchGames = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      setGames(data || []);
      setFilteredGames(data || []);
    } catch (error) {
      console.error('Error fetching games:', error);
      toast({
        title: "Error",
        description: "Failed to fetch games from database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch sets for a specific game
  const fetchSets = async (gameId: string) => {
    setSetsLoading(prev => new Set(prev).add(gameId));
    try {
      const { data, error } = await supabase
        .from('sets')
        .select('*, sealed_synced_count')
        .eq('game_id', gameId)
        .order('name');
      
      if (error) throw error;
      
      setSetsByGame(prev => new Map(prev).set(gameId, data || []));
    } catch (error) {
      console.error('Error fetching sets:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sets",
        variant: "destructive",
      });
    } finally {
      setSetsLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(gameId);
        return newSet;
      });
    }
  };

  // Filter games based on search term
  useEffect(() => {
    if (searchTerm) {
      const filtered = games.filter(game => 
        game.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        game.jt_game_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredGames(filtered);
    } else {
      setFilteredGames(games);
    }
  }, [searchTerm, games]);

  // Fetch games on component mount and set up realtime subscriptions
  useEffect(() => {
    fetchGames();
    checkAdminStatus();
    
    // Subscribe to realtime updates for sets and games
    const setsChannel = supabase
      .channel('sets-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'sets' 
      }, (payload) => {
        console.log('Sets realtime update:', payload);
        // Handle real-time updates for sets
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updatedSet = payload.new as GameSet;
          
          // Show toast for sync completion/error
          if (updatedSet.sync_status === 'completed' && payload.old?.sync_status === 'syncing') {
            toast({
              title: "Sync Completed",
              description: `${updatedSet.name} sync finished successfully`,
            });
          } else if (updatedSet.sync_status === 'partial' && payload.old?.sync_status === 'syncing') {
            toast({
              title: "Sync Partial",
              description: `${updatedSet.name} sync partially completed: ${updatedSet.last_sync_error || 'Incomplete data'}`,
              variant: "default",
              className: "border-yellow-500 bg-yellow-50 text-yellow-900",
            });
          } else if (updatedSet.sync_status === 'error' && payload.old?.sync_status === 'syncing') {
            toast({
              title: "Sync Failed",
              description: `${updatedSet.name} sync failed: ${updatedSet.last_sync_error || 'Unknown error'}`,
              variant: "destructive",
            });
          }
          
          // Update sets in the current view if the game is expanded
          if (expandedGameId) {
            setSetsByGame(prev => {
              const currentSets = prev.get(expandedGameId) || [];
              const setIndex = currentSets.findIndex(s => s.id === updatedSet.id);
              if (setIndex >= 0) {
                const updatedSets = [...currentSets];
                updatedSets[setIndex] = updatedSet;
                return new Map(prev).set(expandedGameId, updatedSets);
              }
              return prev;
            });
          }
        }
      })
      .subscribe();

    const gamesChannel = supabase
      .channel('games-changes')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'games' 
      }, (payload) => {
        console.log('Games realtime update:', payload);
        // Refresh games when they're updated
        if (payload.new) {
          setGames(prev => {
            const updatedGame = payload.new as Game;
            const gameIndex = prev.findIndex(g => g.id === updatedGame.id);
            if (gameIndex >= 0) {
              const updatedGames = [...prev];
              updatedGames[gameIndex] = updatedGame;
              return updatedGames;
            }
            return prev;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(setsChannel);
      supabase.removeChannel(gamesChannel);
    };
  }, [expandedGameId]);

  const handleSyncGames = async () => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-games-v2', {
        body: { background: false }
      });

      if (error) throw error;

      setImportProgress(100);
      toast({
        title: "Games Synced",
        description: `Successfully synced ${data.synced} games from JustTCG`,
      });
      
      // Refresh games list after sync
      fetchGames();
    } catch (error) {
      console.error('Error syncing games:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync games",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFullGameSync = async (gameJtId: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      // Resolve internal UUID for DB operations
      let internalGameId = games.find(g => g.jt_game_id === gameJtId)?.id;
      if (!internalGameId) {
        const { data: gameRow, error: gameErr } = await supabase
          .from('games')
          .select('id')
          .eq('jt_game_id', gameJtId)
          .maybeSingle();
        if (gameErr) throw gameErr;
        internalGameId = gameRow?.id || null;
      }
      if (!internalGameId) {
        throw new Error('Game not found locally after syncing sets.');
      }

      // First sync sets via JT game id
      toast({
        title: "Full Sync Started",
        description: "Syncing sets and then all cards for this game...",
      });

      const { data: setsData, error: setsError } = await supabase.functions.invoke('sync-sets-v2', {
        body: { gameId: gameJtId, background: false }
      });

      if (setsError) throw setsError;

      // Refresh sets data for this game (using internal UUID)
      await fetchSets(internalGameId);
      
      // Then get all sets and sync their cards
      const { data: sets, error: setsQueryError } = await supabase
        .from('sets')
        .select('jt_set_id')
        .eq('game_id', internalGameId);
      if (setsQueryError) throw setsQueryError;

      if (sets && sets.length > 0) {
        const setIds = sets.map(s => s.jt_set_id);
        // Store selections keyed by internal game UUID
        setSelectedSets(prev => {
          const newMap = new Map(prev);
          newMap.set(internalGameId!, new Set(setIds));
          return newMap;
        });
        
        // Bulk sync using internal UUID key
        await handleBulkSyncCards(internalGameId);
      }

      toast({
        title: "Full Sync Complete",
        description: `Successfully synced ${setsData?.synced || 0} sets and their cards`,
      });
    } catch (error: any) {
      console.error('Full sync error:', error);
      toast({
        title: "Full Sync Failed",
        description: error.message || "Failed to complete full sync",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncSets = async (gameId: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-sets-v2', {
        body: { gameId, background: false }
      });

      if (error) throw error;

      setImportProgress(100);
      toast({
        title: "Sets Synced",
        description: `Successfully synced ${data.synced} sets from JustTCG`,
      });
      
      // Refresh games list to update sets count
      fetchGames();
      
      // Refresh sets for this game if expanded
      const game = games.find(g => g.jt_game_id === gameId);
      if (game && expandedGameId === game.id) {
        fetchSets(game.id);
      }
    } catch (error) {
      console.error('Error syncing sets:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync sets",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncCards = async (setId: string, gameId?: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      console.log('🧪 Invoking sync-cards-v2 with payload:', { setId, gameId, game: gameId, background: true });
      const { data, error } = await supabase.functions.invoke('sync-cards-v2', {
        body: { setId, gameId, game: gameId, background: true }
      });

      if (error) throw error;

      // Check if this is a background sync response (202 status)
      if (data?.started === true) {
        setIsImporting(false); // Stop showing importing immediately
        toast({
          title: "Sync Started",
          description: "Sync started and continues in background. Watch set status for updates.",
        });
        
        // Start polling for status updates
        startSetStatusPolling(setId);
      } else {
        setImportProgress(100);
        const cardsProcessed = data?.cardsProcessed ?? data?.totalProcessed ?? data?.cards ?? 0;
        const variantsProcessed = data?.variantsProcessed ?? data?.variants ?? 0;
        toast({
          title: "Cards Synced",
          description: `${cardsProcessed} cards, ${variantsProcessed} variants processed`,
        });
      }
    } catch (error: any) {
      console.error('❌ Card sync error:', error);
      
      // Enhanced error logging and display
      let errorMessage = "Failed to sync cards";
      let errorDetails = "";
      
      if (error?.message) {
        errorMessage = error.message;
      }
      
      // Handle Supabase function invoke errors
      if (error?.context?.body) {
        try {
          const errorBody = typeof error.context.body === 'string' 
            ? JSON.parse(error.context.body) 
            : error.context.body;
          
          if (errorBody.error) {
            errorMessage = errorBody.message || errorBody.error;
            errorDetails = errorBody.code ? ` (Code: ${errorBody.code})` : "";
          }
        } catch (parseError) {
          console.error('Failed to parse error body:', parseError);
        }
      }
      
      // Handle HTTP status errors
      if (error?.context?.status) {
        errorDetails += ` [HTTP ${error.context.status}]`;
      }
      
      toast({
        title: "Card Sync Failed",
        description: `${errorMessage}${errorDetails}`,
        variant: "destructive",
      });
    } finally {
      // Don't set importing to false if background sync started
      setIsImporting(false);
    }
  };

  const handleBulkSyncCards = async (gameId: string) => {
    const gameSelectedSets = selectedSets.get(gameId);
    if (!gameSelectedSets || gameSelectedSets.size === 0) return;

    const setIds = Array.from(gameSelectedSets);
    const operationId = `bulk_sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentOperationId(operationId);
    
    setIsImporting(true);
    setBulkCancelRequested(false);
    setBulkProgress({ current: 0, total: setIds.length, successful: 0, failed: 0 });
    
    let successful = 0;
    let failed = 0;
    let allResults: any[] = [];
    const concurrency = 3; // Process 3 sets at a time
    
    try {
      // Process sets in batches with concurrency limit
      for (let i = 0; i < setIds.length; i += concurrency) {
        if (bulkCancelRequested) {
          toast({
            title: "Sync Cancelled",
            description: `Cancelled after processing ${successful + failed}/${setIds.length} sets`,
            variant: "destructive",
          });
          break;
        }

        const batch = setIds.slice(i, i + concurrency);
        const promises = batch.map(async (setId) => {
          if (bulkCancelRequested) return { success: false, setId };
          
            try {
              // Map internal game UUID to JT slug for the API
              const jtGameId = games.find(g => g.id === gameId)?.jt_game_id;
              console.log('📦 Bulk invoking sync-cards-v2:', { setId, gameId: jtGameId, game: jtGameId, background: true });
              const { data, error } = await supabase.functions.invoke('sync-cards-v2', {
                body: { setId, gameId: jtGameId, game: jtGameId, background: true }
              });

            if (error) {
              console.error(`Error syncing set ${setId}:`, error);
              return { success: false, setId, error: error.message || 'Unknown error' };
            }

            // ===== 5. BETTER LOG MESSAGES & NULL-SAFE PROGRESS TEXT =====
            const cardsProcessed = data?.cardsProcessed ?? data?.cards ?? 0;
            const variantsProcessed = data?.variantsProcessed ?? data?.variants ?? 0;
            console.log(`✅ Set ${setId} synced: ${cardsProcessed} cards, ${variantsProcessed} variants`);
            
            // Handle background sync started response
            if (data?.started === true) {
              // Start polling for each set if background sync
              startSetStatusPolling(setId);
            }
            
            return { success: true, setId, data };
          } catch (error: any) {
            console.error(`Error syncing set ${setId}:`, error);
            return { 
              success: false, 
              setId, 
              error: error.message || 'Network error - failed to reach sync function'
            };
          }
        });

        const results = await Promise.all(promises);
        
        // Update progress with null-safe counts
        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;
        
        successful += successCount;
        failed += failedCount;
        
        setBulkProgress({ 
          current: successful + failed, 
          total: setIds.length, 
          successful, 
          failed 
        });

        // Collect results with null-safe data extraction
        allResults.push(...results.map(result => ({
          ...result,
          cardsProcessed: result.data?.cardsProcessed ?? result.data?.cards ?? 0,
          variantsProcessed: result.data?.variantsProcessed ?? result.data?.variants ?? 0
        })));
      }

      if (!bulkCancelRequested) {
        const hasBackgroundSyncs = allResults.some(r => r.success && r.data?.started === true);
        
        if (hasBackgroundSyncs) {
          toast({
            title: "Bulk Sync Started",
            description: `${setIds.length} sets started syncing in background. Watch set statuses for updates.`,
          });
        } else {
          // ===== 5. NULL-SAFE FINAL PROGRESS TEXT =====
          const totalCardsProcessed = allResults.reduce((sum, result) => 
            sum + (result.cardsProcessed ?? 0), 0);
          const totalVariantsProcessed = allResults.reduce((sum, result) => 
            sum + (result.variantsProcessed ?? 0), 0);
          
          toast({
            title: "Bulk Sync Complete", 
            description: `Processed ${setIds.length} sets: ${successful} successful, ${failed} failed. Total: ${totalCardsProcessed} cards, ${totalVariantsProcessed} variants`,
            variant: successful > 0 ? "default" : "destructive",
          });
        }
        
        // Clear selections on successful completion
        setSelectedSets(prev => {
          const newMap = new Map(prev);
          newMap.delete(gameId);
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error bulk syncing cards:', error);
      toast({
        title: "Bulk Sync Failed",
        description: error.message || "Failed to bulk sync cards",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setBulkProgress(null);
      setBulkCancelRequested(false);
      setCurrentOperationId(null);
    }
  };

  const handleCancelBulkSync = () => {
    console.log('🛑 CANCEL SYNC ACTIVATED');
    
    // IMMEDIATE STOP
    setBulkCancelRequested(true);
    setIsImporting(false);
    setBulkProgress(null);
    setCurrentOperationId(null);
    
    toast({
      title: "🛑 SYNC STOPPED",
      description: "All operations cancelled immediately",
    });
    
    // Optional: Force refresh after 1 second to clear any stuck state
    setTimeout(() => {
      if (isImporting || bulkProgress) {
        window.location.reload();
      }
    }, 1000);
  };

  const handleGameExpand = (gameId: string) => {
    if (expandedGameId === gameId) {
      setExpandedGameId(null);
    } else {
      setExpandedGameId(gameId);
      if (!setsByGame.has(gameId)) {
        fetchSets(gameId);
      }
    }
  };

  const handleSetSelect = (gameId: string, setId: string, checked: boolean | 'indeterminate') => {
    if (checked === 'indeterminate') return;
    
    setSelectedSets(prev => {
      const newMap = new Map(prev);
      const gameSelections = newMap.get(gameId) || new Set<string>();
      
      if (checked) {
        gameSelections.add(setId);
      } else {
        gameSelections.delete(setId);
      }
      
      if (gameSelections.size > 0) {
        newMap.set(gameId, gameSelections);
      } else {
        newMap.delete(gameId);
      }
      
      return newMap;
    });
  };

  const handleSelectAllSets = (gameId: string, checked: boolean | 'indeterminate') => {
    if (checked === 'indeterminate') return;
    const gameSets = setsByGame.get(gameId) || [];
    const filteredSets = gameSets.filter(set => 
      !setsSearchTerm || 
      set.name.toLowerCase().includes(setsSearchTerm.toLowerCase()) ||
      set.code?.toLowerCase().includes(setsSearchTerm.toLowerCase())
    );
    
    setSelectedSets(prev => {
      const newMap = new Map(prev);
      
      if (checked) {
        const gameSelections = new Set(filteredSets.map(set => set.jt_set_id));
        newMap.set(gameId, gameSelections);
      } else {
        newMap.delete(gameId);
      }
      
      return newMap;
    });
  };

  const getFilteredSets = (gameId: string) => {
    const gameSets = setsByGame.get(gameId) || [];
    let filtered = gameSets;
    
    // Apply search filter
    if (setsSearchTerm) {
      filtered = filtered.filter(set => 
        set.name.toLowerCase().includes(setsSearchTerm.toLowerCase()) ||
        set.code?.toLowerCase().includes(setsSearchTerm.toLowerCase())
      );
    }
    
    // Apply unsynced filter
    if (showUnsyncedOnly) {
      filtered = filtered.filter(set => 
        set.cards_synced_count === 0 || !set.last_synced_at
      );
    }
    
    return filtered;
  };

  const getSelectedCount = (gameId: string) => {
    return selectedSets.get(gameId)?.size || 0;
  };

  const isAllSelected = (gameId: string) => {
    const filteredSets = getFilteredSets(gameId);
    const gameSelectedSets = selectedSets.get(gameId);
    return filteredSets.length > 0 && !!gameSelectedSets && 
           filteredSets.every(set => gameSelectedSets.has(set.jt_set_id));
  };

  const viewSampleCard = async (setId: string) => {
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('set_id', setId)
        .limit(1)
        .single();

      if (error) throw error;

      if (data) {
        setSelectedCard(data);
        setIsCardModalOpen(true);
      } else {
        toast({
          title: "No Cards",
          description: "No cards found for this set",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching sample card:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sample card data",
        variant: "destructive",
      });
    }
  };

  const importMethods = [
    {
      title: "Sync Games",
      description: "Sync all games from JustTCG API",
      icon: <Database className="h-4 w-4" />,
      action: handleSyncGames
    }
  ];

  return (
    <div className="space-y-6">
      {/* Emergency Controls - Always Visible During Operations */}
      {(isImporting || bulkProgress || currentOperationId) && (
        <Card className="bg-red-50 border-red-200 shadow-card">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-semibold text-red-700">Operations Running</h3>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCancelBulkSync}
                  size="sm"
                  variant="outline"
                  className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                >
                  <X className="h-4 w-4 mr-2" />
                  Stop Now
                </Button>
                <Button
                  onClick={handleEmergencyStop}
                  size="sm"
                  variant="destructive"
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  EMERGENCY STOP
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      
      {/* API Status */}
      <Card className="bg-gradient-card border-border shadow-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">JustTCG API Status</h3>
            <Badge variant="default" className="ml-auto">
              Configured
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-green-500">API key configured in Supabase Edge Functions</span>
          </div>
        </div>
      </Card>

      {/* Import Methods */}
      <div className="grid grid-cols-1 gap-4">
        {importMethods.map((method) => (
          <Card key={method.title} className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 group shadow-card">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                {method.icon}
                <div className="space-y-2 flex-1">
                  <h4 className="font-semibold text-foreground">{method.title}</h4>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                </div>
              </div>
              
              <Button 
                onClick={method.action}
                className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20"
                disabled={isImporting}
              >
                {isImporting ? 'Syncing...' : 'Start Sync'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Games List */}
      <Card className="bg-gradient-card border-border shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Imported Games</CardTitle>
              <CardDescription>Expand games to view and sync sets</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefreshStatuses}
                disabled={isRefreshing}
                variant="ghost"
                size="sm"
                className="h-8 px-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Badge variant="outline">{filteredGames.length} games</Badge>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search games..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading games...</p>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {searchTerm ? 'No games found matching your search' : 'No games imported yet. Sync games first.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGames.map((game) => (
                <Collapsible 
                  key={game.id} 
                  open={expandedGameId === game.id}
                  onOpenChange={() => handleGameExpand(game.id)}
                >
                  <div className="rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-colors">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer">
                        <div className="flex items-center gap-3 flex-1">
                          {expandedGameId === game.id ? 
                            <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          }
                          <div className="flex-1">
                            <h4 className="font-medium text-foreground">{game.name}</h4>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span>ID: {game.jt_game_id}</span>
                              <span>Sets: {game.sets_count || 0}</span>
                              <span>Cards: {game.cards_count || 0}</span>
                              {game.last_synced_at && (
                                <span>Last synced: {new Date(game.last_synced_at).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 ml-4">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncSets(game.jt_game_id);
                            }}
                            disabled={isImporting}
                            variant="outline"
                            size="sm"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Sync Sets
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFullGameSync(game.jt_game_id);
                            }}
                            disabled={isImporting}
                            variant="default"
                            size="sm"
                            className="bg-primary text-primary-foreground"
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Full Sync
                          </Button>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="border-t border-border p-4 bg-muted/20">
                        {setsLoading.has(game.id) ? (
                          <div className="text-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                            <p className="text-sm text-muted-foreground mt-2">Loading sets...</p>
                          </div>
                        ) : (
                          <>
                            {/* Sets toolbar */}
                            <div className="mb-4 space-y-3">
                              <div className="flex gap-3">
                                <div className="relative flex-1">
                                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    placeholder="Search sets..."
                                    value={setsSearchTerm}
                                    onChange={(e) => setSetsSearchTerm(e.target.value)}
                                    className="pl-9"
                                  />
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="show-unsynced"
                                    checked={showUnsyncedOnly}
                                    onCheckedChange={(checked) => setShowUnsyncedOnly(checked as boolean)}
                                  />
                                  <label htmlFor="show-unsynced" className="text-sm">
                                    Unsynced only
                                  </label>
                                </div>
                              </div>
                              
                              {getFilteredSets(game.id).length > 0 && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`select-all-${game.id}`}
                                        checked={isAllSelected(game.id)}
                                        onCheckedChange={(checked) => handleSelectAllSets(game.id, checked as boolean)}
                                      />
                                      <label htmlFor={`select-all-${game.id}`} className="text-sm font-medium">
                                        Select All
                                      </label>
                                    </div>
                                    <Badge variant="outline">
                                      {getSelectedCount(game.id)} / {getFilteredSets(game.id).length} selected
                                    </Badge>
                                  </div>
                                  
                                  {getSelectedCount(game.id) > 0 && (
                                    <div className="flex gap-2">
                                      <Button
                                        onClick={() => handleBulkSyncCards(game.id)}
                                        disabled={isImporting}
                                        size="sm"
                                        className="bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                                      >
                                        <Package className="h-4 w-4 mr-2" />
                                        Sync Selected Sets ({getSelectedCount(game.id)})
                                      </Button>
                                      {isImporting && bulkProgress && (
                                        <div className="flex gap-2">
                                          <Button
                                            onClick={handleCancelBulkSync}
                                            size="sm"
                                            variant="outline"
                                            className="border-muted-foreground/20 text-muted-foreground hover:bg-muted"
                                          >
                                            <X className="h-4 w-4 mr-2" />
                                            Cancel
                                          </Button>
                                          {isAdmin && (
                                            <Button
                                              onClick={handleAdminForceStop}
                                              size="sm"
                                              variant="destructive"
                                              className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                            >
                                              <Shield className="h-4 w-4 mr-2" />
                                              Admin Force Stop
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* Sets list */}
                            <div className="space-y-2">
                              {getFilteredSets(game.id).length === 0 ? (
                                <div className="text-center py-6">
                                  <Package className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                                  <p className="text-sm text-muted-foreground">
                                    {setsSearchTerm ? 'No sets found matching your search' : 'No sets found. Sync sets first.'}
                                  </p>
                                </div>
                              ) : (
                                getFilteredSets(game.id).map((set) => {
                                  const isSelected = selectedSets.get(game.id)?.has(set.jt_set_id) || false;
                                  const getStatusBadge = () => {
                                    const totalSynced = set.cards_synced_count + (set.sealed_synced_count || 0);
                                    const isSynced = totalSynced > 0 && 
                                      set.total_cards > 0 && 
                                      totalSynced >= set.total_cards;
                                    
                                    // Check if stuck (syncing for more than 15 minutes)
                                    const isStuck = set.sync_status === 'syncing' && 
                                      set.last_synced_at && 
                                      new Date().getTime() - new Date(set.last_synced_at).getTime() > 15 * 60 * 1000;
                                    
                                     switch (set.sync_status) {
                                       case 'syncing':
                                         return isStuck 
                                           ? (
                                             <Tooltip>
                                               <TooltipTrigger>
                                                 <Badge variant="destructive" className="text-orange-600 border-orange-500">
                                                   <AlertTriangle className="h-3 w-3 mr-1" />
                                                   Stuck
                                                 </Badge>
                                               </TooltipTrigger>
                                               <TooltipContent>
                                                 <p>Syncing for over 15 minutes - may need admin intervention</p>
                                               </TooltipContent>
                                             </Tooltip>
                                           )
                                           : <Badge variant="secondary" className="text-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Syncing</Badge>;
                                       case 'success':
                                       case 'completed':
                                         return isSynced 
                                           ? <Badge variant="default" className="text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Synced</Badge>
                                           : <Badge variant="secondary" className="text-yellow-600">Partial</Badge>;
                                       case 'partial':
                                         return <Badge variant="secondary" className="text-yellow-600">Partial</Badge>;
                                       case 'error':
                                         return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
                                       default:
                                         return <Badge variant="outline">Not synced</Badge>;
                                     }
                                   };
                                   
                                   const isStuck = set.sync_status === 'syncing' && 
                                     set.last_synced_at && 
                                     new Date().getTime() - new Date(set.last_synced_at).getTime() > 15 * 60 * 1000;
                                  
                                  return (
                                    <div key={set.id} className="flex items-center space-x-3 p-3 rounded border border-border/50 bg-background/30">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => handleSetSelect(game.id, set.jt_set_id, checked as boolean)}
                                        disabled={set.sync_status === 'syncing' && !isStuck}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <h5 className="font-medium text-sm truncate">{set.name}</h5>
                                          {getStatusBadge()}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                          {set.code && <span>Code: {set.code}</span>}
                                          <span>Singles: {set.cards_synced_count}</span>
                                          <span>Sealed: {set.sealed_synced_count || 0}</span>
                                          <span>Total: {set.cards_synced_count + (set.sealed_synced_count || 0)}/{set.total_cards || 0}</span>
                                          {set.last_synced_at && (
                                            <span>Last synced: {new Date(set.last_synced_at).toLocaleDateString()}</span>
                                          )}
                                          {set.release_date && <span>Released: {set.release_date}</span>}
                                        </div>
                                         {set.last_sync_error && (
                                           <div className="text-xs text-red-500 mt-1 truncate">
                                             Error: {set.last_sync_error}
                                           </div>
                                         )}
                                       </div>
                                       
                                       {/* Special test button for Aquapolis */}
                                       {set.jt_set_id === 'Aquapolis' && (
                                         <div className="mb-2">
                                           <Button
                                             onClick={async () => {
                                               console.log('🧪 Testing Aquapolis sync with params:', {
                                                 gameId: game?.jt_game_id,
                                                 setId: set.jt_set_id,
                                                 gameDbId: game?.id,
                                                 setDbId: set.id
                                               });
                                               await handleSyncCards(set.jt_set_id, game?.jt_game_id);
                                             }}
                                             disabled={isImporting || !game?.jt_game_id}
                                             variant="secondary"
                                             size="sm"
                                             className="text-xs"
                                           >
                                             🧪 Test Aquapolis
                                           </Button>
                                         </div>
                                       )}
                                       
                                        <div className="flex gap-2">
                                          <Button
                                            onClick={() => handleSyncCards(set.jt_set_id, game?.jt_game_id)}
                                            disabled={isImporting || (set.sync_status === 'syncing' && !isStuck) || !game?.jt_game_id}
                                            variant="outline"
                                            size="sm"
                                          >
                                           {set.sync_status === 'syncing' && !isStuck ? (
                                             <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                           ) : (
                                             <Download className="h-3 w-3 mr-1" />
                                           )}
                                           {set.sync_status === 'syncing' && !isStuck ? 'Syncing...' : 'Sync Cards'}
                                         </Button>
                                          {isAdmin && isStuck && (
                                            <div className="flex gap-1">
                                              <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                                      >
                                                        <Unlock className="h-3 w-3 mr-1" />
                                                        Unstick
                                                      </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <p>Marks this set as Error to allow re-running the sync. No data is deleted.</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                  <AlertDialogHeader>
                                                    <AlertDialogTitle>Unstick Set</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                      This will mark "{set.name}" as Error to allow re-running the sync. 
                                                      No existing data will be deleted. You can then retry the sync operation.
                                                    </AlertDialogDescription>
                                                  </AlertDialogHeader>
                                                  <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction 
                                                      onClick={() => handleResetSetStatus(set.id, set.name)}
                                                      className="bg-orange-500 hover:bg-orange-600"
                                                    >
                                                      Unstick Set
                                                    </AlertDialogAction>
                                                  </AlertDialogFooter>
                                                </AlertDialogContent>
                                              </AlertDialog>
                                              
                                              <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                                      >
                                                        <RefreshCw className="h-3 w-3 mr-1" />
                                                        Reset
                                                      </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <p>Resets to idle state and clears errors</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                  <AlertDialogHeader>
                                                    <AlertDialogTitle>Reset to Idle</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                      This will reset "{set.name}" to idle state and clear any error messages.
                                                      No existing data will be deleted.
                                                    </AlertDialogDescription>
                                                  </AlertDialogHeader>
                                                  <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction 
                                                      onClick={() => handleResetToIdle(set.id, set.name)}
                                                      className="bg-blue-500 hover:bg-blue-600"
                                                    >
                                                      Reset to Idle
                                                    </AlertDialogAction>
                                                  </AlertDialogFooter>
                                                </AlertDialogContent>
                                              </AlertDialog>
                                            </div>
                                          )}
                                         {set.cards_synced_count > 0 && (
                                           <Button
                                             onClick={() => viewSampleCard(set.id)}
                                             size="sm"
                                             variant="ghost"
                                             className="text-accent hover:text-accent-foreground"
                                           >
                                             <FileText className="h-4 w-4 mr-1" />
                                             View Sample JSON
                                           </Button>
                                         )}
                                       </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Status */}
      {(importProgress > 0 || bulkProgress || isImporting) && (
        <Card className="bg-gradient-card border-border shadow-card">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {importProgress === 100 && !bulkProgress ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-accent" />
                )}
                <h3 className="text-lg font-semibold">
                  {importProgress === 100 && !bulkProgress ? "Sync Complete" : "Sync in Progress"}
                </h3>
              </div>
              
              {/* Emergency stop controls */}
              <div className="flex gap-2">
                <Button
                  onClick={handleCancelBulkSync}
                  size="sm"
                  variant="outline"
                  className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleEmergencyStop}
                  size="sm"
                  variant="destructive"
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Emergency Stop
                </Button>
              </div>
            </div>
            
            {bulkProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Bulk Sync Progress</span>
                  <span className="text-sm text-muted-foreground">
                    {bulkProgress.current}/{bulkProgress.total} sets 
                    {bulkProgress.successful > 0 && ` (${bulkProgress.successful} ✓`}
                    {bulkProgress.failed > 0 && ` ${bulkProgress.failed} ✗`}
                    {(bulkProgress.successful > 0 || bulkProgress.failed > 0) && ')'}
                  </span>
                </div>
                <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
                {bulkCancelRequested && (
                  <div className="text-sm text-red-600 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Operations stopped - cancelling remaining tasks
                  </div>
                )}
              </div>
            )}
            
            {importProgress < 100 && !bulkProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Progress</span>
                  <span className="text-sm text-muted-foreground">{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}
          </div>
        </Card>
      )}
      
      <CardDataModal 
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        card={selectedCard}
      />
    </div>
  );
};