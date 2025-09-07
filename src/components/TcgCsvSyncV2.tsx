import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { Search, RefreshCw, Download, Activity, Clock, ExternalLink } from 'lucide-react';
import { TcgCsvGuidedPanel } from './TcgCsvGuidedPanel';
import { SetMappingPanel } from './SetMappingPanel';
import { GroupSelector } from './GroupSelector';

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

export const TcgCsvSyncV2 = () => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOperationId, setSelectedOperationId] = useState<string>('');
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get recent operations for monitoring
  const { data: recentOperations = [] } = useQuery({
    queryKey: ['recent-operations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('operation_type', 'tcgcsv-fetch-v2')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000
  });

  // Get categories with counts
  const { data: categories = [], isLoading: categoriesLoading, refetch: refetchCategories } = useQuery({
    queryKey: ['tcgcsv-categories-with-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tcgcsv_categories')
        .select('*')
        .order('name');

      if (error) throw error;

      const categoriesWithCounts = await Promise.all(
        (data || []).map(async (category) => {
          const [groupsResult, productsResult] = await Promise.all([
            supabase
              .from('tcgcsv_groups')
              .select('group_id', { count: 'exact', head: true })
              .eq('tcgcsv_category_id', category.category_id),
            supabase
              .from('tcgcsv_products')
              .select('product_id', { count: 'exact', head: true })
              .eq('category_id', category.category_id)
          ]);

          return {
            ...category,
            groupsCount: groupsResult.count || 0,
            productsCount: productsResult.count || 0
          };
        })
      );

      return categoriesWithCounts;
    }
  });

  // Get groups for selected category
  const { data: groups = [] } = useQuery({
    queryKey: ['tcgcsv-groups', selectedCategoryId],
    queryFn: async () => {
      if (!selectedCategoryId) return [];
      
      const { data, error } = await supabase
        .from('tcgcsv_groups')
        .select('*')
        .eq('tcgcsv_category_id', selectedCategoryId)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCategoryId
  });

  // Fetch mutation
  const fetchMutation = useMutation({
    mutationFn: async ({ type, categoryIds, categoryId, groupId }: { 
      type: 'categories' | 'groups' | 'products';
      categoryIds?: string[];
      categoryId?: string;
      groupId?: string;
    }) => {
      const operationId = `fetch-${Date.now()}`;
      setFetchResult(null);

      const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
        body: { 
          type,
          categoryIds,
          categoryId,
          groupId,
          operationId
        }
      });

      if (error) throw error;
      return { data, operationId };
    },
    onSuccess: (result) => {
      setFetchResult({
        success: true,
        operationId: result.operationId,
        message: result.data.message
      });
      toast({
        title: "Fetch Completed",
        description: result.data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['tcgcsv-categories-with-counts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-operations'] });
    },
    onError: (error: any) => {
      setFetchResult({
        success: false,
        operationId: '',
        error: error.message
      });
      toast({
        title: "Fetch Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  });

  // Clear data mutation
  const clearDataMutation = useMutation({
    mutationFn: async () => {
      // Clear TCGCSV data manually
      const tablesToClear = ['tcgcsv_products', 'tcgcsv_groups', 'tcgcsv_categories'];
      
      for (const table of tablesToClear) {
        await supabase.from(table as any).delete().gte('id', '0');
      }
    },
    onSuccess: () => {
      toast({
        title: "Data Cleared",
        description: "All TCGCSV data has been removed from the database.",
      });
      queryClient.invalidateQueries({ queryKey: ['tcgcsv-categories-with-counts'] });
      setSelectedCategories([]);
      setSelectedCategoryId('');
    },
    onError: (error: any) => {
      toast({
        title: "Clear Failed",
        description: error.message || "Failed to clear data",
        variant: "destructive",
      });
    }
  });

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const handleFetchSelected = () => {
    if (selectedCategories.length === 0) {
      toast({
        title: "No Categories Selected",
        description: "Please select at least one category to fetch.",
        variant: "destructive",
      });
      return;
    }
    
    fetchMutation.mutate({ 
      type: 'categories', 
      categoryIds: selectedCategories 
    });
  };

  const handleFetchAll = () => {
    const allCategoryIds = categories.map(cat => cat.category_id);
    fetchMutation.mutate({ 
      type: 'categories', 
      categoryIds: allCategoryIds 
    });
  };

  const handleGroupFetch = (categoryId: string, groupId: string) => {
    fetchMutation.mutate({ 
      type: 'products', 
      categoryId,
      groupId 
    });
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
            Fetch trading card data from TCGCSV API for categories, groups, and products
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="categories" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="guided">Guided</TabsTrigger>
          <TabsTrigger value="set-mapping">Set Mapping</TabsTrigger>
          <TabsTrigger value="monitor">Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Categories</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchCategories()}
                    disabled={categoriesLoading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${categoriesLoading ? 'animate-spin' : ''}`} />
                    Refresh Categories
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchAll}
                    disabled={fetchMutation.isPending || categories.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Fetch All Data
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => clearDataMutation.mutate()}
                    disabled={clearDataMutation.isPending}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
              <CardDescription>
                Select categories to fetch their groups and products. {categories.length} categories available.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search categories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Badge variant="secondary">
                    {selectedCategories.length} selected
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    Select All ({filteredCategories.length})
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                  <Button 
                    onClick={handleFetchSelected}
                    disabled={selectedCategories.length === 0 || fetchMutation.isPending}
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Fetch Selected
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {filteredCategories.map((category) => (
                  <Card 
                    key={category.id} 
                    className={`cursor-pointer transition-colors ${
                      selectedCategories.includes(category.category_id)
                        ? 'bg-primary/5 border-primary'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleCategoryToggle(category.category_id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          checked={selectedCategories.includes(category.category_id)}
                          onChange={() => handleCategoryToggle(category.category_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm">{category.name}</h4>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{category.groupsCount} groups</span>
                            <span>{category.productsCount} products</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guided" className="space-y-6">
          <TcgCsvGuidedPanel 
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
          />
          
          {selectedCategoryId && (
            <GroupSelector
              selectedCategoryId={selectedCategoryId}
            />
          )}
        </TabsContent>

        <TabsContent value="set-mapping" className="space-y-6">
          <SetMappingPanel selectedGame={null} />
        </TabsContent>

        <TabsContent value="monitor" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Fetch Operations Monitor
              </CardTitle>
              <CardDescription>
                Monitor recent TCGCSV fetch operations and view their logs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Operation to Monitor</label>
                <Select value={selectedOperationId} onValueChange={setSelectedOperationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an operation..." />
                  </SelectTrigger>
                  <SelectContent>
                    {recentOperations.map((op) => (
                      <SelectItem key={op.id} value={op.operation_id}>
                        {op.operation_id} - {new Date(op.created_at).toLocaleDateString()} ({op.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOperationId && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://supabase.com/dashboard/project/ljywcyhnpzqgpowwrpre/functions/tcgcsv-fetch-v2/logs`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Edge Function Logs
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-medium">Recent Operations</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentOperations.map((op) => (
                    <div key={op.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <div className="font-medium text-sm">{op.operation_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(op.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={op.status === 'completed' ? 'default' : op.status === 'failed' ? 'destructive' : 'secondary'}>
                          {op.status}
                        </Badge>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {fetchResult && (
        <Card>
          <CardHeader>
            <CardTitle className={fetchResult.success ? "text-green-600" : "text-red-600"}>
              {fetchResult.success ? "Fetch Successful" : "Fetch Failed"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fetchResult.success ? (
              <div className="space-y-2">
                <p className="text-sm">{fetchResult.message}</p>
                <p className="text-xs text-muted-foreground">Operation ID: {fetchResult.operationId}</p>
              </div>
            ) : (
              <p className="text-sm text-red-600">{fetchResult.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};