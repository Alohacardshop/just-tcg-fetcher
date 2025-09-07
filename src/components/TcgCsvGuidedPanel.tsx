import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { CheckCircle, Circle, Play, Layers3, Boxes, Package } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

interface TcgCsvGuidedPanelProps {
  selectedCategoryId: string; // TCGCSV category_id (e.g., magic, pokemon)
  onSelectCategory: (id: string) => void;
}

export const TcgCsvGuidedPanel = ({ selectedCategoryId, onSelectCategory }: TcgCsvGuidedPanelProps) => {
  // Load TCGCSV Categories (Magic, Pokémon, etc.)
  const { data: categories } = useQuery({
    queryKey: ['tcgcsv-categories-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tcgcsv_categories')
        .select('id, category_id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Stats for the selected category
  const { data: stats } = useQuery({
    queryKey: ['tcgcsv-stats', selectedCategoryId],
    queryFn: async () => {
      if (!selectedCategoryId) return null;

      console.log('Fetching stats for category:', selectedCategoryId);

      const { data: groups, error: groupsError } = await supabase
        .from('tcgcsv_groups')
        .select('group_id')
        .eq('tcgcsv_category_id', selectedCategoryId);

      if (groupsError) {
        console.error('Groups query error:', groupsError);
        throw groupsError;
      }

      console.log('Groups found:', groups?.length || 0);

      const { data: products, error: productsError } = await supabase
        .from('tcgcsv_products')
        .select('product_id')
        .eq('category_id', selectedCategoryId);

      if (productsError) {
        console.error('Products query error:', productsError);
        throw productsError;
      }

      console.log('Products found:', products?.length || 0);

      return {
        groupsCount: groups?.length || 0, // Sets
        productsCount: products?.length || 0, // Cards
      };
    },
    enabled: !!selectedCategoryId,
  });

  // Mutations for steps
  const fetchGroupsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategoryId) throw new Error('Select a category first');
      const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
        body: { fetchType: 'groups', categoryId: selectedCategoryId }
      });
      if (error) throw error;
      return data;
    },
  });

  const [productsProgress, setProductsProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const fetchProductsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategoryId) throw new Error('Select a category first');

      // Get groups for selected category
      const { data: groups, error: groupsError } = await supabase
        .from('tcgcsv_groups')
        .select('group_id')
        .eq('tcgcsv_category_id', selectedCategoryId);
      if (groupsError) throw groupsError;

      const list = groups || [];
      setProductsProgress({ done: 0, total: list.length });

      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const { error: productError } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
          body: { fetchType: 'products', categoryId: selectedCategoryId, groupId: g.group_id }
        });
        if (productError) throw productError as any;
        setProductsProgress({ done: i + 1, total: list.length });
      }

      return { success: true, message: `Fetched products for ${list.length} groups` };
    },
  });

  const steps = [
    {
      id: 'select-category',
      title: 'Select Category',
      description: 'Choose Magic, Pokémon, etc. (top-level game)',
      completed: !!selectedCategoryId,
      isLoading: false,
      canStart: true as boolean,
      action: null as any,
      icon: <Layers3 className="h-5 w-5" />,
    },
    {
      id: 'fetch-groups',
      title: 'Fetch Groups (Sets)',
      description: 'Pull all sets/expansions for the category',
      completed: stats ? stats.groupsCount > 0 : false,
      isLoading: fetchGroupsMutation.isPending,
      canStart: !!selectedCategoryId,
      action: () => fetchGroupsMutation.mutate(),
      icon: <Boxes className="h-5 w-5" />,
    },
    {
      id: 'fetch-products',
      title: 'Fetch Products (Cards)',
      description: 'Pull individual cards for each set',
      completed: stats ? stats.productsCount > 0 : false,
      isLoading: fetchProductsMutation.isPending,
      canStart: stats ? stats.groupsCount > 0 : false,
      action: () => fetchProductsMutation.mutate(),
      icon: <Package className="h-5 w-5" />,
    },
  ];

  const getStepIcon = (step: any) => {
    if (step.completed) return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (step.isLoading) return <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Guided Sync (TCGCSV)
        </CardTitle>
        <CardDescription>
          TCGCSV: Category (Pokémon) → Groups (Base Set, Jungle) → Products (Pikachu #25)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category Selection */}
        <div className="space-y-2">
          <h4 className="font-medium">1. Select Category</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categories?.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategoryId === cat.category_id ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelectCategory(cat.category_id)}
                className="justify-start text-left h-auto p-2"
              >
                <div>
                  <div className="font-medium text-xs">{cat.name}</div>
                  <div className="text-xs text-muted-foreground">{cat.category_id}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Steps */}
        {selectedCategoryId && (
          <div className="space-y-2">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border">
                {getStepIcon(step)}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{step.title}</span>
                    {step.completed && <Badge variant="default" className="text-xs">Complete</Badge>}
                    {!step.canStart && <Badge variant="secondary" className="text-xs">Blocked</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{step.description}</p>

                  {/* Progress for products fetch */}
                  {step.id === 'fetch-products' && fetchProductsMutation.isPending && (
                    <div className="mt-2">
                      <Progress 
                        value={productsProgress.total ? (productsProgress.done / productsProgress.total) * 100 : 0}
                        className="h-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {productsProgress.done} of {productsProgress.total} groups processed
                      </p>
                    </div>
                  )}
                </div>

                {step.action && step.canStart && !step.completed && (
                  <Button size="sm" onClick={step.action} disabled={step.isLoading} className="ml-auto">
                    {step.isLoading ? 'Running...' : 'Start'}
                  </Button>
                )}
              </div>
            ))}

            {/* Stats */}
            {stats && (
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-blue-600">{stats.groupsCount}</div>
                      <div className="text-xs text-muted-foreground">Groups</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{stats.productsCount}</div>
                      <div className="text-xs text-muted-foreground">Products</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!selectedCategoryId && (
          <div className="text-center py-8 text-muted-foreground">
            <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Select a category above to begin guided sync</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};