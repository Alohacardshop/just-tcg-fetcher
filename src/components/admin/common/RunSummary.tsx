import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, XCircle, Copy, Eye } from 'lucide-react';
import { formatNumber, pluralize, truncateText } from '@/lib/format';
import { toast } from '@/hooks/use-toast';

interface RunSummaryProps {
  title: string;
  status: 'success' | 'warning' | 'error';
  counts?: {
    processed?: number;
    upserted?: number;
    skipped?: number;
    errors?: number;
  };
  message?: string;
  note?: string;
  error?: string;
  isDryRun?: boolean;
  details?: any;
  onCopyToClipboard?: () => void;
  showRawResponse?: boolean;
  onToggleRawResponse?: () => void;
}

export const RunSummary: React.FC<RunSummaryProps> = ({
  title,
  status,
  counts,
  message,
  note,
  error,
  isDryRun,
  details,
  onCopyToClipboard,
  showRawResponse,
  onToggleRawResponse
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusVariant = () => {
    switch (status) {
      case 'success':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const handleCopyToClipboard = () => {
    if (onCopyToClipboard) {
      onCopyToClipboard();
    } else if (details) {
      navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      toast({
        title: "Copied to clipboard",
        description: "Summary data copied to clipboard",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <CardTitle className="text-lg">{title}</CardTitle>
            {isDryRun && (
              <Badge variant="outline" className="text-xs">
                Preview Mode
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {details && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyToClipboard}
                className="h-8 w-8 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
            
            {details && onToggleRawResponse && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleRawResponse}
                className="h-8 w-8 p-0"
              >
                <Eye className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        
        {message && (
          <CardDescription>{message}</CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Counts Grid */}
        {counts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {counts.processed !== undefined && (
              <div>
                <div className="text-muted-foreground">Processed</div>
                <div className="font-medium">{formatNumber(counts.processed)}</div>
              </div>
            )}
            {counts.upserted !== undefined && (
              <div>
                <div className="text-muted-foreground">Upserted</div>
                <div className="font-medium">{formatNumber(counts.upserted)}</div>
              </div>
            )}
            {counts.skipped !== undefined && counts.skipped > 0 && (
              <div>
                <div className="text-muted-foreground">Skipped</div>
                <div className="font-medium">{formatNumber(counts.skipped)}</div>
              </div>
            )}
            {counts.errors !== undefined && counts.errors > 0 && (
              <div>
                <div className="text-muted-foreground">Errors</div>
                <div className="font-medium text-red-500">{formatNumber(counts.errors)}</div>
              </div>
            )}
          </div>
        )}

        {/* Note */}
        {note && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {truncateText(note)}
            </AlertDescription>
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert variant={getStatusVariant() as any}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {truncateText(error)}
            </AlertDescription>
          </Alert>
        )}

        {/* Raw Response Toggle */}
        {showRawResponse && details && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Raw Response</div>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};