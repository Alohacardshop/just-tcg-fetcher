import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Database } from "lucide-react";

interface GameCardProps {
  game: {
    id: string;
    name: string;
    jt_game_id: string;
    cards_count?: number;
    sets_count?: number;
  };
  onViewSets: (gameId: string) => void;
}

export const GameCard = ({ game, onViewSets }: GameCardProps) => {
  return (
    <Card className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 group overflow-hidden shadow-card">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {game.name}
            </h3>
            <p className="text-sm text-muted-foreground font-mono">ID: {game.jt_game_id}</p>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
            {game.jt_game_id.toUpperCase()}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <div className="text-2xl font-bold text-accent">{(game.cards_count || 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Cards</div>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <div className="text-2xl font-bold text-rare">{game.sets_count || 0}</div>
            <div className="text-xs text-muted-foreground">Sets</div>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={() => onViewSets(game.jt_game_id)}
            className="flex-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20"
          >
            <Eye className="h-4 w-4 mr-2" />
            View Sets
          </Button>
          <Button variant="secondary" size="sm">
            <Database className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none"></div>
    </Card>
  );
};