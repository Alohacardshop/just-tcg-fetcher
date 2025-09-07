import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export const TcgCsvSync = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>TCGCSV Sync</CardTitle>
        <CardDescription>Synchronize data with TCGCSV API</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            TCGCSV synchronization is currently unavailable. Database tables need to be created first.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};