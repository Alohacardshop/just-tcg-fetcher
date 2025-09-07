import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useEdgeFn } from '@/hooks/useEdgeFn';
import { formatRelativeTime, pluralize, truncateText } from '@/lib/format';
import { toast } from '@/hooks/use-toast';

export const CategoriesCard = () => {
  const { data, loading, invoke } = useEdgeFn('sync-tcgcsv-categories-csv-fast');
  const [lastRun, setLastRun] = React.useState<any>(null);

  const handleSync = async () => {
    try {
      const result = await invoke({}, { suppressToast: true });
      
      const count = result?.summary?.upserted ?? 0;

      if (count === 0) {
        let description = "No categories in CSV — try again after daily update (20:00 UTC)";
        
        if (result?.error) {
          description = `Error: ${result.error}`;
          if (result?.hint?.code) {
            description += ` (${result.hint.code})`;
          }
        }
        
        toast({
          title: "No categories found",
          description,
          variant: "destructive",
        });
      } else {
        const skippedText = result?.summary?.skipped ? ` (${result.summary.skipped} skipped)` : '';
        toast({ 
          title: "Categories synced successfully", 
          description: `Synced ${count} categories (CSV)${skippedText}` 
        });
      }

      setLastRun({
        timestamp: new Date(),
        count,
        skipped: result?.summary?.skipped || 0,
        note: result?.note,
        error: result?.error
      });
    } catch (error) {
      // Error handling is done in useEdgeFn
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Categories (TCGCSV → TCGplayer)
        </CardTitle>
        <CardDescription>
          Fetch and normalize all game categories from TCGCSV
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            onClick={handleSync} 
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {loading ? 'Syncing...' : 'Fetch & Normalize Categories (CSV)'}
          </Button>
        </div>

        {/* Status Area */}
        {lastRun && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last run:</span>
              <span>{formatRelativeTime(lastRun.timestamp)}</span>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{pluralize(lastRun.count, 'category', 'categories')}</span>
              </div>
              
              {lastRun.skipped > 0 && (
                <Badge variant="secondary">{lastRun.skipped} skipped</Badge>
              )}
            </div>

            {lastRun.note && (
              <div className="text-sm text-muted-foreground">
                {truncateText(lastRun.note)}
              </div>
            )}

            {lastRun.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {truncateText(lastRun.error)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {data?.error && !lastRun && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {truncateText(data.error)}
              {data.hint?.code && ` (${data.hint.code})`}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};