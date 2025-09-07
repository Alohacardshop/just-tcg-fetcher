import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, CheckCircle, XCircle } from 'lucide-react';
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

export function TcgCsvSync() {
  const [selectedGameSlug, setSelectedGameSlug] = useState<string>('');
  const [dryRun, setDryRun] = useState(true);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
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

  // Sync mutation
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
      setSyncResult({ success: true, message: 'Sync completed successfully', details: data });
      toast.success('Sync completed successfully');
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
    onError: (error: any) => {
      setSyncResult({ success: false, message: error.message || 'Sync failed' });
      toast.error('Sync failed: ' + (error.message || 'Unknown error'));
    }
  });

  const handleSync = () => {
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
            <Download className="h-5 w-5" />
            TCG CSV Image Sync
          </CardTitle>
          <CardDescription>
            Manually sync card images and product URLs from tcgcsv.com for any game
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

          {/* Options */}
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
                Dry run (preview only, don't update database)
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
                Force update (sync cards that already have images)
              </label>
            </div>
          </div>

          {/* Sync Button */}
          <Button 
            onClick={handleSync}
            disabled={!selectedGameSlug || syncMutation.isPending}
            className="w-full"
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {dryRun ? 'Running Preview...' : 'Syncing Images...'}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {dryRun ? 'Preview Sync' : 'Start Sync'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {syncResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {syncResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Sync Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>This tool syncs card data from tcgcsv.com to get:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Product ID:</strong> TCG Player product identifier</li>
            <li><strong>Image URL:</strong> High-quality card image</li>
            <li><strong>Product URL:</strong> Link to TCG Player product page</li>
          </ul>
          <p className="text-muted-foreground mt-3">
            Use "Dry run" first to preview what will be synced without making changes.
            Then uncheck it to actually update the database.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}