import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Clock, AlertTriangle, CheckCircle, XCircle, Play } from "lucide-react";
import { format } from "date-fns";

interface SyncLog {
  id: string;
  operation_type: string;
  operation_id: string;
  game_id: string | null;
  set_id: string | null;
  status: string;
  message: string;
  details: any;
  duration_ms: number | null;
  created_at: string;
  created_by: string;
  games?: { name: string } | null;
  sets?: { name: string } | null;
}

const statusConfig = {
  started: { icon: Play, color: "bg-blue-500", label: "Started" },
  success: { icon: CheckCircle, color: "bg-green-500", label: "Success" },
  error: { icon: XCircle, color: "bg-red-500", label: "Error" },
  warning: { icon: AlertTriangle, color: "bg-yellow-500", label: "Warning" }
} as const;

type StatusType = keyof typeof statusConfig;

export function SyncLogs() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select(`
          *,
          games:game_id(name),
          sets:set_id(name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'automated') return log.operation_type === 'automated_sync';
    if (filter === 'manual') return log.operation_type === 'manual_sync';
    if (filter === 'errors') return log.status === 'error';
    return true;
  });

  const getOperationLogs = (operationId: string) => {
    return logs.filter(log => log.operation_id === operationId);
  };

  const groupedLogs = filteredLogs.reduce((acc, log) => {
    if (!acc[log.operation_id]) {
      acc[log.operation_id] = [];
    }
    acc[log.operation_id].push(log);
    return acc;
  }, {} as Record<string, SyncLog[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sync Logs
            </CardTitle>
            <CardDescription>
              View detailed logs of all sync operations
            </CardDescription>
          </div>
          <Button onClick={fetchLogs} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {['all', 'automated', 'manual', 'errors'].map((filterType) => (
            <Button
              key={filterType}
              variant={filter === filterType ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(filterType)}
            >
              {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
            </Button>
          ))}
        </div>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[600px] w-full">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading logs...</span>
            </div>
          ) : Object.keys(groupedLogs).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No logs found
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedLogs).map(([operationId, operationLogs]) => {
                const firstLog = operationLogs[0];
                const lastLog = operationLogs[operationLogs.length - 1];
                const hasErrors = operationLogs.some(log => log.status === 'error');
                const isCompleted = operationLogs.some(log => log.status === 'success' && log.message.includes('completed'));
                
                return (
                  <Card key={operationId} className="border-l-4 border-l-primary/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={hasErrors ? 'destructive' : isCompleted ? 'default' : 'secondary'}>
                            {firstLog.operation_type.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(firstLog.created_at), 'MMM d, yyyy HH:mm:ss')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {lastLog.duration_ms && (
                            <span className="text-sm text-muted-foreground">
                              {(lastLog.duration_ms / 1000).toFixed(1)}s
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {operationLogs.length} events
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {operationLogs.map((log, index) => {
                          const status = log.status as StatusType;
                          const StatusIcon = statusConfig[status]?.icon || Play;
                          
                          return (
                            <div key={log.id} className="flex items-start gap-3 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-2 h-2 rounded-full ${statusConfig[status]?.color || 'bg-gray-500'}`} />
                                <StatusIcon className="h-4 w-4 flex-shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{log.message}</span>
                                  {log.games?.name && (
                                    <Badge variant="outline" className="text-xs">
                                      {log.games.name}
                                    </Badge>
                                  )}
                                  {log.sets?.name && (
                                    <Badge variant="outline" className="text-xs">
                                      {log.sets.name}
                                    </Badge>
                                  )}
                                </div>
                                {log.details?.error && (
                                  <div className="text-red-600 text-xs mt-1 font-mono bg-red-50 p-2 rounded">
                                    {log.details.error}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(log.created_at), 'HH:mm:ss.SSS')}
                                  {log.duration_ms && ` • ${log.duration_ms}ms`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {operationLogs.length > 0 && <Separator className="my-4" />}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}