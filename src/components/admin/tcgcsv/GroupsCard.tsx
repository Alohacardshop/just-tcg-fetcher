import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, Search, X, AlertCircle, Loader2, Package } from 'lucide-react';
import { useEdgeFn } from '@/hooks/useEdgeFn';
import { useCategories } from '@/hooks/useCategories';
import { useGroups } from '@/hooks/useGroups';
import { formatRelativeTime, pluralize, truncateText } from '@/lib/format';
import { toast } from '@/hooks/use-toast';

export const GroupsCard = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const { categories, loading: categoriesLoading } = useCategories();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroups(
    selectedCategoryId ? Number(selectedCategoryId) : undefined
  );
  const { data, loading: syncLoading, invoke } = useEdgeFn('sync-tcgcsv-groups');

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    
    const query = searchQuery.toLowerCase();
    return groups.filter(group => 
      group.name?.toLowerCase().includes(query) ||
      group.abbreviation?.toLowerCase().includes(query)
    );
  }, [groups, searchQuery]);

  const handleSyncGroups = async () => {
    if (!selectedCategoryId) {
      toast({
        title: "Category required",
        description: "Please select a category first",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await invoke({ 
        categoryId: Number(selectedCategoryId) 
      }, { suppressToast: true });
      
      const count = Number.isFinite(result?.groupsCount) ? result.groupsCount : 0;

      if (count === 0) {
        let description = result?.note ? 
          `No groups returned. ${result.note}` :
          "No groups returned for this category.";
        
        if (result?.error) {
          description = `Error: ${result.error}`;
          if (result?.hint?.code) {
            description += ` (${result.hint.code})`;
          }
        }
        
        toast({
          title: "No groups found",
          description,
          variant: "destructive",
        });
      } else {
        const skippedText = result?.skipped ? ` (${result.skipped} skipped)` : '';
        toast({ 
          title: "Groups synced successfully", 
          description: `Synced ${count} groups${skippedText}` 
        });
        
        // Refresh the groups list
        refetchGroups();
      }
    } catch (error) {
      // Error handling is done in useEdgeFn
    }
  };

  const clearSearch = () => setSearchQuery('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Groups / Sets
        </CardTitle>
        <CardDescription>
          Synchronize and manage groups (sets) by category
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-end gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="category">Category</Label>
            {categoriesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select 
                value={selectedCategoryId} 
                onValueChange={setSelectedCategoryId}
                disabled={syncLoading}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem 
                      key={category.tcgcsv_category_id} 
                      value={String(category.tcgcsv_category_id)}
                    >
                      {category.display_name || category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {categories.length === 0 && !categoriesLoading && (
              <p className="text-sm text-muted-foreground">
                No categories found. Run Categories sync first.
              </p>
            )}
          </div>
          
          <Button 
            onClick={handleSyncGroups} 
            disabled={syncLoading || !selectedCategoryId}
            className="flex items-center gap-2"
          >
            {syncLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            Sync Groups for Category
          </Button>
        </div>

        {/* Search */}
        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Status */}
        {data?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {truncateText(data.error)}
              {data.hint?.code && ` (${data.hint.code})`}
            </AlertDescription>
          </Alert>
        )}

        {/* Results Table */}
        {groupsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredGroups.length > 0 ? (
          <>
            <div className="text-sm text-muted-foreground">
              Showing {pluralize(filteredGroups.length, 'group')}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Abbreviation</TableHead>
                    <TableHead>Release Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow key={group.group_id}>
                      <TableCell className="font-mono text-sm">
                        {group.group_id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {group.name}
                      </TableCell>
                      <TableCell>
                        {group.abbreviation ? (
                          <Badge variant="outline">{group.abbreviation}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {group.release_date ? 
                          new Date(group.release_date).toLocaleDateString() : 
                          <span className="text-muted-foreground">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        {group.sealed_product && (
                          <Badge className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            Sealed
                          </Badge>
                        )}
                        {group.is_supplemental && (
                          <Badge variant="secondary">Supplemental</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(group.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : selectedCategoryId && !groupsLoading ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No groups found for this category.
              {!data && " Try syncing groups first."}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
};