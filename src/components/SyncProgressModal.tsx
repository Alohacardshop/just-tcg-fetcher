import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { X, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useSyncStatus, useSyncLogs } from '@/hooks/useSyncStatus';
import { formatDistanceToNow } from 'date-fns';

interface SyncProgressModalProps {
  operationId: string | null;
  onClose: () => void;
}

export function SyncProgressModal({ operationId, onClose }: SyncProgressModalProps) {
  const { data: status } = useSyncStatus(operationId || undefined);
  const { data: logs = [] } = useSyncLogs(operationId || undefined);

  if (!operationId) return null;

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const progressPercentage = status?.progress_total > 0 
    ? (status.progress_current / status.progress_total) * 100 
    : 0;

  return (
    <Dialog open={!!operationId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(status?.status)}
            <DialogTitle>
              Sync Progress - {status?.operation_type || 'Unknown'}
            </DialogTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Overview */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="flex items-center gap-1">
              {getStatusIcon(status?.status)}
              {status?.status || 'pending'}
            </Badge>
            {status?.started_at && (
              <span className="text-sm text-muted-foreground">
                Started {formatDistanceToNow(new Date(status.started_at), { addSuffix: true })}
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {status?.progress_total > 0 && (
            <div className="space-y-2">
              <Progress 
                value={progressPercentage} 
                className="w-full"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {status.progress_current} of {status.progress_total} items
                </span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {status?.error_message && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-800">Error</h4>
                  <p className="text-sm text-red-700 mt-1">{status.error_message}</p>
                </div>
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Activity Log</h4>
            <ScrollArea className="h-48 w-full border rounded-md p-3">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="text-sm">
                    <div className="flex items-start gap-2">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          log.status === 'error' ? 'border-red-500 text-red-700' :
                          log.status === 'success' ? 'border-green-500 text-green-700' :
                          log.status === 'warning' ? 'border-yellow-500 text-yellow-700' :
                          'border-blue-500 text-blue-700'
                        }`}
                      >
                        {log.status}
                      </Badge>
                      <div className="flex-1">
                        <p className="text-foreground">{log.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </p>
                        {log.details && (
                          <details className="mt-1">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              View details
                            </summary>
                            <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No logs yet...</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {status?.status === 'completed' && (
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            )}
            {(status?.status === 'running' || status?.status === 'pending') && (
              <Button variant="outline" onClick={onClose}>
                Run in Background
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}