import React, { useState } from 'react';

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
import { 
  Download, 
  Database, 
  Zap, 
  Settings, 
  Loader2, 
  Eye, 
  CheckCircle, 
  AlertCircle, 
  Link, 
  ExternalLink,
  BarChart3,
  Shield,
  Server,
  Users,
  HardDrive,
  Activity,
  TrendingUp,
  Sparkles
} from 'lucide-react';

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
    <div className="container mx-auto p-8 space-y-8 animate-fade-in max-w-7xl">
      <div className="space-y-8">
        {/* Header Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-primary p-8 shadow-glow">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-white">Data Manager</h1>
              <p className="text-white/80 text-lg">
                Centralized hub for TCGCSV data, JustTCG imports, card matching, and system administration
              </p>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="tcgcsv" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 bg-card/50 backdrop-blur-sm border border-border/50 shadow-elegant p-2 rounded-xl">
            <TabsTrigger 
              value="tcgcsv" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:shadow-glow transition-all duration-300 hover-scale rounded-lg"
            >
              <Download className="h-4 w-4" />
              TCGCSV
            </TabsTrigger>
            <TabsTrigger 
              value="justtcg" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:shadow-glow transition-all duration-300 hover-scale rounded-lg"
            >
              <Database className="h-4 w-4" />
              JustTCG
            </TabsTrigger>
            <TabsTrigger 
              value="matching" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:shadow-glow transition-all duration-300 hover-scale rounded-lg"
            >
              <Zap className="h-4 w-4" />
              Matching
            </TabsTrigger>
            <TabsTrigger 
              value="admin" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:shadow-glow transition-all duration-300 hover-scale rounded-lg"
            >
              <Settings className="h-4 w-4" />
              Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tcgcsv" className="space-y-6 animate-fade-in">
            <Card className="bg-gradient-card border-border/50 shadow-elegant backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-primary shadow-glow">
                    <Download className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">TCGCSV Data Management</CardTitle>
                    <CardDescription className="text-base">
                      Fetch and manage trading card data from TCGCSV API with advanced filtering and categorization
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
            <div className="animate-scale-in">
              <TcgCsvSyncV2 />
            </div>
          </TabsContent>

          <TabsContent value="justtcg" className="space-y-6 animate-fade-in">
            <Card className="bg-gradient-card border-border/50 shadow-elegant backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-accent shadow-glow">
                    <Database className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">JustTCG Data Import</CardTitle>
                    <CardDescription className="text-base">
                      Import comprehensive game libraries, sets, and card collections from JustTCG API
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
            <div className="animate-scale-in">
              <DataImportPanel />
            </div>
          </TabsContent>

          <TabsContent value="matching" className="space-y-6 animate-fade-in">
            <Card className="bg-gradient-card border-border/50 shadow-elegant backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-rare shadow-glow">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">AI-Powered Card Matching</CardTitle>
                    <CardDescription className="text-base">
                      Intelligently match cards with TCGCSV product data using advanced similarity algorithms
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Tabs defaultValue="smart-match" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 bg-muted/30 backdrop-blur-sm rounded-lg">
                <TabsTrigger value="smart-match" className="rounded-md">Smart Match</TabsTrigger>
                <TabsTrigger value="browse-results" className="rounded-md">Browse Results</TabsTrigger>
              </TabsList>

              <TabsContent value="smart-match" className="space-y-6 animate-scale-in">
                <Card className="bg-gradient-card border-border/50 shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-rare" />
                      Run Smart Match
                    </CardTitle>
                    <CardDescription>
                      Automatically match cards with TCGCSV products using name and number similarity
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          Select Game
                        </label>
                        <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                          <SelectTrigger className="bg-background/50 border-border/50">
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

                    <Alert className="border-accent/20 bg-accent/5">
                      <AlertCircle className="h-4 w-4 text-accent" />
                      <AlertDescription className="text-accent-foreground">
                        Smart matching will analyze card names and numbers to find the best TCGCSV product matches.
                        This process may take several minutes for large datasets.
                      </AlertDescription>
                    </Alert>

                    <Button 
                      onClick={handleRunSmartMatch}
                      disabled={!selectedGameId || loading}
                      className="w-full bg-gradient-primary hover:shadow-glow transition-all duration-300 hover-scale"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Running Smart Match...
                        </>
                      ) : (
                        <>
                          <Zap className="h-5 w-5 mr-2" />
                          Run Smart Match
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="browse-results" className="space-y-6 animate-scale-in">
                <Card className="bg-gradient-card border-border/50 shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-primary" />
                      Browse Match Results
                    </CardTitle>
                    <CardDescription>
                      View detailed results from previous matching operations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Select Operation
                      </label>
                      <Select value={selectedOperationId} onValueChange={setSelectedOperationId}>
                        <SelectTrigger className="bg-background/50 border-border/50">
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
                      <div className="space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Match Results
                          </h3>
                          <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20">
                            {matchResults.length} matches
                          </Badge>
                        </div>

                        {matchResultsLoading ? (
                          <div className="flex items-center justify-center p-12">
                            <div className="text-center space-y-3">
                              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                              <p className="text-muted-foreground">Loading match results...</p>
                            </div>
                          </div>
                        ) : matchResults.length > 0 ? (
                          <div className="space-y-3">
                            {matchResults.slice(0, 50).map((result, index) => (
                              <Card key={index} className="p-4 bg-background/50 border-border/50 hover:shadow-card transition-all duration-200 hover-scale">
                                <div className="flex items-center justify-between">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="bg-success/10 text-success border-success/20">
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
                          <Alert className="border-muted/20 bg-muted/5">
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

          <TabsContent value="admin" className="space-y-6 animate-fade-in">
            <Card className="bg-gradient-card border-border/50 shadow-elegant backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-warning shadow-glow">
                    <Settings className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">System Administration</CardTitle>
                    <CardDescription className="text-base">
                      Monitor system health, manage logs, and access administrative tools
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 animate-scale-in">
              {/* Edge Function Logs */}
              <Card className="bg-gradient-card border-border/50 shadow-card hover:shadow-elegant transition-all duration-300 hover-scale">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-primary/20">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Edge Function Logs</h3>
                      <p className="text-sm text-muted-foreground">
                        Monitor and debug edge function executions
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/tcgcsv-fetch-v2/logs', '_blank')}
                    className="w-full hover:bg-primary/5 hover:border-primary/20 transition-all duration-200"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    TCGCSV Fetch Logs
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/tcgcsv-smart-match/logs', '_blank')}
                    className="w-full hover:bg-primary/5 hover:border-primary/20 transition-all duration-200"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Smart Match Logs
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/justtcg-sync/logs', '_blank')}
                    className="w-full hover:bg-primary/5 hover:border-primary/20 transition-all duration-200"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    JustTCG Sync Logs
                  </Button>
                </CardContent>
              </Card>

              {/* Database Management */}
              <Card className="bg-gradient-card border-border/50 shadow-card hover:shadow-elegant transition-all duration-300 hover-scale">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-accent/20">
                      <Server className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Database Management</h3>
                      <p className="text-sm text-muted-foreground">
                        Access database tools and management interface
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/editor', '_blank')}
                    className="w-full hover:bg-accent/5 hover:border-accent/20 transition-all duration-200"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    SQL Editor
                  </Button>
                </CardContent>
              </Card>

              {/* Authentication */}
              <Card className="bg-gradient-card border-border/50 shadow-card hover:shadow-elegant transition-all duration-300 hover-scale">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-rare/20">
                      <Shield className="h-5 w-5 text-rare" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Authentication</h3>
                      <p className="text-sm text-muted-foreground">
                        Manage user authentication and security settings
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/auth/users', '_blank')}
                    className="w-full hover:bg-rare/5 hover:border-rare/20 transition-all duration-200"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    User Management
                  </Button>
                </CardContent>
              </Card>

              {/* Storage */}
              <Card className="bg-gradient-card border-border/50 shadow-card hover:shadow-elegant transition-all duration-300 hover-scale">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-warning/20">
                      <HardDrive className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Storage Management</h3>
                      <p className="text-sm text-muted-foreground">
                        Manage file storage buckets and uploads
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/storage/buckets', '_blank')}
                    className="w-full hover:bg-warning/5 hover:border-warning/20 transition-all duration-200"
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    Storage Buckets
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DataManager;