import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, CheckCircle, AlertCircle, Loader2, RefreshCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const TcgCsvSyncV2 = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = async () => {
    const { data, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('operation_type', 'tcgcsv_categories_sync')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) setLogs(data || []);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const syncCategories = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-tcgcsv-categories', { 
        body: {} 
      });

      if (error) {
        toast({ 
          title: "TCGCSV sync failed", 
          description: error.message, 
          variant: "destructive" 
        });
        return;
      }

      // Client-Side Adjustments - compute count safely
      const arr = Array.isArray(data?.categories) ? data.categories : [];
      const count = Number.isFinite(data?.categoriesCount) ? data.categoriesCount : arr.length;

      if (count === 0) {
        toast({
          title: "No categories returned",
          description: "No categories returned. Check TCGCSV response or network issues.",
          variant: "destructive",
        });
      } else {
        toast({ 
          title: "Categories synced successfully", 
          description: `Synced ${count} categories` 
        });
        setLastSync(new Date().toLocaleString());
      }
      
    } catch (error: any) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Failed",
        description: error?.message || "Failed to sync categories",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      loadLogs();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>TCGCSV Categories Sync</CardTitle>
          <CardDescription>Synchronize game categories from TCGCSV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={syncCategories} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isLoading ? 'Syncing...' : 'Sync Categories'}
            </Button>
            
            {lastSync && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Last sync: {lastSync}
              </div>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This will fetch all game categories from TCGCSV and store them in the database. 
              Categories are used to map games between JustTCG and TCGCSV systems.
            </AlertDescription>
          </Alert>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Latest Sync Logs</h3>
              <Button variant="secondary" size="sm" onClick={loadLogs} className="flex items-center gap-2">
                <RefreshCcw className="h-3 w-3" /> Refresh
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <ul className="divide-y">
                {logs.map((log) => (
                  <li key={log.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.status}</span>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground">{log.message}</div>
                    {log.details && (
                      <pre className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground/80">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
                {logs.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">No logs yet.</li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};