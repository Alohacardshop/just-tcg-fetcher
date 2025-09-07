import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TcgCsvSyncV2 } from '@/components/TcgCsvSyncV2';
import { DataImportPanel } from '@/components/DataImportPanel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Download, Database, Zap, Settings, Loader2, Eye, CheckCircle, AlertCircle, Link, ExternalLink } from 'lucide-react';

const DataManager = () => {
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedOperationId, setSelectedOperationId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [matchResultsLoading, setMatchResultsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch games
  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: async () => {
      const { data } = await supabase
        .from('games')
        .select('id, name')
        .order('name');
      return data || [];
    }
  });

  // Fetch match operations
  const { data: matchOperations = [] } = useQuery({
    queryKey: ['match-operations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_logs')
        .select('id, operation_id, status, created_at')
        .eq('operation_type', 'smart-match')
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    }
  });

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
      
      const { data } = await supabase.functions.invoke('tcgcsv-smart-match', {
        body: { 
          gameId: selectedGameId,
          operationId,
          dryRun: false
        }
      });
      
      toast({
        title: "Smart Match Completed",
        description: `Found ${data?.totalMatches || 0} matches.`,
      });
      
      setSelectedOperationId(operationId);
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

  const loadMatchResults = async () => {
    if (!selectedOperationId) return;
    
    setMatchResultsLoading(true);
    try {
      // For now, just show a placeholder
      setMatchResults([]);
    } catch (error) {
      console.error('Error loading match results:', error);
    } finally {
      setMatchResultsLoading(false);
    }
  };

  React.useEffect(() => {
    if (selectedOperationId) {
      loadMatchResults();
    }
  }, [selectedOperationId]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Data Manager</h1>
            <p className="text-muted-foreground">
              Manage TCGCSV data, JustTCG imports, card matching, and system administration
            </p>
          </div>
        </div>

        <Tabs defaultValue="tcgcsv" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tcgcsv" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              TCGCSV
            </TabsTrigger>
            <TabsTrigger value="justtcg" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              JustTCG
            </TabsTrigger>
            <TabsTrigger value="matching" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Matching
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tcgcsv" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  TCGCSV Data Management
                </CardTitle>
                <CardDescription>
                  Fetch and manage trading card data from TCGCSV API
                </CardDescription>
              </CardHeader>
            </Card>
            <TcgCsvSyncV2 />
          </TabsContent>

          <TabsContent value="justtcg" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  JustTCG Data Import
                </CardTitle>
                <CardDescription>
                  Import games, sets, and cards from JustTCG API
                </CardDescription>
              </CardHeader>
            </Card>
            <DataImportPanel />
          </TabsContent>

          <TabsContent value="matching" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Card Matching
                </CardTitle>
                <CardDescription>
                  Match cards with TCGCSV product data using AI-powered similarity analysis
                </CardDescription>
              </CardHeader>
            </Card>

            <Tabs defaultValue="smart-match" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="smart-match">Smart Match</TabsTrigger>
                <TabsTrigger value="browse-results">Browse Results</TabsTrigger>
              </TabsList>

              <TabsContent value="smart-match" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Run Smart Match</CardTitle>
                    <CardDescription>
                      Automatically match cards with TCGCSV products using name and number similarity
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
                    <CardTitle>Browse Match Results</CardTitle>
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
                            {matchResults.slice(0, 50).map((result, index) => (
                              <Card key={index} className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline">
                                        {(result.match_confidence * 100).toFixed(1)}% match
                                      </Badge>
                                      <Link className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-sm">
                                      <span className="font-medium">Card: {result.card_id}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Product: <span className="font-medium">{result.tcgcsv_product_id}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Method: {result.match_method}
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            ))}
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
          </TabsContent>

          <TabsContent value="admin" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Administration
                </CardTitle>
                <CardDescription>
                  Manage system settings, view logs, and perform administrative tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="font-semibold mb-2">Edge Function Logs</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      View detailed logs from edge functions
                    </p>
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/tcgcsv-fetch-v2/logs', '_blank')}
                        className="w-full"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        TCGCSV Fetch Logs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/tcgcsv-smart-match/logs', '_blank')}
                        className="w-full"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Smart Match Logs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/justtcg-sync/logs', '_blank')}
                        className="w-full"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        JustTCG Sync Logs
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold mb-2">Database Management</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Access database tools and management
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/editor', '_blank')}
                      className="w-full"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      SQL Editor
                    </Button>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold mb-2">Authentication</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Manage user authentication and settings
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/auth/users', '_blank')}
                      className="w-full"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      User Management
                    </Button>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold mb-2">Storage</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Manage file storage and buckets
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/storage/buckets', '_blank')}
                      className="w-full"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Storage Buckets
                    </Button>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default DataManager;