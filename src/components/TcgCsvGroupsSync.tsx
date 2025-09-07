import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Layers, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const TcgCsvGroupsSync = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [dryRun, setDryRun] = useState(false);
  const [lastSync, setLastSync] = useState<any>(null);

  const syncGroups = async () => {
    if (!categoryId || !Number.isInteger(Number(categoryId))) {
      toast({
        title: "Invalid Category ID",
        description: "Please enter a valid category ID (integer)",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-tcgcsv-groups', { 
        body: { categoryId: Number(categoryId), dryRun } 
      });

      if (error) {
        toast({ 
          title: "Groups sync failed", 
          description: error.message, 
          variant: "destructive" 
        });
        return;
      }

      const count = Number.isFinite(data?.groupsCount) ? data.groupsCount : 0;

      if (count === 0) {
        let description = data?.note ? 
          `No groups returned. ${data.note}` :
          "No groups returned for this category.";
        
        if (data?.error) {
          description = `Error: ${data.error}`;
          if (data?.hint?.code) {
            description += ` (${data.hint.code})`;
          }
        }
        
        toast({
          title: "No groups found",
          description,
          variant: "destructive",
        });
      } else {
        const skippedText = data?.skipped ? ` (${data.skipped} skipped)` : '';
        const dryRunText = dryRun ? ' (dry run)' : '';
        toast({ 
          title: "Groups synced successfully", 
          description: `Synced ${count} groups${skippedText}${dryRunText}` 
        });
        setLastSync({
          categoryId: data.categoryId,
          count,
          skipped: data.skipped,
          dryRun,
          timestamp: new Date().toLocaleString()
        });
      }
      
    } catch (error: any) {
      console.error('Groups sync error:', error);
      toast({
        title: "Sync Failed",
        description: error?.message || "Failed to sync groups",
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
          <Layers className="h-5 w-5" />
          TCGCSV Groups Sync
        </CardTitle>
        <CardDescription>
          Synchronize game groups (sets) for a specific category from TCGCSV
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category ID</Label>
          <Input
            id="categoryId"
            type="number"
            placeholder="e.g., 3 for Pokemon"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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
            onClick={syncGroups} 
            disabled={isLoading || !categoryId}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            {isLoading ? 'Syncing...' : 'Sync Groups'}
          </Button>
          
          {lastSync && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Last sync: Category {lastSync.categoryId}, {lastSync.count} groups ({lastSync.timestamp})
            </div>
          )}
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This will fetch all groups (sets) for the specified category from TCGCSV. 
            Popular category IDs: Pokémon (3), Magic (1), Yu-Gi-Oh! (2).
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};