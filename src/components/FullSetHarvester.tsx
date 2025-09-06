/**
 * Full Set Harvester Component
 * 
 * UI for triggering and monitoring complete set harvests
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  Package, 
  Download, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  Database
} from 'lucide-react';
import { fetchFullSetCards, syncSet, validateHarvestResult, type HarvestResult } from '@/lib/fullSetHarvester';
import { useToast } from '@/hooks/use-toast';

export function FullSetHarvester() {
  const [gameId, setGameId] = useState('');
  const [setId, setSetId] = useState('');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<HarvestResult | null>(null);
  const [validation, setValidation] = useState<any>(null);

  const { toast } = useToast();

  const handleHarvestOnly = async () => {
    if (!gameId.trim() || !setId.trim()) {
      toast({
        title: "Input Required",
        description: "Please provide both game ID and set ID",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setResult(null);
    setValidation(null);

    try {
      console.log(`🌾 Starting harvest: ${gameId}/${setId}`);
      
      const harvestResult = await fetchFullSetCards(gameId, setId, limit);
      const validationResult = validateHarvestResult(harvestResult);
      
      setResult(harvestResult);
      setValidation(validationResult);

      toast({
        title: "Harvest Complete",
        description: `Successfully harvested ${harvestResult.totalCards} cards with ${validationResult.stats.totalVariants} variants`,
      });

      if (!validationResult.isValid) {
        toast({
          title: "Validation Warnings",
          description: `${validationResult.warnings.length} warnings found - check results`,
          variant: "default"
        });
      }

    } catch (error) {
      console.error('Harvest failed:', error);
      toast({
        title: "Harvest Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSet = async () => {
    if (!gameId.trim() || !setId.trim()) {
      toast({
        title: "Input Required", 
        description: "Please provide both game ID and set ID",
        variant: "destructive"
      });
      return;
    }

    setSyncing(true);
    setResult(null);
    setValidation(null);

    try {
      console.log(`💾 Starting full set sync: ${gameId}/${setId}`);
      
      const syncResult = await syncSet(gameId, setId, limit);
      const validationResult = validateHarvestResult(syncResult);
      
      setResult(syncResult);
      setValidation(validationResult);

      toast({
        title: "Set Sync Complete",
        description: `Successfully synced ${syncResult.totalCards} cards to database`,
      });

      if (syncResult.dbStats) {
        toast({
          title: "Database Updated",
          description: `${syncResult.dbStats.stats.cardsUpserted} cards, ${syncResult.dbStats.stats.pricingRecordsUpserted} prices`,
        });
      }

    } catch (error) {
      console.error('Set sync failed:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Full Set Harvester
          </CardTitle>
          <CardDescription>
            Fetch all cards and variants for a complete set with automatic pagination.
            Handles large sets by processing multiple pages until all data is retrieved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Game ID</label>
              <Input
                placeholder="e.g. pokemon, mtg, yugioh"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Set ID</label>
              <Input
                placeholder="e.g. base-set, alpha, LOB"
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Page Size</label>
              <Input
                type="number"
                min={10}
                max={200}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={handleHarvestOnly}
              disabled={loading || syncing || !gameId.trim() || !setId.trim()}
              variant="outline"
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Harvesting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Harvest Only
                </>
              )}
            </Button>
            <Button 
              onClick={handleSyncSet}
              disabled={loading || syncing || !gameId.trim() || !setId.trim()}
              className="flex-1"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Harvest & Sync to DB
                </>
              )}
            </Button>
          </div>

          {/* Results Display */}
          {result && (
            <div className="space-y-4">
              <Separator />
              
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{result.totalCards}</div>
                  <div className="text-sm text-blue-800">Cards</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{result.totalPages}</div>
                  <div className="text-sm text-green-800">Pages</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {validation?.stats.totalVariants || 0}
                  </div>
                  <div className="text-sm text-purple-800">Variants</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {validation?.stats.avgVariantsPerCard || 0}
                  </div>
                  <div className="text-sm text-orange-800">Avg/Card</div>
                </div>
              </div>

              {/* Validation Status */}
              {validation && (
                <Alert className={validation.isValid ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
                  <div className="flex items-center gap-2">
                    {validation.isValid ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span className="font-medium">
                      {validation.isValid ? "Validation Passed" : `${validation.warnings.length} Warnings`}
                    </span>
                  </div>
                  {!validation.isValid && (
                    <AlertDescription className="mt-2">
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {validation.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  )}
                </Alert>
              )}

              {/* Detailed Stats */}
              {validation?.stats && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Detailed Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Cards with Multiple Variants:</span>
                        <span className="ml-2">{validation.stats.cardsWithMultipleVariants}</span>
                      </div>
                      <div>
                        <span className="font-medium">Distinct Printings:</span>
                        <span className="ml-2">{validation.stats.distinctPrintings}</span>
                      </div>
                      <div>
                        <span className="font-medium">Distinct Conditions:</span>
                        <span className="ml-2">{validation.stats.distinctConditions}</span>
                      </div>
                      <div>
                        <span className="font-medium">Harvested At:</span>
                        <span className="ml-2">{new Date(result.harvestedAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Expected vs Actual */}
                    {result.expectedTotal && (
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Progress</span>
                          <span className="text-sm text-muted-foreground">
                            {result.totalCards} / {result.expectedTotal}
                          </span>
                        </div>
                        <Progress 
                          value={(result.totalCards / result.expectedTotal) * 100} 
                          className="mt-2" 
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Sample Card Display */}
              {result.cards.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Sample Cards</CardTitle>
                    <CardDescription>
                      Showing first few cards with their variants
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {result.cards.slice(0, 3).map((card, index) => (
                        <div key={card.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{card.name}</h4>
                            <div className="flex gap-2">
                              {card.number && <Badge variant="outline">#{card.number}</Badge>}
                              <Badge variant="secondary">
                                {card.variants.length} variant{card.variants.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </div>
                          
                          {card.variants.length > 0 && (
                            <div className="text-sm">
                              <div className="font-medium mb-1">Variants:</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                {card.variants.slice(0, 4).map((variant, vIndex) => (
                                  <div key={vIndex} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                    <span>{variant.printing} - {variant.condition}</span>
                                    {variant.market_price && (
                                      <span className="font-medium text-green-600">
                                        ${variant.market_price.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {card.variants.length > 4 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  +{card.variants.length - 4} more variants
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}