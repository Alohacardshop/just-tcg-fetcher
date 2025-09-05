import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/Header";
import { GameCard } from "@/components/GameCard";
import { SetCard } from "@/components/SetCard";
import { SearchFilters } from "@/components/SearchFilters";
import { DataImportPanel } from "@/components/DataImportPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Database, Search, Download } from "lucide-react";

const Index = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'games' | 'sets' | 'cards'>('dashboard');
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedSet, setSelectedSet] = useState<string>('');

  // Mock data - will be replaced with real API calls via Supabase
  const mockGames = [
    { id: '1', name: 'Magic: The Gathering', game_id: 'mtg', cards_count: 45000, sets_count: 120 },
    { id: '2', name: 'Pokémon', game_id: 'pokemon', cards_count: 32000, sets_count: 85 },
    { id: '3', name: 'Yu-Gi-Oh!', game_id: 'yugioh', cards_count: 28000, sets_count: 90 },
    { id: '4', name: 'Disney Lorcana', game_id: 'lorcana', cards_count: 2500, sets_count: 8 },
    { id: '5', name: 'One Piece TCG', game_id: 'onepiece', cards_count: 1200, sets_count: 12 },
    { id: '6', name: 'Digimon', game_id: 'digimon', cards_count: 3200, sets_count: 15 }
  ];

  const mockSets = [
    { id: '1', name: 'Wilds of Eldraine', game_id: 'mtg', game: 'Magic: The Gathering', cards_count: 280 },
    { id: '2', name: 'The Lost Caverns of Ixalan', game_id: 'mtg', game: 'Magic: The Gathering', cards_count: 290 },
    { id: '3', name: 'Base Set', game_id: 'pokemon', game: 'Pokémon', cards_count: 102 },
    { id: '4', name: 'Paldea Evolved', game_id: 'pokemon', game: 'Pokémon', cards_count: 193 },
  ];

  const handleViewSets = (gameId: string) => {
    setSelectedGame(gameId);
    setCurrentView('sets');
  };

  const handleViewCards = (setId: string) => {
    setSelectedSet(setId);
    setCurrentView('cards');
  };

  const handleSearch = (filters: any) => {
    console.log('Search filters:', filters);
    // Will implement actual search via Supabase
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setSelectedGame('');
    setSelectedSet('');
  };

  const handleBackToGames = () => {
    setCurrentView('games');
    setSelectedSet('');
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
        {currentView === 'sets' && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">
              {mockGames.find(g => g.game_id === selectedGame)?.name} Sets
            </span>
          </>
        )}
        {currentView === 'cards' && (
          <>
            <span className="text-muted-foreground">/</span>
            <Button 
              variant="ghost" 
              onClick={handleBackToGames}
              className="text-muted-foreground hover:text-foreground p-0 h-auto"
            >
              {mockGames.find(g => g.game_id === selectedGame)?.name}
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">
              {mockSets.find(s => s.id === selectedSet)?.name} Cards
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
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 bg-card border border-border">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="games" className="flex items-center gap-2" onClick={() => setCurrentView('games')}>
                <Search className="h-4 w-4" />
                Browse Games
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search Cards
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
                      {mockGames.reduce((acc, game) => acc + game.cards_count, 0).toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">Total Cards Available</div>
                  </div>
                </Card>
                <Card className="bg-gradient-card border-border shadow-card">
                  <div className="p-6 text-center">
                    <div className="text-3xl font-bold text-accent mb-2">{mockGames.length}</div>
                    <div className="text-muted-foreground">Supported Games</div>
                  </div>
                </Card>
                <Card className="bg-gradient-card border-border shadow-card">
                  <div className="p-6 text-center">
                    <div className="text-3xl font-bold text-rare mb-2">
                      {mockGames.reduce((acc, game) => acc + game.sets_count, 0)}
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
                      onClick={() => setCurrentView('games')}
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
              <SearchFilters onSearch={handleSearch} games={mockGames} />
              <Card className="bg-gradient-card border-border shadow-card">
                <div className="p-8 text-center text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter search criteria above to find cards</p>
                </div>
              </Card>
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
                {mockGames.length} games available
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mockGames.map((game) => (
                <GameCard 
                  key={game.id} 
                  game={game} 
                  onViewSets={handleViewSets}
                />
              ))}
            </div>
          </div>
        )}

        {currentView === 'sets' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {mockGames.find(g => g.game_id === selectedGame)?.name} Sets
              </h2>
              <div className="text-sm text-muted-foreground">
                {mockSets.filter(s => s.game_id === selectedGame).length} sets available
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mockSets
                .filter(set => set.game_id === selectedGame)
                .map((set) => (
                  <SetCard 
                    key={set.id} 
                    set={set} 
                    onViewCards={handleViewCards}
                  />
                ))}
            </div>
          </div>
        )}

        {currentView === 'cards' && (
          <div className="space-y-6">
            <SearchFilters onSearch={handleSearch} games={mockGames} />
            <Card className="bg-gradient-card border-border shadow-card">
              <div className="p-8 text-center text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Card data will be displayed here once Supabase is connected</p>
                <p className="text-sm mt-2">Connect to Supabase to enable real-time card data fetching</p>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
