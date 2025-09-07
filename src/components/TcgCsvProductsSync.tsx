import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Package, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const TcgCsvProductsSync = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [groupIds, setGroupIds] = useState<string>('');
  const [groupNameFilters, setGroupNameFilters] = useState<string>('');
  const [maxGroups, setMaxGroups] = useState<string>('');
  const [dryRun, setDryRun] = useState(false);
  const [lastSync, setLastSync] = useState<any>(null);

  const syncProducts = async () => {
    if (!categoryId || !Number.isInteger(Number(categoryId))) {
      toast({
        title: "Invalid Category ID",
        description: "Please enter a valid category ID (integer)",
        variant: "destructive",
      });
      return;
    }

    // Parse inputs
    let parsedGroupIds: number[] | undefined;
    let parsedGroupNameFilters: string[] | undefined;
    let parsedMaxGroups: number | undefined;

    if (groupIds.trim()) {
      try {
        parsedGroupIds = groupIds.split(',').map(id => Number(id.trim())).filter(id => Number.isInteger(id));
        if (parsedGroupIds.length === 0) {
          throw new Error('No valid group IDs');
        }
      } catch (error) {
        toast({
          title: "Invalid Group IDs",
          description: "Please enter comma-separated integers for group IDs",
          variant: "destructive",
        });
        return;
      }
    }

    if (groupNameFilters.trim()) {
      parsedGroupNameFilters = groupNameFilters.split(',').map(filter => filter.trim()).filter(f => f.length > 0);
      if (parsedGroupNameFilters.length === 0) {
        toast({
          title: "Invalid Group Name Filters",
          description: "Please enter comma-separated group name filters",
          variant: "destructive",
        });
        return;
      }
    }

    if (!parsedGroupIds && !parsedGroupNameFilters) {
      toast({
        title: "Missing Selection Criteria",
        description: "Please provide either group IDs or group name filters",
        variant: "destructive",
      });
      return;
    }

    if (maxGroups.trim()) {
      parsedMaxGroups = Number(maxGroups);
      if (!Number.isInteger(parsedMaxGroups) || parsedMaxGroups <= 0) {
        toast({
          title: "Invalid Max Groups",
          description: "Max groups must be a positive integer",
          variant: "destructive",
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-tcgcsv-products-selective', { 
        body: { 
          categoryId: Number(categoryId), 
          groupIds: parsedGroupIds,
          groupNameFilters: parsedGroupNameFilters,
          maxGroups: parsedMaxGroups,
          dryRun 
        } 
      });

      if (error) {
        toast({ 
          title: "Products sync failed", 
          description: error.message, 
          variant: "destructive" 
        });
        return;
      }

      const summary = data?.summary || {};
      const totalUpserted = summary.totalUpserted || 0;
      const groupsProcessed = data?.groupsProcessed || 0;

      if (totalUpserted === 0) {
        let description = data?.note || "No products were synced.";
        
        if (data?.error) {
          description = `Error: ${data.error}`;
        } else if (groupsProcessed === 0) {
          description = `No sets matched filters in category ${categoryId}.`;
        }
        
        toast({
          title: "No products synced",
          description,
          variant: "destructive",
        });
      } else {
        const dryRunText = dryRun ? ' (dry run)' : '';
        const emptyGroupsText = data?.emptyGroups?.length ? ` (${data.emptyGroups.length} sets were empty)` : '';
        toast({ 
          title: "Products synced successfully", 
          description: `Synced ${totalUpserted} products across ${groupsProcessed} sets${dryRunText}${emptyGroupsText}` 
        });
        setLastSync({
          categoryId: data.categoryId,
          groupsProcessed,
          totalUpserted,
          totalSkipped: summary.totalSkipped,
          dryRun,
          timestamp: new Date().toLocaleString()
        });
      }
      
    } catch (error: any) {
      console.error('Products sync error:', error);
      toast({
        title: "Sync Failed",
        description: error?.message || "Failed to sync products",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          TCGCSV Products Selective Sync
        </CardTitle>
        <CardDescription>
          Synchronize products from selected groups (sets) for a specific category
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category ID *</Label>
          <Input
            id="categoryId"
            type="number"
            placeholder="e.g., 3 for Pokemon"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="groupIds">Group IDs (comma-separated)</Label>
          <Input
            id="groupIds"
            placeholder="e.g., 3170, 3171, 3172"
            value={groupIds}
            onChange={(e) => setGroupIds(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="groupNameFilters">OR Group Name Filters (comma-separated)</Label>
          <Textarea
            id="groupNameFilters"
            placeholder="e.g., Silver Tempest, Obsidian Flames"
            value={groupNameFilters}
            onChange={(e) => setGroupNameFilters(e.target.value)}
            disabled={isLoading}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxGroups">Max Groups (optional limit)</Label>
          <Input
            id="maxGroups"
            type="number"
            placeholder="e.g., 10"
            value={maxGroups}
            onChange={(e) => setMaxGroups(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="dryRun" 
            checked={dryRun}
            onCheckedChange={(checked) => setDryRun(checked as boolean)}
            disabled={isLoading}
          />
          <Label htmlFor="dryRun">Dry run (preview only, don't save to database)</Label>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={syncProducts} 
            disabled={isLoading || !categoryId}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            {isLoading ? 'Syncing...' : 'Sync Products'}
          </Button>
          
          {lastSync && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Last sync: {lastSync.totalUpserted} products from {lastSync.groupsProcessed} sets ({lastSync.timestamp})
            </div>
          )}
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This will fetch products (no pricing) from selected groups. Provide either specific group IDs 
            or name filters to match against group names. Products will be processed with concurrency 
            limits and chunked database writes for optimal performance.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};