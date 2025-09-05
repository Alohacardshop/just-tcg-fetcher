import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Database, Play, Pause, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const DataImportPanel = () => {
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [filteredGames, setFilteredGames] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();

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

  // Fetch games on component mount
  useEffect(() => {
    fetchGames();
  }, []);

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
              <CardDescription>Select a game to sync its sets</CardDescription>
            </div>
            <Badge variant="outline">{filteredGames.length} games</Badge>
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
            <div className="space-y-3">
              {filteredGames.map((game) => (
                <div key={game.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-colors">
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{game.name}</h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>ID: {game.jt_game_id}</span>
                      <span>Sets: {game.sets_count || 0}</span>
                      <span>Cards: {game.cards_count || 0}</span>
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => handleSyncSets(game.jt_game_id)}
                    disabled={isImporting}
                    variant="outline"
                    size="sm"
                    className="ml-4"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Sync Sets
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Status */}
      {importProgress > 0 && (
        <Card className="bg-gradient-card border-border shadow-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              {importProgress === 100 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-accent" />
              )}
              <h3 className="text-lg font-semibold">
                {importProgress === 100 ? "Sync Complete" : "Sync in Progress"}
              </h3>
            </div>
            
            {importProgress < 100 && (
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
    </div>
  );
};