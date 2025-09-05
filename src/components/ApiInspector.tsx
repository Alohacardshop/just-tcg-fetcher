import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Bug, ChevronUp, ChevronDown } from 'lucide-react';

interface ApiMetadata {
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
  _metadata?: Record<string, any>;
  timestamp?: number;
  endpoint?: string;
}

// Global store for API metadata (simple approach)
let globalApiData: ApiMetadata | null = null;
const subscribers = new Set<() => void>();

export const updateApiInspectorData = (data: ApiMetadata) => {
  globalApiData = {
    ...data,
    timestamp: Date.now(),
  };
  subscribers.forEach(callback => callback());
};

export function ApiInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiData, setApiData] = useState<ApiMetadata | null>(globalApiData);
  
  useEffect(() => {
    const updateData = () => setApiData(globalApiData);
    subscribers.add(updateData);
    return () => {
      subscribers.delete(updateData);
    };
  }, []);
  
  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-[80] max-w-md">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-background/80 backdrop-blur-sm border-border/50"
          >
            <Bug className="h-4 w-4" />
            API Inspector
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-2">
          <Card className="bg-background/95 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Latest API Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!apiData ? (
                <p className="text-sm text-muted-foreground">No API data available</p>
              ) : (
                <>
                  {apiData.endpoint && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Endpoint</label>
                      <p className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {apiData.endpoint}
                      </p>
                    </div>
                  )}
                  
                  {apiData.timestamp && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Timestamp</label>
                      <p className="text-xs">
                        {new Date(apiData.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                  
                  {apiData.meta && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Pagination Meta</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {apiData.meta.total !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            Total: {apiData.meta.total}
                          </Badge>
                        )}
                        {apiData.meta.limit !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            Limit: {apiData.meta.limit}
                          </Badge>
                        )}
                        {apiData.meta.offset !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            Offset: {apiData.meta.offset}
                          </Badge>
                        )}
                        {apiData.meta.hasMore !== undefined && (
                          <Badge 
                            variant={apiData.meta.hasMore ? "default" : "outline"} 
                            className="text-xs"
                          >
                            {apiData.meta.hasMore ? "Has More" : "Complete"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {apiData._metadata && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Plan Usage</label>
                      <div className="text-xs bg-muted p-2 rounded font-mono max-h-32 overflow-y-auto">
                        <pre>{JSON.stringify(apiData._metadata, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}