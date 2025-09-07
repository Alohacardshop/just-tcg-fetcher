import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Package, AlertCircle, Loader2, ChevronDown, ChevronRight, Eye, Copy } from 'lucide-react';
import { useEdgeFn } from '@/hooks/useEdgeFn';
import { useCategories } from '@/hooks/useCategories';
import { useGroups } from '@/hooks/useGroups';
import { formatNumber, pluralize, truncateText } from '@/lib/format';
import { toast } from '@/hooks/use-toast';

export const ProductsSelectiveCard = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [groupNameFilters, setGroupNameFilters] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [maxGroups, setMaxGroups] = useState<string>('10');
  const [dryRun, setDryRun] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const { categories, loading: categoriesLoading } = useCategories();
  const { groups, loading: groupsLoading } = useGroups(
    selectedCategoryId ? Number(selectedCategoryId) : undefined
  );
  const { data: syncResult, loading: syncLoading, invoke } = useEdgeFn('sync-tcgcsv-products-selective');

  // Parse group name filters into chips
  const nameFilterChips = useMemo(() => {
    if (!groupNameFilters.trim()) return [];
    return groupNameFilters
      .split(',')
      .map(filter => filter.trim())
      .filter(filter => filter.length > 0);
  }, [groupNameFilters]);

  // Check if form is valid for submission
  const canSubmit = useMemo(() => {
    if (!selectedCategoryId) return false;
    return selectedGroupIds.length > 0 || nameFilterChips.length > 0;
  }, [selectedCategoryId, selectedGroupIds, nameFilterChips]);

  const handleGroupSelection = useCallback((groupId: string, checked: boolean) => {
    setSelectedGroupIds(prev => 
      checked 
        ? [...prev, groupId]
        : prev.filter(id => id !== groupId)
    );
  }, []);

  const handleSync = async (isDryRun: boolean = false) => {
    if (!canSubmit) {
      toast({
        title: "Invalid selection",
        description: "Please select a category and at least one group selection method",
        variant: "destructive",
      });
      return;
    }

    const body: any = {
      categoryId: Number(selectedCategoryId),
      dryRun: isDryRun
    };

    if (selectedGroupIds.length > 0) {
      body.groupIds = selectedGroupIds.map(id => Number(id));
    }

    if (nameFilterChips.length > 0) {
      body.groupNameFilters = nameFilterChips;
    }

    if (maxGroups.trim() && Number(maxGroups) > 0) {
      body.maxGroups = Number(maxGroups);
    }

    try {
      const result = await invoke(body, { suppressToast: true });
      
      const summary = result?.summary || {};
      const totalUpserted = summary.totalUpserted || 0;
      const groupsProcessed = result?.groupsProcessed || 0;

      if (totalUpserted === 0) {
        let description = result?.note || "No products were synced.";
        
        if (result?.error) {
          description = `Error: ${result.error}`;
        } else if (groupsProcessed === 0) {
          description = `No sets matched filters in category ${selectedCategoryId}.`;
        }
        
        toast({
          title: "No products synced",
          description,
          variant: "destructive",
        });
      } else {
        const dryRunText = isDryRun ? ' (preview only)' : '';
        const emptyGroupsText = result?.emptyGroups?.length ? 
          ` (${result.emptyGroups.length} sets were empty)` : '';
        
        toast({ 
          title: isDryRun ? "Preview completed" : "Products synced successfully", 
          description: `${formatNumber(totalUpserted)} products across ${groupsProcessed} sets${dryRunText}${emptyGroupsText}` 
        });
      }
    } catch (error) {
      // Error handling is done in useEdgeFn
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

  const copyGroupIds = (groupId: number, groupName: string) => {
    navigator.clipboard.writeText(`${groupId}, ${groupName}`);
    toast({
      title: "Copied to clipboard",
      description: `Group ID and name copied`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Selective Products Sync (No Pricing)
        </CardTitle>
        <CardDescription>
          Synchronize products from selected groups with flexible filtering options
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        <Separator />

        {/* Group Name Filters */}
        <div className="space-y-2">
          <Label htmlFor="nameFilters">Group Name Filters (comma-separated)</Label>
          <Textarea
            id="nameFilters"
            placeholder="e.g., Silver Tempest, Obsidian Flames, Lost Origin"
            value={groupNameFilters}
            onChange={(e) => setGroupNameFilters(e.target.value)}
            disabled={syncLoading}
            rows={3}
          />
          {nameFilterChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nameFilterChips.map((filter, index) => (
                <Badge key={index} variant="secondary">
                  {filter}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Group Multi-Select */}
        {selectedCategoryId && (
          <div className="space-y-2">
            <Label>Multi-select by Group</Label>
            {groupsLoading ? (
              <div className="text-sm text-muted-foreground">Loading groups...</div>
            ) : groups.length > 0 ? (
              <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
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
                {pluralize(selectedGroupIds.length, 'group')} selected
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* Advanced Options */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxGroups">Max Groups (optional)</Label>
            <Input
              id="maxGroups"
              type="number"
              placeholder="e.g., 10"
              value={maxGroups}
              onChange={(e) => setMaxGroups(e.target.value)}
              disabled={syncLoading}
            />
          </div>
          
          <div className="flex items-center space-x-2 pt-8">
            <Checkbox 
              id="dryRun" 
              checked={dryRun}
              onCheckedChange={(checked) => setDryRun(checked as boolean)}
              disabled={syncLoading}
            />
            <Label htmlFor="dryRun">Dry run (preview only)</Label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => handleSync(false)} 
            disabled={syncLoading || !canSubmit}
            className="flex items-center gap-2"
          >
            {syncLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            Sync Selected Products
          </Button>
          
          <Button
            variant="secondary"
            onClick={() => handleSync(true)}
            disabled={syncLoading || !canSubmit}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
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
              Please provide either group name filters or select specific groups to continue.
            </AlertDescription>
          </Alert>
        )}

        {/* Results Summary */}
        {syncResult && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Sync Results</h4>
              {syncResult.dryRun && (
                <Badge variant="outline">Preview Mode</Badge>
              )}
            </div>

            {/* High-level summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Groups Processed</div>
                <div className="font-medium">{syncResult.groupsProcessed || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Products Fetched</div>
                <div className="font-medium">{formatNumber(syncResult.summary?.totalProductsFetched || 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Products Upserted</div>
                <div className="font-medium">{formatNumber(syncResult.summary?.totalUpserted || 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Skipped</div>
                <div className="font-medium">{formatNumber(syncResult.summary?.totalSkipped || 0)}</div>
              </div>
            </div>

            {/* Per-group details */}
            {syncResult.summary?.perGroup && syncResult.summary.perGroup.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Per-Group Details</h5>
                <div className="space-y-1">
                  {syncResult.summary.perGroup.map((group: any) => (
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
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{group.fetched} fetched</span>
                          <span>{group.upserted} upserted</span>
                          {group.skipped > 0 && <span>{group.skipped} skipped</span>}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyGroupIds(group.groupId, group.groupName)}
                            className="h-6 w-6 p-0"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <CollapsibleContent className="px-2">
                        <div className="text-xs text-muted-foreground mt-1">
                          Group ID: {group.groupId} • Name: {group.groupName}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            )}

            {/* Empty groups */}
            {syncResult.emptyGroups && syncResult.emptyGroups.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {pluralize(syncResult.emptyGroups.length, 'group')} returned no products: {' '}
                  {syncResult.emptyGroups.map((g: any) => g.groupName).join(', ')}
                </AlertDescription>
              </Alert>
            )}

            {/* Overall error */}
            {syncResult.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {truncateText(syncResult.error)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};