import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, ArrowRight, Play, Pause } from 'lucide-react';
import { useGamesQuery, useSetsQuery, useSyncGameMutation, useSyncSetsMutation } from "@/hooks/useJustTCGQueries";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface GuidedSyncPanelProps {
  selectedGame: string;
  onGameSelect: (gameId: string) => void;
}

export const GuidedSyncPanel = ({ selectedGame, onGameSelect }: GuidedSyncPanelProps) => {
  const { data: games } = useGamesQuery();
  const { data: sets } = useSetsQuery(selectedGame);
  const syncGameMutation = useSyncGameMutation();
  const syncSetsMutation = useSyncSetsMutation();

  // Get sync stats for the selected game
  const { data: gameStats } = useQuery({
    queryKey: ['game-sync-stats', selectedGame],
    queryFn: async () => {
      if (!selectedGame) return null;
      
      const { data: setsData } = await supabase
        .from('sets')
        .select('id, cards_synced_count, total_cards, sync_status')
        .eq('game_id', selectedGame);
      
      const { data: cardsData } = await supabase
        .from('cards')
        .select('id')
        .eq('game_id', selectedGame);
      
      return {
        totalSets: setsData?.length || 0,
        syncedSets: setsData?.filter(s => s.sync_status === 'completed').length || 0,
        totalCards: cardsData?.length || 0,
        setsWithCards: setsData?.filter(s => s.cards_synced_count > 0).length || 0
      };
    },
    enabled: !!selectedGame,
  });

  const steps = [
    {
      id: 'select-game',
      title: 'Select Game',
      description: 'Choose a game to sync',
      completed: !!selectedGame,
      canStart: true,
      action: null
    },
    {
      id: 'sync-sets',
      title: 'Sync Sets',
      description: 'Pull all sets for the selected game',
      completed: gameStats ? gameStats.totalSets > 0 : false,
      canStart: !!selectedGame,
      action: () => syncSetsMutation.mutate({ gameId: selectedGame }),
      isLoading: syncSetsMutation.isPending
    },
    {
      id: 'sync-cards',
      title: 'Sync Cards',
      description: 'Pull cards for each set',
      completed: gameStats ? gameStats.setsWithCards === gameStats.totalSets && gameStats.totalSets > 0 : false,
      canStart: gameStats ? gameStats.totalSets > 0 : false,
      action: null // This will be handled per-set
    },
    {
      id: 'match-products',
      title: 'Match TCGCSV Products',
      description: 'Link cards with market pricing data',
      completed: false, // TODO: Add logic for this
      canStart: gameStats ? gameStats.totalCards > 0 : false,
      action: null
    }
  ];

  const getStepIcon = (step: typeof steps[0]) => {
    if (step.completed) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    if (step.isLoading) {
      return <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
    }
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  const selectedGameData = games?.find(g => g.id === selectedGame);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Guided Sync Workflow
        </CardTitle>
        <CardDescription>
          Follow these steps in order for optimal data synchronization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Game Selection */}
        <div className="space-y-2">
          <h4 className="font-medium">1. Select Target Game</h4>
          <div className="grid grid-cols-2 gap-2">
            {games?.slice(0, 6).map((game) => (
              <Button
                key={game.id}
                variant={selectedGame === game.id ? "default" : "outline"}
                size="sm"
                onClick={() => onGameSelect(game.id)}
                className="justify-start text-left h-auto p-2"
              >
                <div>
                  <div className="font-medium text-xs">{game.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {game.sets_count || 0} sets
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Progress Steps */}
        {selectedGame && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Sync Progress for {selectedGameData?.name}</h4>
              <Badge variant="outline">
                {gameStats ? `${gameStats.syncedSets}/${gameStats.totalSets}` : '0/0'} sets complete
              </Badge>
            </div>

            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  {getStepIcon(step)}
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{step.title}</span>
                      {step.completed && <Badge variant="default" className="text-xs">Complete</Badge>}
                      {!step.canStart && <Badge variant="secondary" className="text-xs">Blocked</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                    
                    {/* Progress for cards sync */}
                    {step.id === 'sync-cards' && gameStats && gameStats.totalSets > 0 && (
                      <div className="mt-2">
                        <Progress 
                          value={(gameStats.setsWithCards / gameStats.totalSets) * 100} 
                          className="h-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {gameStats.setsWithCards} of {gameStats.totalSets} sets have cards
                        </p>
                      </div>
                    )}
                  </div>

                  {step.action && step.canStart && !step.completed && (
                    <Button
                      size="sm"
                      onClick={step.action}
                      disabled={step.isLoading}
                      className="ml-auto"
                    >
                      {step.isLoading ? 'Running...' : 'Start'}
                    </Button>
                  )}

                  {index < steps.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground absolute right-[-12px] z-10" />
                  )}
                </div>
              ))}
            </div>

            {/* Sets breakdown */}
            {gameStats && gameStats.totalSets > 0 && (
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-blue-600">{gameStats.totalSets}</div>
                      <div className="text-xs text-muted-foreground">Total Sets</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-600">{gameStats.setsWithCards}</div>
                      <div className="text-xs text-muted-foreground">With Cards</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{gameStats.totalCards}</div>
                      <div className="text-xs text-muted-foreground">Total Cards</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!selectedGame && (
          <div className="text-center py-8 text-muted-foreground">
            <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Select a game above to begin guided sync</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};