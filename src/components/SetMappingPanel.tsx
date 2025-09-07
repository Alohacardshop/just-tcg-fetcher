import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export const SetMappingPanel = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set Mapping Panel</CardTitle>
        <CardDescription>Map sets between JustTCG and TCGCSV data sources</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Set mapping is currently unavailable. Database tables need to be created first.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};