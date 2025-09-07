import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export const TcgCsvGuidedPanel = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>TCGCSV Guided Panel</CardTitle>
        <CardDescription>Guided setup for TCGCSV data synchronization</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            TCGCSV guided setup is currently unavailable. Database tables need to be created first.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};