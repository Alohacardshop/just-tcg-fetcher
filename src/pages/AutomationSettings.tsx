import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Clock } from 'lucide-react';

export default function AutomationSettings() {
  return (
    <div className="container mx-auto p-8 space-y-8 animate-fade-in max-w-7xl">
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Automation Settings
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Configure automated data synchronization schedules and preferences.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Automated Sync Schedules</CardTitle>
            <CardDescription>
              Set up automatic data synchronization for your trading card games
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Automation settings are currently unavailable. Database tables need to be created first.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}