import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { SyncLogs } from '@/components/SyncLogs';
import { Loader2, Clock, Calendar } from 'lucide-react';

interface Game {
  id: string;
  name: string;
  jt_game_id: string;
}

interface AutomationSetting {
  id: string;
  game_id: string;
  enabled: boolean;
  schedule_time: string;
  last_run_at?: string;
}

export default function AutomationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<AutomationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('02:00');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      // Load games
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('id, name, jt_game_id')
        .order('name');

      if (gamesError) throw gamesError;

      // Load existing automation settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('automation_settings')
        .select('*')
        .eq('user_id', user?.id);

      if (settingsError) throw settingsError;

      setGames(gamesData || []);
      setSettings(settingsData || []);
      
      // Set schedule time from first setting or default
      if (settingsData && settingsData.length > 0) {
        setScheduleTime(settingsData[0].schedule_time.slice(0, 5)); // Remove seconds
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load automation settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isGameEnabled = (gameId: string) => {
    const setting = settings.find(s => s.game_id === gameId);
    return setting?.enabled || false;
  };

  const toggleGame = (gameId: string, enabled: boolean) => {
    setSettings(prev => {
      const existing = prev.find(s => s.game_id === gameId);
      if (existing) {
        return prev.map(s => 
          s.game_id === gameId 
            ? { ...s, enabled }
            : s
        );
      } else {
        return [...prev, {
          id: '', // Will be generated on save
          game_id: gameId,
          enabled,
          schedule_time: scheduleTime + ':00',
        }];
      }
    });
  };

  const saveSettings = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // Delete all existing settings for this user
      await supabase
        .from('automation_settings')
        .delete()
        .eq('user_id', user.id);

      // Insert new settings for enabled games
      const enabledSettings = settings
        .filter(s => s.enabled)
        .map(s => ({
          user_id: user.id,
          game_id: s.game_id,
          enabled: true,
          schedule_time: scheduleTime + ':00',
        }));

      if (enabledSettings.length > 0) {
        const { error } = await supabase
          .from('automation_settings')
          .insert(enabledSettings);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Automation settings saved for ${enabledSettings.length} games`,
      });

      // Reload to get fresh data
      loadData();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save automation settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const runManualSync = async () => {
    const enabledGames = settings.filter(s => s.enabled);
    if (enabledGames.length === 0) {
      toast({
        title: "No Games Selected",
        description: "Please select at least one game to sync",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('automated-sync', {
        body: { 
          gameIds: enabledGames.map(s => s.game_id),
          manual: true 
        }
      });

      if (error) throw error;

      toast({
        title: "Sync Started",
        description: "Manual sync has been initiated for selected games",
      });
    } catch (error) {
      console.error('Error starting manual sync:', error);
      toast({
        title: "Error",
        description: "Failed to start manual sync",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Clock className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Automation Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automated Sync Schedule</CardTitle>
          <CardDescription>
            Configure which games to sync automatically at night
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="schedule-time">Schedule Time</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-32"
              />
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Daily</span>
            </div>
          </div>

          <div className="space-y-4">
            <Label>Games to Sync</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.map((game) => {
                const setting = settings.find(s => s.game_id === game.id);
                const lastRun = setting?.last_run_at;
                
                return (
                  <Card key={game.id} className="p-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id={`game-${game.id}`}
                        checked={isGameEnabled(game.id)}
                        onCheckedChange={(checked) => 
                          toggleGame(game.id, checked as boolean)
                        }
                      />
                      <div className="flex-1 space-y-1">
                        <Label 
                          htmlFor={`game-${game.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {game.name}
                        </Label>
                        {lastRun && (
                          <p className="text-xs text-muted-foreground">
                            Last run: {new Date(lastRun).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="flex items-center space-x-4 pt-4">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
            
            <Button variant="outline" onClick={runManualSync}>
              Run Manual Sync
            </Button>
          </div>
        </CardContent>
      </Card>

      <SyncLogs />
    </div>
  );
}