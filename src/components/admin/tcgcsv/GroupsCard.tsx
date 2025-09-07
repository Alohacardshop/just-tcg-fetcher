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
import { Layers, Search, X, AlertCircle, Loader2, Package, User, UserX } from 'lucide-react';
// Removed useEdgeFn import - using invokeFn instead
import { useCategories } from '@/hooks/useCategories';
import { useGroups } from '@/hooks/useGroups';
import { formatRelativeTime, pluralize, truncateText } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { invokeFn, checkAuthStatus } from '@/lib/invokeFn';

type GroupsCsvResp = {
  success: boolean;
  categoryId: number;
  summary?: { fetched: number; upserted: number; skipped: number };
  groups?: any[];
  groupsCount?: number;
  error?: string | null;
  note?: string;
  hint?: { code: string; sample?: string; headers?: Record<string, string> } | null;
};

export const GroupsCard = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<any>(null);
  
  const { categories, loading: categoriesLoading } = useCategories();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroups(
    selectedCategoryId ? Number(selectedCategoryId) : undefined
  );

  // Check auth status on mount
  React.useEffect(() => {
    checkAuthStatus().then(setAuthStatus);
  }, []);

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

    setSyncLoading(true);
    let controller: AbortController | null = null;

    try {
      // Create timeout controller
      controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller?.abort();
      }, 20000); // 20s timeout

      const payload = { categoryId: Number(selectedCategoryId), dryRun: false };
      
      // Network logging
      console.log('Invoking function:', { 
        fn: 'sync-tcgcsv-groups-csv-fast',
        payload, 
        timestamp: new Date().toISOString() 
      });

      // Manual fetch with timeout to sync-tcgcsv-groups-csv-fast
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/sync-tcgcsv-groups-csv-fast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result: GroupsCsvResp = await response.json();
      setLastResponse(result);
      
      console.log('Function response:', { 
        fn: 'sync-tcgcsv-groups-csv-fast', 
        status: response.status, 
        success: result.success,
        result 
      });

      // Robust count calculation
      const count = Number.isFinite(result?.groupsCount) ? 
        result.groupsCount : 
        Number.isFinite(result?.summary?.upserted) ?
        result.summary.upserted :
        Array.isArray(result?.groups) ? result.groups.length : 0;

      if (!result?.success) {
        let description = `Error: ${result?.error || 'Unknown error'}`;
        if (result?.hint?.code) {
          description += ` (${result.hint.code})`;
        }
        if (result?.hint?.sample) {
          description += ` Sample: ${result.hint.sample.slice(0, 160)}`;
        }
        
        toast({
          title: "Sync failed",
          description,
          variant: "destructive",
        });
        return;
      }

      if (count === 0) {
        let description = "No rows in CSV — try again after daily update (20:00 UTC)";
        if (result?.note) {
          description = result.note;
        }
        
        toast({
          title: "No groups found",
          description,
          variant: "destructive",
        });
      } else {
        toast({ 
          title: "Groups synced successfully", 
          description: `Synced ${count} groups (CSV)` 
        });
        
        // Refresh the groups list
        refetchGroups();
      }

    } catch (error: any) {
      console.error('Groups sync error:', error);
      
      if (error.name === 'AbortError') {
        toast({
          title: "Request timeout",
          description: "Request timed out after 20s",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Network error",
          description: error.message || "Failed to sync groups",
          variant: "destructive",
        });
      }
    } finally {
      setSyncLoading(false);
      if (controller) {
        controller.abort();
      }
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
        {/* Auth Status Indicator */}
        <div className="flex items-center gap-2 text-sm mb-4">
          {authStatus?.isAuthenticated ? (
            <div className="flex items-center gap-1 text-green-600">
              <User className="h-3 w-3" />
              <span>Signed in as {authStatus.user?.email}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground">
              <UserX className="h-3 w-3" />
              <span>Using anonymous access</span>
            </div>
          )}
        </div>

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
            Sync Groups for Category (CSV)
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

        {/* Dev Debug Section */}
        {lastResponse && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRawResponse(!showRawResponse)}
              className="text-xs"
            >
              Show raw response
            </Button>
            {showRawResponse && (
              <div className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-40">
                <pre>{JSON.stringify(lastResponse, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

        {/* Status - removed since we handle errors inline now */}

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
              {!lastResponse && " Try syncing groups first."}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
};