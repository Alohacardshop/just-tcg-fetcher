import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Download, CheckCircle, XCircle, Database, MapPin, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface Game {
  id: string;
  name: string;
  slug: string;
  tcgcsv_category_id: string;
  sets_count: number;
  cards_count: number;
}

interface SyncResult {
  success: boolean;
  message: string;
  details?: any;
}

interface FetchResult {
  success: boolean;
  message: string;
  groupsUpserted?: number;
  productsUpserted?: number;
  operationId?: string;
}

interface MatchResult {
  success: boolean;
  message: string;
  dryRun: boolean;
  groupMatching?: any;
  productMatching?: any;
  operationId?: string;
}

export function TcgCsvSync() {
  const [selectedGameSlug, setSelectedGameSlug] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('download');
  const [dryRun, setDryRun] = useState(true);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [wipeBefore, setWipeBefore] = useState(false);
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);
  
  // Results for different operations
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  
  const queryClient = useQueryClient();

  // Fetch games with tcgcsv category IDs
  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['games-with-tcgcsv'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('id, name, slug, tcgcsv_category_id, sets_count, cards_count')
        .not('tcgcsv_category_id', 'is', null)
        .not('slug', 'is', null)
        .order('name');
      
      if (error) throw error;
      return data as Game[];
    }
  });

  // TCGCSV Fetch All mutation
  const fetchMutation = useMutation({
    mutationFn: async ({ gameId, categoryId }: { gameId: string; categoryId: string }) => {
      const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-all', {
        body: {
          gameId,
          categoryId,
          wipeBefore,
          background: false
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setFetchResult(data);
      toast.success('TCGCSV data fetch completed successfully');
      queryClient.invalidateQueries({ queryKey: ['tcgcsv-groups'] });
      queryClient.invalidateQueries({ queryKey: ['tcgcsv-products'] });
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
    onError: (error: any) => {
      setFetchResult({ success: false, message: error.message || 'Fetch failed' });
      toast.error('Fetch failed: ' + (error.message || 'Unknown error'));
    }
  });

  // TCGCSV Match mutation
  const matchMutation = useMutation({
    mutationFn: async ({ gameId, matchType }: { gameId: string; matchType: string }) => {
      const { data, error } = await supabase.functions.invoke('tcgcsv-match', {
        body: {
          gameId,
          dryRun,
          onlyUnmapped,
          matchType,
          background: false
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setMatchResult(data);
      toast.success(dryRun ? 'Match analysis completed' : 'Matching completed successfully');
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ['cards'] });
        queryClient.invalidateQueries({ queryKey: ['sets'] });
      }
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
    onError: (error: any) => {
      setMatchResult({ success: false, message: error.message || 'Matching failed', dryRun });
      toast.error('Matching failed: ' + (error.message || 'Unknown error'));
    }
  });

  // Legacy sync mutation for existing image sync functionality
  const syncMutation = useMutation({
    mutationFn: async ({ gameSlug, dryRun, forceUpdate }: { gameSlug: string; dryRun: boolean; forceUpdate: boolean }) => {
      const { data, error } = await supabase.functions.invoke('sync-images-tcgcsv', {
        body: {
          gameSlug,
          dryRun,
          forceUpdate,
          background: false
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSyncResult({ success: true, message: 'Legacy sync completed successfully', details: data });
      toast.success('Legacy sync completed successfully');
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
    onError: (error: any) => {
      setSyncResult({ success: false, message: error.message || 'Sync failed' });
      toast.error('Sync failed: ' + (error.message || 'Unknown error'));
    }
  });

  const handleFetch = () => {
    if (!selectedGameSlug) {
      toast.error('Please select a game first');
      return;
    }
    
    const game = games.find(g => g.slug === selectedGameSlug);
    if (!game?.tcgcsv_category_id) {
      toast.error('Selected game does not have a TCGCSV category ID');
      return;
    }
    
    setFetchResult(null);
    fetchMutation.mutate({ gameId: game.id, categoryId: game.tcgcsv_category_id });
  };

  const handleMatch = (matchType: string) => {
    if (!selectedGameSlug) {
      toast.error('Please select a game first');
      return;
    }
    
    const game = games.find(g => g.slug === selectedGameSlug);
    if (!game) {
      toast.error('Selected game not found');
      return;
    }
    
    setMatchResult(null);
    matchMutation.mutate({ gameId: game.id, matchType });
  };

  const handleLegacySync = () => {
    if (!selectedGameSlug) {
      toast.error('Please select a game first');
      return;
    }
    
    setSyncResult(null);
    syncMutation.mutate({ gameSlug: selectedGameSlug, dryRun, forceUpdate });
  };

  const selectedGame = games.find(g => g.slug === selectedGameSlug);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            TCGCSV Complete Data Sync
          </CardTitle>
          <CardDescription>
            Download all TCGCSV data and match it to your existing cards and sets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Game Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Game</label>
            <Select value={selectedGameSlug} onValueChange={setSelectedGameSlug}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a game to sync..." />
              </SelectTrigger>
              <SelectContent>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.slug}>
                    <div className="flex items-center justify-between w-full">
                      <span>{game.name}</span>
                      <Badge variant="secondary" className="ml-2">
                        Category {game.tcgcsv_category_id}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Game Info */}
          {selectedGame && (
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div className="font-medium">{selectedGame.name}</div>
              <div className="text-sm text-muted-foreground">
                TCG CSV Category ID: {selectedGame.tcgcsv_category_id} • 
                {selectedGame.sets_count} sets • 
                {selectedGame.cards_count.toLocaleString()} cards
              </div>
            </div>
          )}

          {/* 3-Step Workflow Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="download" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download
              </TabsTrigger>
              <TabsTrigger value="match" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Match
              </TabsTrigger>
              <TabsTrigger value="legacy" className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                Legacy Sync
              </TabsTrigger>
            </TabsList>

            {/* Step 1: Download TCGCSV Data */}
            <TabsContent value="download" className="space-y-4">
              <div className="space-y-3">
                <h3 className="font-medium">Step 1: Download TCGCSV Data</h3>
                <p className="text-sm text-muted-foreground">
                  Download all groups and products from TCGCSV for the selected game. This data will be stored in staging tables.
                </p>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="wipeBefore"
                    checked={wipeBefore}
                    onChange={(e) => setWipeBefore(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="wipeBefore" className="text-sm">
                    Clear existing TCGCSV data before download
                  </label>
                </div>

                <Button 
                  onClick={handleFetch}
                  disabled={!selectedGameSlug || fetchMutation.isPending}
                  className="w-full"
                >
                  {fetchMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Downloading TCGCSV Data...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download All TCGCSV Data
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Step 2: Match Data */}
            <TabsContent value="match" className="space-y-4">
              <div className="space-y-3">
                <h3 className="font-medium">Step 2: Match TCGCSV Data</h3>
                <p className="text-sm text-muted-foreground">
                  Match downloaded TCGCSV groups to your sets and products to your cards.
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="dryRun"
                      checked={dryRun}
                      onChange={(e) => setDryRun(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="dryRun" className="text-sm">
                      Dry run (analyze matches without applying changes)
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="onlyUnmapped"
                      checked={onlyUnmapped}
                      onChange={(e) => setOnlyUnmapped(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="onlyUnmapped" className="text-sm">
                      Only match cards without existing TCGCSV data
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <Button 
                    onClick={() => handleMatch('both')}
                    disabled={!selectedGameSlug || matchMutation.isPending}
                    className="w-full"
                  >
                    {matchMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Matching Data...
                      </>
                    ) : (
                      <>
                        <MapPin className="mr-2 h-4 w-4" />
                        {dryRun ? 'Analyze Matches' : 'Match All Data'}
                      </>
                    )}
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => handleMatch('groups')}
                      disabled={!selectedGameSlug || matchMutation.isPending}
                    >
                      Match Groups→Sets Only
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleMatch('products')}
                      disabled={!selectedGameSlug || matchMutation.isPending}
                    >
                      Match Products→Cards Only
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Step 3: Legacy Image Sync */}
            <TabsContent value="legacy" className="space-y-4">
              <div className="space-y-3">
                <h3 className="font-medium">Legacy: Image Sync Only</h3>
                <p className="text-sm text-muted-foreground">
                  Use the original image sync logic (for backwards compatibility).
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="legacyDryRun"
                      checked={dryRun}
                      onChange={(e) => setDryRun(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="legacyDryRun" className="text-sm">
                      Dry run (preview only)
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="forceUpdate"
                      checked={forceUpdate}
                      onChange={(e) => setForceUpdate(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="forceUpdate" className="text-sm">
                      Force update existing images
                    </label>
                  </div>
                </div>

                <Button 
                  onClick={handleLegacySync}
                  disabled={!selectedGameSlug || syncMutation.isPending}
                  className="w-full"
                  variant="outline"
                >
                  {syncMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {dryRun ? 'Running Preview...' : 'Syncing Images...'}
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      {dryRun ? 'Preview Legacy Sync' : 'Start Legacy Sync'}
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Results */}
      {(fetchResult || matchResult || syncResult) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {(fetchResult?.success || matchResult?.success || syncResult?.success) ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Operation Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fetch Results */}
            {fetchResult && (
              <div className="space-y-2">
                <h4 className="font-medium">Download Results</h4>
                <div className="text-sm">
                  <span className="font-medium">Status: </span>
                  <Badge variant={fetchResult.success ? "default" : "destructive"}>
                    {fetchResult.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Message: </span>
                  {fetchResult.message}
                </div>
                {fetchResult.groupsUpserted !== undefined && (
                  <div className="text-sm">
                    <span className="font-medium">Data: </span>
                    {fetchResult.groupsUpserted} groups, {fetchResult.productsUpserted} products
                  </div>
                )}
              </div>
            )}

            {/* Match Results */}
            {matchResult && (
              <div className="space-y-2">
                <h4 className="font-medium">Matching Results {matchResult.dryRun && '(Dry Run)'}</h4>
                <div className="text-sm">
                  <span className="font-medium">Status: </span>
                  <Badge variant={matchResult.success ? "default" : "destructive"}>
                    {matchResult.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Message: </span>
                  {matchResult.message}
                </div>
                
                {matchResult.groupMatching && (
                  <div className="text-sm">
                    <span className="font-medium">Groups: </span>
                    {matchResult.groupMatching.autoMatched} auto-matched, {matchResult.groupMatching.ambiguous?.length || 0} ambiguous
                  </div>
                )}
                
                {matchResult.productMatching && (
                  <div className="text-sm">
                    <span className="font-medium">Products: </span>
                    {matchResult.productMatching.totalMatched} matched ({matchResult.productMatching.numberMatches} by number, {matchResult.productMatching.nameMatches} by name)
                    {!matchResult.dryRun && `, ${matchResult.productMatching.updated} updated`}
                  </div>
                )}
                
                {matchResult.success && (
                  <details className="text-sm">
                    <summary className="font-medium cursor-pointer">Full Details</summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(matchResult, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Legacy Sync Results */}
            {syncResult && (
              <div className="space-y-2">
                <h4 className="font-medium">Legacy Sync Results</h4>
                <div className="text-sm">
                  <span className="font-medium">Status: </span>
                  <Badge variant={syncResult.success ? "default" : "destructive"}>
                    {syncResult.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Message: </span>
                  {syncResult.message}
                </div>
                {syncResult.details && (
                  <details className="text-sm">
                    <summary className="font-medium cursor-pointer">Details</summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(syncResult.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How the New TCGCSV Sync Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <h4 className="font-medium mb-2">3-Step Process:</h4>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>
                <strong>Download:</strong> Fetch all groups (sets) and products (cards) from TCGCSV and store them in staging tables
              </li>
              <li>
                <strong>Match:</strong> Automatically match TCGCSV groups to your sets and products to your cards using intelligent algorithms
              </li>
              <li>
                <strong>Legacy:</strong> Use the original image sync method (for backwards compatibility)
              </li>
            </ol>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">What gets synced:</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong>Product ID:</strong> TCG Player product identifier</li>
              <li><strong>Image URL:</strong> High-quality card image (prefers larger sizes)</li>
              <li><strong>Product URL:</strong> Direct link to TCG Player product page</li>
              <li><strong>Card Numbers:</strong> Parsed from product names for better matching</li>
            </ul>
          </div>
          
          <div className="text-muted-foreground">
            <strong>Tip:</strong> Always use "Dry run" first to preview matches before applying changes. 
            The matching algorithms prioritize card numbers over name similarity for accuracy.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}