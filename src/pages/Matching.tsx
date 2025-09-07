import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, Eye, CheckCircle, AlertCircle, Link } from 'lucide-react';

const Matching = () => {
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedOperationId, setSelectedOperationId] = useState<string>('');
  const [games, setGames] = useState<any[]>([]);
  const [matchOperations, setMatchOperations] = useState<any[]>([]);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchResultsLoading, setMatchResultsLoading] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    loadGames();
    loadMatchOperations();
  }, []);

  React.useEffect(() => {
    if (selectedOperationId) {
      loadMatchResults();
    }
  }, [selectedOperationId]);

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setGames(data || []);
    } catch (error) {
      console.error('Error loading games:', error);
    }
  };

  const loadMatchOperations = async () => {
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('id, operation_id, status, created_at')
        .eq('operation_type', 'smart-match')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setMatchOperations(data || []);
    } catch (error) {
      console.error('Error loading match operations:', error);
    }
  };

  const loadMatchResults = async () => {
    if (!selectedOperationId) return;
    
    setMatchResultsLoading(true);
    try {
      const response = await fetch(`/api/match-results/${selectedOperationId}`);
      if (!response.ok) throw new Error('Failed to fetch match results');
      const data = await response.json();
      
      if (error) throw error;
      setMatchResults(data || []);
    } catch (error) {
      console.error('Error loading match results:', error);
    } finally {
      setMatchResultsLoading(false);
    }
  };

  const handleRunSmartMatch = async () => {
    if (!selectedGameId) {
      toast({
        title: "No Game Selected",
        description: "Please select a game before running smart match.",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const operationId = `match-${Date.now()}`;
      
      const { data, error } = await supabase.functions.invoke('tcgcsv-smart-match', {
        body: { 
          gameId: selectedGameId,
          operationId,
          dryRun: false
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Smart Match Completed",
        description: `Found ${data?.totalMatches || 0} matches. Check the Browse Results tab for details.`,
      });
      
      setSelectedOperationId(operationId);
      loadMatchOperations();
    } catch (error: any) {
      toast({
        title: "Smart Match Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Card Matching</h1>
            <p className="text-muted-foreground">
              Match cards with TCGCSV product data using AI-powered similarity analysis
            </p>
          </div>
        </div>

        <Tabs defaultValue="smart-match" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="smart-match" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Smart Match
            </TabsTrigger>
            <TabsTrigger value="browse-results" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Browse Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="smart-match" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Run Smart Match
                </CardTitle>
                <CardDescription>
                  Automatically match cards with TCGCSV products using name and number similarity analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Game</label>
                    <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a game..." />
                      </SelectTrigger>
                      <SelectContent>
                        {games.map((game) => (
                          <SelectItem key={game.id} value={game.id}>
                            {game.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Smart matching will analyze card names and numbers to find the best TCGCSV product matches.
                    This process may take several minutes for large datasets.
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleRunSmartMatch}
                  disabled={!selectedGameId || loading}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running Smart Match...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Run Smart Match
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="browse-results" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Browse Match Results
                </CardTitle>
                <CardDescription>
                  View detailed results from previous matching operations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Operation</label>
                  <Select value={selectedOperationId} onValueChange={setSelectedOperationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a matching operation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {matchOperations.map((op) => (
                        <SelectItem key={op.id} value={op.operation_id}>
                          {op.operation_id} - {new Date(op.created_at).toLocaleDateString()} ({op.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedOperationId && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Match Results</h3>
                      <Badge variant="secondary">
                        {matchResults.length} matches
                      </Badge>
                    </div>

                    {matchResultsLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : matchResults.length > 0 ? (
                      <div className="space-y-3">
                        {matchResults.slice(0, 50).map((result) => (
                          <Card key={result.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {(result.match_confidence * 100).toFixed(1)}% match
                                  </Badge>
                                  <Link className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="text-sm">
                                  <span className="font-medium">Card ID: {result.card_id}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Product ID: <span className="font-medium">{result.tcgcsv_product_id}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Method: {result.match_method}
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                        {matchResults.length > 50 && (
                          <Alert>
                            <AlertDescription>
                              Showing top 50 results. Total matches: {matchResults.length}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription>
                          No match results found for this operation.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Matching;