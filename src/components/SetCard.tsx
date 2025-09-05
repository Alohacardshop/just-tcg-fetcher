import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Download, ArrowRight } from "lucide-react";

interface SetCardProps {
  set: {
    id: string;
    name: string;
    jt_set_id: string;
    games?: { name: string };
    total_cards?: number;
  };
  onViewCards: (setId: string) => void;
}

export const SetCard = ({ set, onViewCards }: SetCardProps) => {
  const getGameColor = (setId: string) => {
    const colors = {
      'mtg': 'text-rare',
      'pokemon': 'text-accent',
      'yugioh': 'text-destructive',
      'lorcana': 'text-uncommon',
      'onepiece': 'text-legendary',
      'digimon': 'text-primary',
    };
    return colors['mtg' as keyof typeof colors] || 'text-common';
  };

  return (
    <Card className="bg-gradient-card border-border hover:border-accent/50 transition-all duration-300 group overflow-hidden shadow-card">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <h3 className="text-lg font-bold text-foreground group-hover:text-accent transition-colors leading-tight">
              {set.name}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`${getGameColor(set.jt_set_id)} border-current`}>
                {set.games?.name || 'Unknown Game'}
              </Badge>
            </div>
          </div>
          <Package className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="text-center p-3 bg-secondary/50 rounded-lg flex-1">
            <div className="text-xl font-bold text-accent">{(set.total_cards || 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Cards Available</div>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={() => onViewCards(set.jt_set_id)}
            className="flex-1 bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground border border-accent/20"
          >
            View Cards
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-legendary opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none"></div>
    </Card>
  );
};