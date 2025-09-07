import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Download, CheckCircle, AlertCircle, Loader2, User, UserX } from 'lucide-react';
import { invokeFn, checkAuthStatus } from '@/lib/invokeFn';
import { formatRelativeTime, pluralize, truncateText } from '@/lib/format';
import { toast } from '@/hooks/use-toast';

export const CategoriesCard = () => {
  const [loading, setLoading] = React.useState(false);
  const [lastRun, setLastRun] = React.useState<any>(null);
  const [authStatus, setAuthStatus] = React.useState<any>(null);

  // Check auth status on mount
  React.useEffect(() => {
    checkAuthStatus().then(setAuthStatus);
  }, []);

  const handleSync = async () => {
    setLoading(true);
    
    try {
      const { data, error, status } = await invokeFn<any>('sync-tcgcsv-categories-csv-fast', {});
      
      // Handle auth errors
      if (status === 401 || error?.authError) {
        toast({
          title: "Authentication required",
          description: "Your session has expired. Please sign in and try again.",
          variant: "destructive",
        });
        return;
      }
      
      if (!data?.success) {
        toast({
          title: "Sync failed",
          description: data?.error || error?.message || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      const count = data.summary?.upserted ?? 0;

      if (count === 0) {
        toast({
          title: "No categories found",
          description: "No categories in CSV — try again after daily update (20:00 UTC)",
          variant: "destructive",
        });
      } else {
        const skippedText = data.summary?.skipped ? ` (${data.summary.skipped} skipped)` : '';
        const rateText = data.summary?.rateRPS ? ` • ${data.summary.rateRPS} rows/sec` : '';
        toast({ 
          title: "Categories synced successfully", 
          description: `Synced ${count} categories (CSV)${skippedText}${rateText}` 
        });
      }

      setLastRun({
        timestamp: new Date(),
        count,
        skipped: data.summary?.skipped || 0,
        note: data.note,
        error: data.error
      });
      
      // Refresh auth status
      checkAuthStatus().then(setAuthStatus);
      
    } catch (error: any) {
      console.error('Categories sync error:', error);
      toast({
        title: "Network error",
        description: "Failed to sync categories. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

        {/* Status placeholder - errors now handled inline */}
      </CardContent>
    </Card>
  );
};