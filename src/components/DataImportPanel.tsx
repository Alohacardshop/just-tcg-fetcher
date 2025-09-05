import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Zap
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
      await supabase
        .from('sync_control')
        .upsert({
          operation_type: 'bulk_sync',
          operation_id: currentOperationId,
          should_cancel: true,
          created_by: user?.id
        });
      
      toast({
        title: "Force Stop Initiated",
        description: "Server-side cancellation signal sent",
      });
    } catch (error) {
      console.error('Error setting force stop:', error);
      toast({
        title: "Error",
        description: "Failed to send force stop signal",
        variant: "destructive",
      });
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
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-games' }
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

  const handleFullGameSync = async (gameId: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      // First sync sets
      toast({
        title: "Full Sync Started",
        description: "Syncing sets and then all cards for this game...",
      });

      const { data: setsData, error: setsError } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-sets', gameId }
      });

      if (setsError) throw setsError;

      await fetchSets(gameId); // Refresh sets data
      
      // Then get all sets and sync their cards
      const { data: sets } = await supabase
        .from('sets')
        .select('jt_set_id')
        .eq('game_id', gameId);

      if (sets && sets.length > 0) {
        // Add sets to selected sets for this game
        const setIds = sets.map(s => s.jt_set_id);
        const newSelectedSets = new Map(selectedSets);
        newSelectedSets.set(gameId, new Set(setIds));
        setSelectedSets(newSelectedSets);
        
        // Then bulk sync
        await handleBulkSyncCards(gameId);
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
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-sets', gameId }
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

  const handleSyncCards = async (setId: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-cards', setId }
      });

      if (error) throw error;

      setImportProgress(100);
      toast({
        title: "Cards Synced",
        description: `Successfully synced ${data.synced} cards and ${data.pricesSynced} prices from JustTCG`,
      });
    } catch (error) {
      console.error('Error syncing cards:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync cards",
        variant: "destructive",
      });
    } finally {
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
            const { data, error } = await supabase.functions.invoke('justtcg-sync', {
              body: { action: 'sync-cards', setId, operationId }
            });
            if (error) throw error;
            return { success: true, setId, data };
          } catch (error) {
            console.error(`Error syncing set ${setId}:`, error);
            return { success: false, setId, error: error.message };
          }
        });

        const results = await Promise.all(promises);
        
        results.forEach(result => {
          if (result.success) {
            successful++;
          } else {
            failed++;
          }
        });

        setBulkProgress({ 
          current: successful + failed, 
          total: setIds.length, 
          successful, 
          failed 
        });
      }

      if (!bulkCancelRequested) {
        toast({
          title: "Bulk Sync Complete",
          description: `Processed ${successful + failed}/${setIds.length} sets. ${successful} successful, ${failed} failed.`,
        });
        
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
    setBulkCancelRequested(true);
    toast({
      title: "Cancelling Sync",
      description: "Stopping after current operations complete...",
    });
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
    return filteredSets.length > 0 && gameSelectedSets && 
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
                                    
                                     switch (set.sync_status) {
                                       case 'syncing':
                                         return <Badge variant="secondary" className="text-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Syncing</Badge>;
                                       case 'success':
                                       case 'completed':
                                         return isSynced 
                                           ? <Badge variant="default" className="text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Synced</Badge>
                                           : <Badge variant="secondary" className="text-yellow-600">Partial</Badge>;
                                       case 'error':
                                         return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
                                       default:
                                         return <Badge variant="outline">Not synced</Badge>;
                                     }
                                  };
                                  
                                  return (
                                    <div key={set.id} className="flex items-center space-x-3 p-3 rounded border border-border/50 bg-background/30">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => handleSetSelect(game.id, set.jt_set_id, checked as boolean)}
                                        disabled={set.sync_status === 'syncing'}
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
                                       <div className="flex gap-2">
                                         <Button
                                           onClick={() => handleSyncCards(set.jt_set_id)}
                                           disabled={isImporting || set.sync_status === 'syncing'}
                                           variant="outline"
                                           size="sm"
                                         >
                                           {set.sync_status === 'syncing' ? (
                                             <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                           ) : (
                                             <Download className="h-3 w-3 mr-1" />
                                           )}
                                           {set.sync_status === 'syncing' ? 'Syncing...' : 'Sync Cards'}
                                         </Button>
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
      {(importProgress > 0 || bulkProgress) && (
        <Card className="bg-gradient-card border-border shadow-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              {importProgress === 100 && !bulkProgress ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-accent" />
              )}
              <h3 className="text-lg font-semibold">
                {importProgress === 100 && !bulkProgress ? "Sync Complete" : "Sync in Progress"}
              </h3>
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
                  <div className="text-sm text-yellow-600 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Cancelling... waiting for current operations to complete
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