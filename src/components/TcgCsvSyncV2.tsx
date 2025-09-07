import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';

interface Game {
  id: string;
  name: string;
  jt_game_id: string;
}

interface Category {
  id: string;
  category_id: string;
  name: string;
}

interface Group {
  group_id: string;
  name: string;
  tcgcsv_category_id: string;
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
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [activeTab, setActiveTab] = useState('fetch');
  const [dryRun, setDryRun] = useState(true);
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

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

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['tcgcsv-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tcgcsv_categories')
        .select('id, category_id, name')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch groups for selected category
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['tcgcsv-groups', selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      
      const { data, error } = await supabase
        .from('tcgcsv_groups')
        .select('group_id, name, tcgcsv_category_id')
        .eq('tcgcsv_category_id', selectedCategory)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCategory,
  });

  // TCGCSV Fetch Mutation
  const fetchMutation = useMutation({
    mutationFn: async ({ fetchType, categoryId, groupId }: { fetchType: string; categoryId?: string; groupId?: string }) => {
      const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
        body: { fetchType, categoryId, groupId }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setFetchResult(data);
      // Refetch the relevant data
      if (data.success) {
        window.location.reload(); // Quick refresh to show new data
      }
      toast({
        title: "Fetch Successful",
        description: data.message,
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
    mutationFn: async ({ gameId, setId, dryRun }: { gameId: string; setId?: string; dryRun: boolean }) => {
      const { data, error } = await supabase.functions.invoke('tcgcsv-smart-match', {
        body: { gameId, setId, dryRun }
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

  const handleFetchCategories = () => {
    fetchMutation.mutate({ fetchType: 'categories' });
  };

  const handleFetchGroups = () => {
    if (!selectedCategory) {
      toast({
        title: "No Category Selected",
        description: "Please select a category first",
        variant: "destructive",
      });
      return;
    }
    fetchMutation.mutate({ fetchType: 'groups', categoryId: selectedCategory });
  };

  const handleFetchProducts = () => {
    if (!selectedCategory || !selectedGroup) {
      toast({
        title: "Missing Selection",
        description: "Please select both category and group",
        variant: "destructive",
      });
      return;
    }
    fetchMutation.mutate({ 
      fetchType: 'products', 
      categoryId: selectedCategory, 
      groupId: selectedGroup 
    });
  };

  const handleFetchAll = () => {
    fetchMutation.mutate({ fetchType: 'all' });
  };

  const handleSmartMatch = () => {
    if (!selectedGame) {
      toast({
        title: "No Game Selected",
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }
    matchMutation.mutate({ 
      gameId: selectedGame, 
      dryRun 
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>TCGCSV Integration V2</CardTitle>
          <CardDescription>
            Fetch TCGCSV data and intelligently match with JustTCG cards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="fetch">Fetch Data</TabsTrigger>
              <TabsTrigger value="match">Smart Match</TabsTrigger>
            </TabsList>
            
            <TabsContent value="fetch" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.category_id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Group (Set)</label>
                  <Select 
                    value={selectedGroup} 
                    onValueChange={setSelectedGroup}
                    disabled={!selectedCategory || groupsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups?.map((group) => (
                        <SelectItem key={group.group_id} value={group.group_id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button 
                  onClick={handleFetchCategories}
                  disabled={fetchMutation.isPending}
                  variant="outline"
                >
                  Fetch Categories
                </Button>
                
                <Button 
                  onClick={handleFetchGroups}
                  disabled={fetchMutation.isPending || !selectedCategory}
                  variant="outline"
                >
                  Fetch Groups
                </Button>
                
                <Button 
                  onClick={handleFetchProducts}
                  disabled={fetchMutation.isPending || !selectedCategory || !selectedGroup}
                  variant="outline"
                >
                  Fetch Products
                </Button>
                
                <Button 
                  onClick={handleFetchAll}
                  disabled={fetchMutation.isPending}
                >
                  Fetch All
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="match" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Game</label>
                  <Select value={selectedGame} onValueChange={setSelectedGame}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select game" />
                    </SelectTrigger>
                    <SelectContent>
                      {games?.map((game) => (
                        <SelectItem key={game.id} value={game.id}>
                          {game.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dryRun"
                    checked={dryRun}
                    onCheckedChange={(checked) => setDryRun(checked === true)}
                  />
                  <label htmlFor="dryRun" className="text-sm font-medium">
                    Dry run (preview matches only)
                  </label>
                </div>
                
                <Button 
                  onClick={handleSmartMatch}
                  disabled={matchMutation.isPending || !selectedGame}
                  className="w-full"
                >
                  {dryRun ? 'Preview Matches' : 'Execute Smart Match'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Data Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Current Data</CardTitle>
          <CardDescription>Overview of fetched TCGCSV data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">{categories?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Categories</div>
              {categoriesLoading && <div className="text-xs">Loading...</div>}
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">{groups?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Groups {selectedCategory ? `(${categories?.find(c => c.category_id === selectedCategory)?.name})` : ''}</div>
              {groupsLoading && <div className="text-xs">Loading...</div>}
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">-</div>
              <div className="text-sm text-muted-foreground">Products (select group)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories Preview */}
      {categories && categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Categories ({categories.length})</CardTitle>
            <CardDescription>Available game categories from TCGCSV</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {categories.map((category) => (
                <div 
                  key={category.id} 
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedCategory === category.category_id 
                      ? 'bg-primary/10 border-primary' 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedCategory(category.category_id)}
                >
                  <div className="font-medium text-sm">{category.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {category.category_id}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups Preview */}
      {groups && groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Groups ({groups.length})</CardTitle>
            <CardDescription>Available sets/groups for selected category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {groups.map((group) => (
                <div 
                  key={group.group_id} 
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedGroup === group.group_id 
                      ? 'bg-primary/10 border-primary' 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedGroup(group.group_id)}
                >
                  <div className="font-medium text-sm">{group.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {group.group_id}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {(fetchResult || matchResult) && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Operation Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetchResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={fetchResult.success ? "default" : "destructive"}>
                    Fetch {fetchResult.success ? "Success" : "Failed"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Operation ID: {fetchResult.operationId}
                  </span>
                </div>
                {fetchResult.message && (
                  <p className="text-sm">{fetchResult.message}</p>
                )}
                {fetchResult.error && (
                  <p className="text-sm text-destructive">{fetchResult.error}</p>
                )}
              </div>
            )}
            
            {matchResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={matchResult.success ? "default" : "destructive"}>
                    Match {matchResult.success ? "Success" : "Failed"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Operation ID: {matchResult.operationId}
                  </span>
                </div>
                
                {matchResult.stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>Total: {matchResult.stats.total}</div>
                    <div>Matched: {matchResult.stats.matched}</div>
                    <div>Skipped: {matchResult.stats.skipped}</div>
                    <div>Unmatched: {matchResult.stats.unmatched}</div>
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
      
      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>1. Fetch Data:</strong> Download categories, groups (sets), and products (cards) from TCGCSV</p>
          <p><strong>2. Smart Match:</strong> Intelligently match JustTCG cards with TCGCSV products using:</p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Exact number matching (highest priority)</li>
            <li>Name similarity matching with 80%+ confidence</li>
            <li>Set-aware matching for better accuracy</li>
          </ul>
          <p><strong>Tip:</strong> Use dry run first to preview matches before committing</p>
        </CardContent>
      </Card>
    </div>
  );
};