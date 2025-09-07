import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function CsvDebugTester() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const testCsvUrl = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('debug-csv-sample', {
        body: { categoryId: 3, groupId: 1938 }
      });

      if (error) throw error;

      setResults(data);
      console.log('CSV Debug Results:', data);
      
      if (data.actualLineCount) {
        toast.success(`CSV analyzed: ${data.actualLineCount} total lines, ${data.nonEmptyLines} non-empty`);
      }
    } catch (error) {
      console.error('Error testing CSV:', error);
      toast.error('Failed to test CSV URL');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Debug Tester</CardTitle>
        <CardDescription>
          Test the TCGCSV URL directly to see what's causing the truncation at 59 lines
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={testCsvUrl} disabled={isLoading}>
          {isLoading ? 'Testing CSV...' : 'Test CSV URL'}
        </Button>

        {results && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><strong>URL:</strong> {results.url}</div>
              <div><strong>Status:</strong> {results.statusCode}</div>
              <div><strong>Content Length:</strong> {results.contentLength?.toLocaleString()} bytes</div>
              <div><strong>Response Time:</strong> {results.responseTime}ms</div>
              <div><strong>Total Lines:</strong> {results.actualLineCount}</div>
              <div><strong>Non-empty Lines:</strong> {results.nonEmptyLines}</div>
              <div><strong>Contains HTML:</strong> {results.containsHtml ? 'Yes' : 'No'}</div>
              <div><strong>Max Line Length:</strong> {results.maxLineLength}</div>
            </div>

            {results.firstFewLines && (
              <div>
                <h4 className="font-semibold mb-2">First Few Lines:</h4>
                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                  {results.firstFewLines.join('\n')}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <strong>Line 59:</strong>
                <pre className="bg-muted p-1 rounded text-xs mt-1 break-all">
                  {results.sampleLine59}
                </pre>
              </div>
              <div>
                <strong>Line 60:</strong>
                <pre className="bg-muted p-1 rounded text-xs mt-1 break-all">
                  {results.sampleLine60}
                </pre>
              </div>
              <div>
                <strong>Line 61:</strong>
                <pre className="bg-muted p-1 rounded text-xs mt-1 break-all">
                  {results.sampleLine61}
                </pre>
              </div>
            </div>

            {results.lastFewLines && (
              <div>
                <h4 className="font-semibold mb-2">Last Few Lines:</h4>
                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                  {results.lastFewLines.join('\n')}
                </pre>
              </div>
            )}

            {results.headers && (
              <div>
                <h4 className="font-semibold mb-2">Response Headers:</h4>
                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(results.headers, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}