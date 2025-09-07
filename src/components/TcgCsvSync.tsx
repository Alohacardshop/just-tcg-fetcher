import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const TcgCsvSync = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const syncCategories = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-tcgcsv-categories', {
        body: { background: false }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Synced ${data.categoriesCount} categories successfully`,
      });
      
      setLastSync(new Date().toLocaleString());
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync categories",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
      </CardContent>
    </Card>
  );
};