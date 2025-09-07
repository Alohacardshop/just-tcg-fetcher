import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Database, AlertCircle, Info } from 'lucide-react';

export const DataImportPanel = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Import Panel
          </CardTitle>
          <CardDescription>
            Import and synchronize trading card data from external sources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This component is currently disabled because the database schema needs to be set up.
              The database was recently reset and only contains user profiles.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            <div className="p-4 border rounded-lg bg-muted/20">
              <h3 className="font-semibold mb-2">Database Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Profiles Table</span>
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Games Table</span>
                  <Badge variant="secondary">Not Created</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Sets Table</span>
                  <Badge variant="secondary">Not Created</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cards Table</span>
                  <Badge variant="secondary">Not Created</Badge>
                </div>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Data Import Unavailable</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    The data import functionality requires database tables to be created first.
                  </p>
                  <Button disabled variant="outline">
                    Import Disabled
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};