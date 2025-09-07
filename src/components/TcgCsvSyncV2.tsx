import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { useSyncLogs } from "@/hooks/useSyncStatus";
import { Search, RefreshCw, Download, Zap, Activity, Clock, Route } from 'lucide-react';
import { TcgCsvGuidedPanel } from './TcgCsvGuidedPanel';
import { SetMappingPanel } from './SetMappingPanel';

interface Game {
  id: string;
  name: string;
  jt_game_id: string;
}

interface Category {
  id: string;
  category_id: string;
  name: string;
  data: any;
  groupsCount: number;
  productsCount: number;
}

interface Group {
  group_id: string;
  name: string;
  tcgcsv_category_id: string;
  release_date: string;
}

interface FetchResult {
  success: boolean;
  operationId: string;
  message?: string;
  error?: string;
}

interface MatchResult {
  success: boolean;
  operationId: string;
  matches?: any[];
  stats?: {
    total: number;
    matched: number;
    skipped: number;
    unmatched: number;
  };
  error?: string;
}

export const TcgCsvSyncV2 = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [currentOperationId, setCurrentOperationId] = useState<string>('');

  // Get sync logs for current operation
  const { data: syncLogs } = useSyncLogs(currentOperationId);

  // Fetch games
  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['games'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select('id, name, jt_game_id')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch categories with stats
  const { data: categories, isLoading: categoriesLoading, refetch: refetchCategories } = useQuery({
    queryKey: ['tcgcsv-categories-with-stats'],
    queryFn: async () => {
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('tcgcsv_categories')
        .select('id, category_id, name, data')
        .order('name');
      
      if (categoriesError) throw categoriesError;

      // Get groups count for each category
      const { data: groupsData, error: groupsError } = await supabase
        .from('tcgcsv_groups')
        .select('tcgcsv_category_id');
        
      if (groupsError) throw groupsError;

      // Get products count for each category  
      const { data: productsData, error: productsError } = await supabase
        .from('tcgcsv_products')
        .select('category_id');
        
      if (productsError) throw productsError;

      // Count groups and products per category
      const groupCounts = groupsData?.reduce((acc, group) => {
        acc[group.tcgcsv_category_id] = (acc[group.tcgcsv_category_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const productCounts = productsData?.reduce((acc, product) => {
        acc[product.category_id] = (acc[product.category_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Combine data with stats
      return categoriesData?.map(category => ({
        ...category,
        groupsCount: groupCounts[category.category_id] || 0,
        productsCount: productCounts[category.category_id] || 0
      })) || [];
    },
  });

  // Fetch groups for selected categories
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['tcgcsv-groups', selectedCategories],
    queryFn: async () => {
      if (selectedCategories.length === 0) return [];
      
      const { data, error } = await supabase
        .from('tcgcsv_groups')
        .select('group_id, name, tcgcsv_category_id, release_date')
        .in('tcgcsv_category_id', selectedCategories)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: selectedCategories.length > 0,
  });

  // TCGCSV Fetch Mutation
  const fetchMutation = useMutation({
    mutationFn: async ({ fetchType, categoryIds }: { fetchType: string; categoryIds?: string[] }) => {
      if (fetchType === 'categories') {
        const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
          body: { fetchType: 'categories' }
        });
        if (error) throw error;
        setCurrentOperationId(data.operationId);
        return data;
      }
      
      if (fetchType === 'selected' && categoryIds && categoryIds.length > 0) {
        // Fetch groups and products for selected categories
        const results = [];
        for (const categoryId of categoryIds) {
          // Fetch groups for this category
          const { data: groupData, error: groupError } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
            body: { fetchType: 'groups', categoryId }
          });
          if (groupError) throw groupError;
          results.push(groupData);
          
          // Get groups to fetch products
          const { data: groups } = await supabase
            .from('tcgcsv_groups')
            .select('group_id')
            .eq('tcgcsv_category_id', categoryId);
          
          // Fetch products for each group
          for (const group of groups || []) {
            const { data: productData, error: productError } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
              body: { fetchType: 'products', categoryId, groupId: group.group_id }
            });
            if (productError) throw productError;
            results.push(productData);
          }
        }
        return { success: true, message: `Fetched data for ${categoryIds.length} categories`, operationId: `batch-${Date.now()}` };
      }
      
      if (fetchType === 'all') {
        const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
          body: { fetchType: 'all' }
        });
        if (error) throw error;
        return data;
      }
      
      throw new Error('Invalid fetch type');
    },
    onSuccess: (data) => {
      setFetchResult(data);
      // Refetch all data to update stats
      queryClient.invalidateQueries({ queryKey: ['tcgcsv-categories-with-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tcgcsv-groups'] });
      toast({
        title: "Fetch Successful",
        description: data.message || 'Data fetched successfully',
      });
    },
    onError: (error: any) => {
      setFetchResult({ success: false, operationId: '', error: error.message });
      toast({
        title: "Fetch Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Smart Match Mutation
  const matchMutation = useMutation({
    mutationFn: async ({ gameId, dryRun }: { gameId: string; dryRun: boolean }) => {
      const { data, error } = await supabase.functions.invoke('tcgcsv-smart-match', {
        body: { gameId, dryRun }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setMatchResult(data);
      toast({
        title: "Matching Complete",
        description: dryRun 
          ? `Dry run: Found ${data.stats?.matched || 0} potential matches`
          : `Matched ${data.stats?.matched || 0} cards successfully`,
      });
    },
    onError: (error: any) => {
      setMatchResult({ success: false, operationId: '', error: error.message });
      toast({
        title: "Matching Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter categories based on search
  const filteredCategories = categories?.filter(cat => 
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleSelectAll = () => {
    setSelectedCategories(filteredCategories.map(cat => cat.category_id));
  };

  const handleDeselectAll = () => {
    setSelectedCategories([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            TCGCSV Data Fetcher
          </CardTitle>
          <CardDescription>
            Fetch and sync trading card data from TCGCSV with intelligent matching
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Button 
              onClick={() => {
                refetchCategories();
                fetchMutation.mutate({ fetchType: 'categories' });
              }}
              disabled={fetchMutation.isPending || categoriesLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${(fetchMutation.isPending || categoriesLoading) ? 'animate-spin' : ''}`} />
              Refresh Categories
            </Button>
            
            <Button 
              onClick={() => fetchMutation.mutate({ fetchType: 'all' })}
              disabled={fetchMutation.isPending}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Fetch All Data
            </Button>
          </div>

          <Tabs defaultValue="workflow" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="workflow">Guided Workflow</TabsTrigger>
              <TabsTrigger value="categories">Categories ({categories?.length || 0})</TabsTrigger>
              <TabsTrigger value="mapping">Set Mapping</TabsTrigger>
              <TabsTrigger value="match">Smart Match</TabsTrigger>
              <TabsTrigger value="monitor">Monitor</TabsTrigger>
            </TabsList>
            
            <TabsContent value="workflow" className="space-y-4">
              <TcgCsvGuidedPanel 
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
              />
            </TabsContent>

            <TabsContent value="mapping" className="space-y-4">
              <SetMappingPanel selectedGame={selectedGame} />
            </TabsContent>
            
            <TabsContent value="categories" className="space-y-4">
              {/* Search and Controls */}
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search categories..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    Select All ({filteredCategories.length})
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                    Clear ({selectedCategories.length})
                  </Button>
                </div>
              </div>

              {/* Data Overview */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Card className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {categories?.filter(c => c.groupsCount > 0 && c.productsCount > 0).length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Complete Categories</div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {categories?.filter(c => c.groupsCount > 0 || c.productsCount > 0).length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">With Some Data</div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {categories?.reduce((sum, c) => sum + c.productsCount, 0) || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Products</div>
                  </div>
                </Card>
              </div>

              {/* Selected Categories Actions */}
              {selectedCategories.length > 0 && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{selectedCategories.length} categories selected</p>
                        <p className="text-sm text-muted-foreground">
                          This will fetch groups and products for the selected categories
                        </p>
                      </div>
                      <Button
                        onClick={() => fetchMutation.mutate({ 
                          fetchType: 'selected', 
                          categoryIds: selectedCategories 
                        })}
                        disabled={fetchMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Fetch Selected Data
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Categories Grid */}
              {categoriesLoading ? (
                <div className="text-center py-8">Loading categories...</div>
              ) : filteredCategories.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">
                      {categories?.length === 0 ? 'No categories found. Click "Refresh Categories" to fetch data.' : 'No categories match your search.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCategories.map((category) => {
                    const hasData = category.groupsCount > 0 || category.productsCount > 0;
                    const isComplete = category.groupsCount > 0 && category.productsCount > 0;
                    
                    return (
                      <Card 
                        key={category.id} 
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          selectedCategories.includes(category.category_id) 
                            ? 'bg-primary/10 border-primary shadow-md' 
                            : 'hover:bg-muted/50'
                        } ${isComplete ? 'border-green-200 bg-green-50/50' : hasData ? 'border-yellow-200 bg-yellow-50/50' : ''}`}
                        onClick={() => handleCategoryToggle(category.category_id)}
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium text-sm leading-tight">{category.name}</h3>
                                {isComplete && <Badge variant="default" className="text-xs bg-green-600">✓</Badge>}
                                {hasData && !isComplete && <Badge variant="secondary" className="text-xs bg-yellow-600">Partial</Badge>}
                                {!hasData && <Badge variant="outline" className="text-xs">No Data</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">ID: {category.category_id}</p>
                              
                      {/* Stats */}
                      <div className="flex gap-3 mt-2 text-xs">
                        <div className={`flex items-center gap-1 ${category.groupsCount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          <span className="w-2 h-2 rounded-full bg-current"></span>
                          {category.groupsCount} sets
                        </div>
                        <div className={`flex items-center gap-1 ${category.productsCount > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                          <span className="w-2 h-2 rounded-full bg-current"></span>
                          {category.productsCount} cards
                        </div>
                      </div>
                      
                      {/* Last updated info from sync logs */}
                      {syncLogs && syncLogs.some(log => 
                        log.details && 
                        typeof log.details === 'object' && 
                        'categoryId' in log.details && 
                        log.details.categoryId === category.category_id
                      ) && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Recently synced
                        </div>
                      )}
                              
                              {category.data && typeof category.data === 'object' && 'popularity' in category.data && (
                                <Badge variant="secondary" className="mt-2 text-xs">
                                  Popularity: {(category.data as any).popularity}
                                </Badge>
                              )}
                            </div>
                            <Checkbox
                              checked={selectedCategories.includes(category.category_id)}
                              onChange={() => {}}
                              className="ml-2"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Groups for Selected Categories */}
              {selectedCategories.length > 0 && groups && groups.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Available Groups ({groups.length})</CardTitle>
                    <CardDescription>
                      Sets/Groups available for selected categories
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                      {groups.map((group) => (
                        <div 
                          key={group.group_id} 
                          className="p-3 border rounded-lg bg-muted/30"
                        >
                          <div className="font-medium text-sm">{group.name}</div>
                          <div className="text-xs text-muted-foreground">
                            ID: {group.group_id}
                            {group.release_date && (
                              <span className="block">Released: {group.release_date}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="monitor" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Sync Monitoring
                  </CardTitle>
                  <CardDescription>
                    Monitor data fetching progress and sync logs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Recent Sync Logs */}
                  {currentOperationId && syncLogs && syncLogs.length > 0 ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Recent Sync Logs ({currentOperationId.slice(-8)})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 max-h-60 overflow-y-auto">
                        {syncLogs.slice(0, 20).map((log, idx) => (
                          <div key={idx} className="text-xs p-2 bg-muted/50 rounded">
                            <div className="flex justify-between items-start">
                              <Badge variant={log.status === 'success' ? 'default' : log.status === 'warning' ? 'secondary' : 'destructive'} className="text-xs">
                                {log.status}
                              </Badge>
                              <span className="text-muted-foreground">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-muted-foreground mt-1">{log.message}</p>
                            {log.duration_ms && (
                              <span className="text-xs text-muted-foreground">
                                Duration: {log.duration_ms}ms
                              </span>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No active sync operations. Start a fetch to see progress here.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="match" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Smart Matching
                  </CardTitle>
                  <CardDescription>
                    Match JustTCG cards with TCGCSV products using AI-powered algorithms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Game</label>
                    <select 
                      value={selectedGame} 
                      onChange={(e) => setSelectedGame(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      disabled={gamesLoading}
                    >
                      <option value="">Select a game...</option>
                      {games?.map((game) => (
                        <option key={game.id} value={game.id}>
                          {game.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="dryRun"
                      checked={dryRun}
                      onCheckedChange={(checked) => setDryRun(checked === true)}
                    />
                    <label htmlFor="dryRun" className="text-sm font-medium">
                      Dry run (preview matches only, don't save)
                    </label>
                  </div>
                  
                  <Button 
                    onClick={() => matchMutation.mutate({ gameId: selectedGame, dryRun })}
                    disabled={matchMutation.isPending || !selectedGame}
                    className="w-full flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    {dryRun ? 'Preview Smart Matches' : 'Execute Smart Matching'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Results */}
      {(fetchResult || matchResult) && (
        <Card>
          <CardHeader>
            <CardTitle>Operation Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetchResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={fetchResult.success ? "default" : "destructive"}>
                    {fetchResult.success ? "✓ Success" : "✗ Failed"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {fetchResult.operationId}
                  </span>
                </div>
                <p className="text-sm">
                  {fetchResult.message || fetchResult.error}
                </p>
              </div>
            )}
            
            {matchResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={matchResult.success ? "default" : "destructive"}>
                    {matchResult.success ? "✓ Matching Complete" : "✗ Matching Failed"}
                  </Badge>
                </div>
                
                {matchResult.stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                    <div><strong>Total:</strong> {matchResult.stats.total}</div>
                    <div><strong>Matched:</strong> {matchResult.stats.matched}</div>
                    <div><strong>Skipped:</strong> {matchResult.stats.skipped}</div>
                    <div><strong>Unmatched:</strong> {matchResult.stats.unmatched}</div>
                  </div>
                )}
                
                {matchResult.error && (
                  <p className="text-sm text-destructive">{matchResult.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};