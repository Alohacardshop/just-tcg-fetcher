import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { useState } from 'react';
import { Download, Play } from 'lucide-react';

interface GroupSelectorProps {
  selectedCategoryId: string;
}

export const GroupSelector = ({ selectedCategoryId }: GroupSelectorProps) => {
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Fetch groups for the selected category
  const { data: groups } = useQuery({
    queryKey: ['tcgcsv-groups-for-selector', selectedCategoryId],
    queryFn: async () => {
      if (!selectedCategoryId) return [];
      
      const { data, error } = await supabase
        .from('tcgcsv_groups')
        .select('*')
        .eq('tcgcsv_category_id', selectedCategoryId)
        .order('name');
      
      console.log('Groups fetch result:', { data, error, selectedCategoryId });
      
      if (error) {
        console.error('Error fetching groups:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!selectedCategoryId,
  });

  // Fetch products for selected group
  const fetchProductsMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.functions.invoke('tcgcsv-fetch-v2', {
        body: { 
          fetchType: 'products', 
          categoryId: selectedCategoryId, 
          groupId: groupId 
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Products Fetched",
        description: `Successfully fetched products for the selected group`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fetch Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!selectedCategoryId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">Select a category first to see available groups</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Select Group & Fetch Products
        </CardTitle>
        <CardDescription>
          Choose a specific group (set) to fetch its products (cards)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups && groups.length > 0 ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Available Groups ({groups.length})</label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group/set..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.group_id} value={group.group_id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{group.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ID: {group.group_id}
                          {group.release_date && ` • ${new Date(group.release_date).getFullYear()}`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGroupId && (
              <Button
                onClick={() => fetchProductsMutation.mutate(selectedGroupId)}
                disabled={fetchProductsMutation.isPending}
                className="w-full flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {fetchProductsMutation.isPending ? 'Fetching Products...' : 'Fetch Products for Selected Group'}
              </Button>
            )}

            <div className="text-xs text-muted-foreground">
              <p>Groups available: {groups.length}</p>
              <p>Selected group: {selectedGroupId ? groups.find(g => g.group_id === selectedGroupId)?.name : 'None'}</p>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No groups found for this category. Try fetching groups first.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};