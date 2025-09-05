import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CardData {
  id: string;
  name: string;
  jt_card_id: string;
  number?: string;
  rarity?: string;
  image_url?: string;
  data?: any;
}

interface CardDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CardData | null;
}

export const CardDataModal = ({ isOpen, onClose, card }: CardDataModalProps) => {
  const { toast } = useToast();

  const handleCopyData = () => {
    if (card?.data) {
      navigator.clipboard.writeText(JSON.stringify(card.data, null, 2));
      toast({
        title: "Copied",
        description: "Card JSON data copied to clipboard",
      });
    }
  };

  if (!card) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-gradient-card border-border">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-foreground">
              Card Data: {card.name}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Card Info */}
          <Card className="bg-background/50 border-border">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="outline">ID: {card.jt_card_id}</Badge>
                {card.number && <Badge variant="outline">#{card.number}</Badge>}
                {card.rarity && <Badge variant="secondary">{card.rarity}</Badge>}
              </div>
              
              {card.image_url && (
                <div className="flex justify-center">
                  <img 
                    src={card.image_url} 
                    alt={card.name}
                    className="max-w-48 max-h-64 object-contain rounded-lg border border-border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* JSON Data */}
          <Card className="bg-background/50 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-foreground">Raw JSON Data</h4>
                <Button variant="outline" size="sm" onClick={handleCopyData}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy JSON
                </Button>
              </div>
              
              <ScrollArea className="h-96 w-full">
                <pre className="text-xs text-muted-foreground font-mono bg-secondary/20 p-4 rounded-lg overflow-auto">
                  {JSON.stringify(card.data || {}, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};