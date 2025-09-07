import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Package, AlertCircle, Loader2, ChevronDown, ChevronRight, Zap, Activity, User, UserX } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { useGroups } from '@/hooks/useGroups';
import { formatNumber, pluralize } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { invokeFn, checkAuthStatus } from '@/lib/invokeFn';

interface BulkSyncResult {
  success: boolean;
  categoryId: number;
  groupsProcessed: number;
  groupIdsResolved: number[];
  summary: {
    fetched: number;
    upserted: number;
    skipped: number;
    rateRPS: number;
    rateUPS: number;
  };
  perGroup: Array<{
    groupId: number;
    groupName: string;
    fetched: number;
    upserted: number;
    skipped: number;
    bytes: number;
    ms: number;
    error?: string;
  }>;
  dryRun?: boolean;
  operationId?: string;
  error?: string;
}

export const ProductsBulkCard = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [includeSealed, setIncludeSealed] = useState(true);
  const [includeSingles, setIncludeSingles] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastResult, setLastResult] = useState<BulkSyncResult | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [sequentialMode, setSequentialMode] = useState(false);

  const { categories, loading: categoriesLoading } = useCategories();
  const { groups, loading: groupsLoading } = useGroups(
    selectedCategoryId ? Number(selectedCategoryId) : undefined
  );

  // Check auth status on mount
  React.useEffect(() => {
    checkAuthStatus().then(setAuthStatus);
  }, []);

  const canSubmit = useMemo(() => {
    return selectedCategoryId && (includeSealed || includeSingles);
  }, [selectedCategoryId, includeSealed, includeSingles]);

  const handleGroupSelection = useCallback((groupId: string, checked: boolean) => {
    setSelectedGroupIds(prev => 
      checked 
        ? [...prev, groupId]
        : prev.filter(id => id !== groupId)
    );
  }, []);

  const handleBulkSync = async (isDryRun: boolean = false) => {
    if (!canSubmit) {
      toast({
        title: "Invalid selection",
        description: "Please select a category and at least one product type",
        variant: "destructive",
      });
      return;
    }

    setSyncLoading(true);

    try {
      const basePayload: any = {
        categoryId: Number(selectedCategoryId),
        includeSealed,
        includeSingles,
        dryRun: isDryRun
      };

      if (selectedGroupIds.length > 0) {
        basePayload.groupIds = selectedGroupIds.map(id => Number(id));
      }

      if (sequentialMode) {
        // One-by-one: pageSize=1, iterate pages
        let page = 1;
        const pageSize = 1;
        let aggregate: BulkSyncResult | null = null;
        let totalFetched = 0, totalUpserted = 0, totalSkipped = 0;
        const perGroup: BulkSyncResult['perGroup'] = [];
        let groupsProcessed = 0;
        let totalGroups = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const payload = { ...basePayload, page, pageSize };
          console.log('Invoking bulk function (sequential):', { fn: 'sync-tcgcsv-products-csv-bulk', payload });
          const { data, error, status } = await invokeFn<BulkSyncResult>('sync-tcgcsv-products-csv-bulk', payload);

          if (status === 401 || error?.authError) {
            toast({ title: "Authentication required", description: "Your session has expired. Please sign in and try again.", variant: "destructive" });
            break;
          }
          if (!data?.success) {
            toast({ title: `Page ${page} failed`, description: data?.error || error?.message || 'Unknown error', variant: "destructive" });
            break;
          }

          // Merge results
          totalFetched += data.summary?.fetched || 0;
          totalUpserted += data.summary?.upserted || 0;
          totalSkipped += data.summary?.skipped || 0;
          groupsProcessed += data.groupsProcessed || 0;
          if ((data as any).pagination?.totalGroups) {
            totalGroups = (data as any).pagination.totalGroups;
          }
          if (Array.isArray(data.perGroup)) perGroup.push(...data.perGroup);

          aggregate = {
            success: true,
            categoryId: basePayload.categoryId,
            groupsProcessed,
            groupIdsResolved: perGroup.map(g => g.groupId),
            summary: {
              fetched: totalFetched,
              upserted: totalUpserted,
              skipped: totalSkipped,
              rateRPS: 0,
              rateUPS: 0,
            },
            perGroup,
            dryRun: isDryRun,
            operationId: data.operationId,
          };

          setLastResult(aggregate);

          const pagination = (data as any).pagination;
          if (!pagination?.hasMore || !pagination?.nextPage) break;
          page = pagination.nextPage;
        }

        if (aggregate) {
          const totalUp = aggregate.summary.upserted || 0;
          if (totalUp === 0) {
            toast({ title: "No products synced", description: totalGroups ? `Processed 0 of ${totalGroups} groups` : 'No data', variant: 'destructive' });
          } else {
            toast({ title: isDryRun ? 'Preview completed' : 'Sequential sync completed', description: `${formatNumber(totalUp)} products across ${groupsProcessed} sets (one-by-one)` });
          }
        }

        // Refresh auth status
        checkAuthStatus().then(setAuthStatus);
        return;
      }

      // Default: single call (page-based or full, as configured server-side)
      const { data, error, status } = await invokeFn<BulkSyncResult>('sync-tcgcsv-products-csv-bulk', basePayload);
      setLastResult(data || null);
      console.log('Bulk function response:', { fn: 'sync-tcgcsv-products-csv-bulk', status, success: data?.success, summary: data?.summary });

      if (status === 401 || error?.authError) {
        toast({ title: "Authentication required", description: "Your session has expired. Please sign in and try again.", variant: "destructive" });
        return;
      }
      if (!data?.success) {
        toast({ title: "Bulk sync failed", description: data?.error || error?.message || 'Unknown error occurred', variant: "destructive" });
        return;
      }

      const { summary } = data;
      const totalUpserted = summary?.upserted || 0;
      const groupsProcessed = data.groupsProcessed || 0;

      if (totalUpserted === 0) {
        let description = "No products processed — check category and filters";
        if (groupsProcessed === 0) {
          description = "No groups found for the specified criteria";
        }
        toast({ title: "No products synced", description, variant: "destructive" });
      } else {
        const dryRunText = isDryRun ? ' (Preview only)' : '';
        const rateText = summary.rateRPS ? ` • ${summary.rateRPS} rows/sec` : '';
        const upsertRateText = summary.rateUPS ? ` • ${summary.rateUPS} upserts/sec` : '';
        toast({ title: isDryRun ? "Preview completed" : "Bulk sync completed", description: `${formatNumber(totalUpserted)} products across ${groupsProcessed} sets (CSV)${dryRunText}${rateText}${upsertRateText}` });
      }

      // Refresh auth status
      checkAuthStatus().then(setAuthStatus);

    } catch (error: any) {
      console.error('Bulk sync error:', error);
      toast({ title: "Network error", description: error.message || "Failed to perform bulk sync", variant: "destructive" });
    } finally {
      setSyncLoading(false);
    }
  };

  const toggleGroupExpansion = (groupId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Products (Bulk CSV)
        </CardTitle>
        <CardDescription>
          High-throughput bulk sync of all products for a category with configurable concurrency
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auth Status Indicator */}
        <div className="flex items-center gap-2 text-sm">
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

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
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
        </div>

        {/* Group Multi-Select (Optional) */}
        {selectedCategoryId && (
          <div className="space-y-2">
            <Label>Group Selection (Optional - if empty, ALL groups will sync)</Label>
            {groupsLoading ? (
              <div className="text-sm text-muted-foreground">Loading groups...</div>
            ) : groups.length > 0 ? (
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                <div className="text-xs text-muted-foreground mb-2">
                  {groups.length} groups available • Leave unselected to sync ALL
                </div>
                {groups.map((group) => (
                  <div key={group.group_id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`group-${group.group_id}`}
                      checked={selectedGroupIds.includes(String(group.group_id))}
                      onCheckedChange={(checked) => 
                        handleGroupSelection(String(group.group_id), checked as boolean)
                      }
                      disabled={syncLoading}
                    />
                    <Label 
                      htmlFor={`group-${group.group_id}`}
                      className="flex-1 text-sm font-normal cursor-pointer"
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {group.group_id}
                      </span>
                      {group.name}
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No groups found for this category. Sync groups first.
                </AlertDescription>
              </Alert>
            )}
            {selectedGroupIds.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {pluralize(selectedGroupIds.length, 'group')} selected for sync
              </div>
            )}
          </div>
        )}

        {/* Product Type Filters */}
        <div className="space-y-3">
          <Label>Product Types</Label>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="includeSingles" 
                checked={includeSingles}
                onCheckedChange={(checked) => setIncludeSingles(checked as boolean)}
                disabled={syncLoading}
              />
              <Label htmlFor="includeSingles">Include Singles/Cards</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="includeSealed" 
                checked={includeSealed}
                onCheckedChange={(checked) => setIncludeSealed(checked as boolean)}
                disabled={syncLoading}
              />
              <Label htmlFor="includeSealed">Include Sealed Products</Label>
            </div>
          </div>
        </div>

        {/* Execution Mode */}
        <div className="space-y-2">
          <Label>Execution Mode</Label>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="sequentialMode" 
              checked={sequentialMode}
              onCheckedChange={(checked) => setSequentialMode(checked as boolean)}
              disabled={syncLoading}
            />
            <Label htmlFor="sequentialMode">Sequential (one group at a time)</Label>
          </div>
          <div className="text-xs text-muted-foreground">
            Safer for large categories. Uses server pagination (pageSize=1).
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => handleBulkSync(false)} 
            disabled={syncLoading || !canSubmit}
            className="flex items-center gap-2"
          >
            {syncLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Sync Products (Bulk CSV)
          </Button>
          
          <Button
            variant="secondary"
            onClick={() => handleBulkSync(true)}
            disabled={syncLoading || !canSubmit}
            className="flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            Preview
          </Button>

          {dryRun && (
            <Badge variant="outline" className="text-xs">
              Preview only — no DB writes
            </Badge>
          )}
        </div>

        {!canSubmit && selectedCategoryId && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please select at least one product type (Singles or Sealed) to continue.
            </AlertDescription>
          </Alert>
        )}

        {/* Live Progress (during sync) */}
        {syncLoading && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span>Bulk sync in progress...</span>
              <Badge variant="secondary">High Throughput</Badge>
            </div>
            <Progress value={undefined} className="w-full" />
            <div className="text-xs text-muted-foreground">
              {sequentialMode ? 'Sequential mode: processing one group per request' : 'Bulk mode: server-controlled concurrency and batching'}
            </div>
          </div>
        )}

        {/* Results Summary */}
        {lastResult && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Bulk Sync Results</h4>
              <div className="flex items-center gap-2">
                {lastResult.dryRun && (
                  <Badge variant="outline">Preview Mode</Badge>
                )}
                <Badge variant="secondary">
                  {lastResult.summary?.rateRPS || 0} rows/sec
                </Badge>
                <Badge variant="secondary">
                  {lastResult.summary?.rateUPS || 0} upserts/sec
                </Badge>
              </div>
            </div>

            {/* High-level metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Groups Processed</div>
                <div className="font-medium">{lastResult.groupsProcessed || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Products Fetched</div>
                <div className="font-medium">{formatNumber(lastResult.summary?.fetched || 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Products Upserted</div>
                <div className="font-medium">{formatNumber(lastResult.summary?.upserted || 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Skipped</div>
                <div className="font-medium">{formatNumber(lastResult.summary?.skipped || 0)}</div>
              </div>
            </div>

            {/* Per-group details */}
            {lastResult.perGroup && lastResult.perGroup.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Per-Group Performance</h5>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {lastResult.perGroup.map((group) => (
                    <Collapsible key={group.groupId}>
                      <div className="flex items-center justify-between p-2 bg-background rounded border">
                        <div className="flex items-center gap-2">
                          <CollapsibleTrigger 
                            onClick={() => toggleGroupExpansion(group.groupId)}
                            className="flex items-center gap-1 text-sm hover:text-primary"
                          >
                            {expandedGroups.has(group.groupId) ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            <span className="font-mono text-xs text-muted-foreground">
                              {group.groupId}
                            </span>
                            <span className="font-medium">{group.groupName}</span>
                          </CollapsibleTrigger>
                          {group.error && (
                            <Badge variant="destructive" className="text-xs">Error</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{formatNumber(group.fetched)} fetched</span>
                          <span>{formatNumber(group.upserted)} upserted</span>
                          {group.skipped > 0 && <span>{formatNumber(group.skipped)} skipped</span>}
                          <span>{group.ms}ms</span>
                        </div>
                      </div>
                      
                      <CollapsibleContent className="px-2">
                        <div className="text-xs text-muted-foreground mt-1 space-y-1">
                          <div>Performance: {Math.round(group.bytes / 1024)}KB in {group.ms}ms</div>
                          {group.error && (
                            <div className="text-destructive">Error: {group.error}</div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            )}

            {/* Overall error */}
            {lastResult.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {lastResult.error}
                </AlertDescription>
              </Alert>
            )}

            {/* Dev Debug */}
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
                  <pre>{JSON.stringify(lastResult, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};