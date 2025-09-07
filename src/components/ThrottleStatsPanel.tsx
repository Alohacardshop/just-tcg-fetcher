import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useThrottleStats, useTaskStatuses } from "@/hooks/useThrottleStats";
import { Activity, Clock, CheckCircle, XCircle, Pause } from "lucide-react";

export const ThrottleStatsPanel = () => {
  const { stats, clearCompleted } = useThrottleStats();
  const taskStatuses = useTaskStatuses();

  const formatDuration = (startTime: number, endTime?: number) => {
    const duration = (endTime || Date.now()) - startTime;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              TCGCSV API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Running: {stats.tcgcsv.running}/{stats.tcgcsv.maxConcurrency}</span>
              <span>{stats.tcgcsv.requestsPerSecond} RPS</span>
            </div>
            <Progress 
              value={(stats.tcgcsv.running / stats.tcgcsv.maxConcurrency) * 100} 
              className="h-2"
            />
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {stats.tcgcsv.queued} queued
              </Badge>
              <Badge variant="default" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                {stats.tcgcsv.completed}
              </Badge>
              <Badge variant="destructive" className="text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                {stats.tcgcsv.failed}
              </Badge>
              {stats.tcgcsv.throttled > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Pause className="h-3 w-3 mr-1" />
                  {stats.tcgcsv.throttled}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              JustTCG API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Running: {stats.justtcg.running}/{stats.justtcg.maxConcurrency}</span>
              <span>{stats.justtcg.requestsPerSecond} RPS</span>
            </div>
            <Progress 
              value={(stats.justtcg.running / stats.justtcg.maxConcurrency) * 100} 
              className="h-2"
            />
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {stats.justtcg.queued} queued
              </Badge>
              <Badge variant="default" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                {stats.justtcg.completed}
              </Badge>
              <Badge variant="destructive" className="text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                {stats.justtcg.failed}
              </Badge>
              {stats.justtcg.throttled > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Pause className="h-3 w-3 mr-1" />
                  {stats.justtcg.throttled}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm">Recent Tasks</CardTitle>
            <Button variant="outline" size="sm" onClick={clearCompleted}>
              Clear Completed
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-40 overflow-y-auto">
          {[...taskStatuses.tcgcsv, ...taskStatuses.justtcg]
            .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
            .slice(0, 10)
            .map((task) => (
              <div key={task.id} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                <div className="flex items-center gap-2">
                  {task.status === 'running' && <Activity className="h-3 w-3 text-blue-500 animate-pulse" />}
                  {task.status === 'completed' && <CheckCircle className="h-3 w-3 text-green-500" />}
                  {task.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                  {task.status === 'throttled' && <Pause className="h-3 w-3 text-yellow-500" />}
                  {task.status === 'pending' && <Clock className="h-3 w-3 text-gray-500" />}
                  <span className="font-medium">{task.type}</span>
                  <span className="text-muted-foreground">{task.id.slice(-8)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {task.progress > 0 && task.total > 0 && (
                    <span>{task.progress}/{task.total}</span>
                  )}
                  {task.retries > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {task.retries} retries
                    </Badge>
                  )}
                  {task.startedAt && (
                    <span className="text-muted-foreground">
                      {formatDuration(task.startedAt, task.completedAt)}
                    </span>
                  )}
                </div>
              </div>
            ))
          }
          {taskStatuses.tcgcsv.length === 0 && taskStatuses.justtcg.length === 0 && (
            <div className="text-center text-muted-foreground py-4">
              No recent tasks
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};