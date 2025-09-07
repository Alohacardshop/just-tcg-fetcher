import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface SyncProgressModalProps {
  operationId: string | null;
  onClose: () => void;
}

export function SyncProgressModal({ operationId, onClose }: SyncProgressModalProps) {
  return (
    <Dialog open={!!operationId} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync Progress</DialogTitle>
          <DialogDescription>Monitor data synchronization progress</DialogDescription>
        </DialogHeader>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Sync progress monitoring is currently unavailable. Database tables need to be created first.
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  );
}