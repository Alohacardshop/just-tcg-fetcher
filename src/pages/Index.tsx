import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { SearchFilters } from '@/components/SearchFilters';
import { DataImportPanel } from '@/components/DataImportPanel';
import { GameCard } from '@/components/GameCard';
import { SetCard } from '@/components/SetCard';
import { CardGrid } from '@/components/CardGrid';
import { TcgCsvSync } from '@/components/TcgCsvSync';
import { TcgCsvSyncV2 } from '@/components/TcgCsvSyncV2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, TrendingUp, Package, Users, DollarSign, Database, Search, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'games' | 'sets' | 'cards'>('dashboard');
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [games, setGames] = useState<any[]>([]);
  const [sets, setSets] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Controlled tab with localStorage persistence
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('index-active-tab') || 'overview';
    }
    return 'overview';
  });

  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadGames();
    }
  }, [user]);

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setGames(data || []);
    } catch (error) {
      console.error('Error loading games:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSets = async (gameId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sets')
        .select('*, games(name)')
        .eq('game_id', gameId)
        .order('name');
      
      if (error) throw error;
      setSets(data || []);
    } catch (error) {
      console.error('Error loading sets:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleViewSets = (gameId: string) => {
    const game = games.find(g => g.jt_game_id === gameId);
    setSelectedGame(game);
    loadSets(game.id);
    setCurrentView('sets');
    // Keep tab on games when navigating to sets view
    setActiveTab('games');
    localStorage.setItem('index-active-tab', 'games');
  };

  const handleViewCards = (setId: string) => {
    const set = sets.find(s => s.jt_set_id === setId);
    setSelectedSet(set);
    setCurrentView('cards');
  };

  const handleSearch = async (filters: any) => {
    console.log('Search filters:', filters);
    
    setSearchLoading(true);
    try {
      let query = supabase
        .from('cards')
        .select('*, sets(name, game_id), games(name)')
        .order('name');

      // Apply filters
      if (filters.query) {
        query = query.ilike('name', `%${filters.query}%`);
      }

      if (filters.game && filters.game !== 'all') {
        query = query.eq('games.jt_game_id', filters.game);
      }

      // Execute query
      const { data, error } = await query.limit(50);

      if (error) {
        console.error('Search error:', error);
        toast({
          title: "Search Error",
          description: "Failed to search cards. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error", 
        description: "An unexpected error occurred while searching.",
        variant: "destructive",
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setSelectedGame(null);
    setSelectedSet(null);
    setActiveTab('overview');
    localStorage.setItem('index-active-tab', 'overview');
  };

  const handleBackToGames = () => {
    setCurrentView('games');
    setSelectedSet(null);
    setActiveTab('games');
    localStorage.setItem('index-active-tab', 'games');
  };

  const renderBreadcrumb = () => {
    if (currentView === 'dashboard') return null;
    
    return (
      <div className="flex items-center gap-2 mb-6">
        <Button 
          variant="ghost" 
          onClick={handleBackToDashboard}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Dashboard
        </Button>
        {currentView === 'sets' && selectedGame && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">
              {selectedGame.name} Sets
            </span>
          </>
        )}
        {currentView === 'cards' && selectedGame && selectedSet && (
          <>
            <span className="text-muted-foreground">/</span>
            <Button 
              variant="ghost" 
              onClick={handleBackToGames}
              className="text-muted-foreground hover:text-foreground p-0 h-auto"
            >
              {selectedGame.name}
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">
              {selectedSet.name} Cards
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
        {renderBreadcrumb()}
        
        {currentView === 'dashboard' && (
          <Tabs value={activeTab} onValueChange={(value) => {
            if (value === 'games') {
              setCurrentView('games');
              setActiveTab('games');
              localStorage.setItem('index-active-tab', 'games');
            } else {
              setActiveTab(value);
              localStorage.setItem('index-active-tab', value);
            }
          }} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 bg-card border border-border">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="games" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Browse Games
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search Cards
              </TabsTrigger>
              <TabsTrigger value="tcgcsv" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                TCG CSV Sync
              </TabsTrigger>
              <TabsTrigger value="import" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Import Data
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gradient-card border-border shadow-card">
                  <div className="p-6 text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      {games.reduce((acc, game) => acc + (game.cards_count || 0), 0).toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">Total Cards Available</div>
                  </div>
                </Card>
                <Card className="bg-gradient-card border-border shadow-card">
                  <div className="p-6 text-center">
                    <div className="text-3xl font-bold text-accent mb-2">{games.length}</div>
                    <div className="text-muted-foreground">Supported Games</div>
                  </div>
                </Card>
                <Card className="bg-gradient-card border-border shadow-card">
                  <div className="p-6 text-center">
                    <div className="text-3xl font-bold text-rare mb-2">
                      {games.reduce((acc, game) => acc + (game.sets_count || 0), 0)}
                    </div>
                    <div className="text-muted-foreground">Total Sets</div>
                  </div>
                </Card>
              </div>
              
              <Card className="bg-gradient-card border-border shadow-card">
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => {
                        setCurrentView('games');
                        setActiveTab('games');
                        localStorage.setItem('index-active-tab', 'games');
                      }}
                      className="bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 justify-start"
                    >
                      <Database className="h-5 w-5 mr-2" />
                      Browse Games & Sets
                    </Button>
                    <Button 
                      className="bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground border border-accent/20 justify-start"
                    >
                      <Search className="h-5 w-5 mr-2" />
                      Search for Cards
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="search" className="space-y-6">
              <SearchFilters onSearch={handleSearch} games={games} />
              {searchResults.length > 0 || searchLoading ? (
                <CardGrid cards={searchResults} loading={searchLoading} />
              ) : (
                <Card className="bg-gradient-card border-border shadow-card">
                  <div className="p-8 text-center text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Enter search criteria above to find cards</p>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="tcgcsv" className="space-y-6">
              <TcgCsvSyncV2 />
              <TcgCsvSync />
            </TabsContent>

            <TabsContent value="import" className="space-y-6">
              <DataImportPanel />
            </TabsContent>
          </Tabs>
        )}

        {currentView === 'games' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Available Games</h2>
              <div className="text-sm text-muted-foreground">
                {games.length} games available
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onViewSets={handleViewSets}
                />
              ))}
            </div>
          </div>
        )}

        {currentView === 'sets' && selectedGame && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {selectedGame.name} Sets
              </h2>
              <div className="text-sm text-muted-foreground">
                {sets.length} sets available
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sets.map((set) => (
                <SetCard 
                  key={set.id} 
                  set={set} 
                  onViewCards={handleViewCards}
                />
              ))}
            </div>
          </div>
        )}

        {currentView === 'cards' && selectedSet && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {selectedSet.name} Cards
              </h2>
              <div className="text-sm text-muted-foreground">
                {selectedSet.cards_synced_count || 0} cards synced
              </div>
            </div>
            <SearchFilters onSearch={handleSearch} games={games} />
            {selectedSet.cards_synced_count > 0 ? (
              <CardGrid cards={searchResults} loading={searchLoading} />
            ) : (
              <Card className="bg-gradient-card border-border shadow-card">
                <div className="p-8 text-center text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Card data will be displayed here once synced from JustTCG</p>
                  <p className="text-sm mt-2">Use the Import Data tab to sync cards for this set</p>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;