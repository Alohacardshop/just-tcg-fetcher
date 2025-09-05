import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Database, Play, Pause, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const DataImportPanel = () => {
  const [apiKey, setApiKey] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState('');

  const { toast } = useToast();

  const handleSyncGames = async () => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-games' }
      });

      if (error) throw error;

      setImportProgress(100);
      toast({
        title: "Games Synced",
        description: `Successfully synced ${data.synced} games from JustTCG`,
      });
    } catch (error) {
      console.error('Error syncing games:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync games",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncSets = async (gameId: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-sets', gameId }
      });

      if (error) throw error;

      setImportProgress(100);
      toast({
        title: "Sets Synced",
        description: `Successfully synced ${data.synced} sets from JustTCG`,
      });
    } catch (error) {
      console.error('Error syncing sets:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync sets",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncCards = async (setId: string) => {
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('justtcg-sync', {
        body: { action: 'sync-cards', setId }
      });

      if (error) throw error;

      setImportProgress(100);
      toast({
        title: "Cards Synced",
        description: `Successfully synced ${data.synced} cards and ${data.pricesSynced} prices from JustTCG`,
      });
    } catch (error) {
      console.error('Error syncing cards:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync cards",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const importMethods = [
    {
      title: "Sync Games",
      description: "Sync all games from JustTCG API",
      icon: <Database className="h-4 w-4" />,
      action: handleSyncGames
    },
    {
      title: "Sync Game Sets",
      description: "Sync sets for a specific game (enter game ID below)",
      icon: <Download className="h-4 w-4" />,
      action: () => {
        const gameId = prompt("Enter JustTCG Game ID:");
        if (gameId) handleSyncSets(gameId);
      }
    },
    {
      title: "Sync Set Cards",
      description: "Sync cards and prices for a specific set (enter set ID below)",
      icon: <Upload className="h-4 w-4" />,
      action: () => {
        const setId = prompt("Enter JustTCG Set ID:");
        if (setId) handleSyncCards(setId);
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* API Status */}
      <Card className="bg-gradient-card border-border shadow-card">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">JustTCG API Status</h3>
            <Badge variant="default" className="ml-auto">
              Configured
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-green-500">API key configured in Supabase Edge Functions</span>
          </div>
        </div>
      </Card>

      {/* Import Methods */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {importMethods.map((method) => (
          <Card key={method.title} className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 group shadow-card">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                {method.icon}
                <div className="space-y-2 flex-1">
                  <h4 className="font-semibold text-foreground">{method.title}</h4>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                </div>
              </div>
              
              <Button 
                onClick={method.action}
                className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20"
                disabled={isImporting}
              >
                {isImporting ? 'Syncing...' : 'Start Sync'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Import Status */}
      {importProgress > 0 && (
        <Card className="bg-gradient-card border-border shadow-card">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              {importProgress === 100 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-accent" />
              )}
              <h3 className="text-lg font-semibold">
                {importProgress === 100 ? "Sync Complete" : "Sync in Progress"}
              </h3>
            </div>
            
            {importProgress < 100 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Progress</span>
                  <span className="text-sm text-muted-foreground">{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};