import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  width?: number;
  render: (item: T, index: number) => React.ReactNode;
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  height?: number;
  rowHeight?: number;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  className?: string;
}

export function VirtualizedTable<T>({
  data,
  columns,
  height = 600,
  rowHeight = 60,
  loading = false,
  onLoadMore,
  hasMore = false,
  className = '',
}: VirtualizedTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length + (hasMore ? 1 : 0), // +1 for load more row
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  return (
    <div className={`border rounded-lg ${className}`}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead 
                key={column.key}
                style={{ width: column.width }}
                className="sticky top-0 bg-background z-10"
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      </Table>
      
      <div
        ref={parentRef}
        style={{ height, overflow: 'auto' }}
        className="relative"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const isLoadMoreRow = virtualItem.index >= data.length;
            
            if (isLoadMoreRow) {
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="flex items-center justify-center border-t"
                >
                  {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more...
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={onLoadMore}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Load more
                    </Button>
                  )}
                </div>
              );
            }

            const item = data[virtualItem.index];

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <Table>
                  <TableBody>
                    <TableRow className="hover:bg-muted/50">
                      {columns.map((column) => (
                        <TableCell 
                          key={column.key}
                          style={{ width: column.width }}
                          className="border-r last:border-r-0"
                        >
                          {column.render(item, virtualItem.index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper components for common column types
export const badgeVariantFromStatus = (status?: string) => {
  switch (status) {
    case 'completed':
    case 'synced':
      return 'default';
    case 'partial':
      return 'secondary';
    case 'error':
      return 'destructive';
    case 'pending':
    case 'syncing':
      return 'outline';
    default:
      return 'outline';
  }
};

export function StatusBadge({ status, children }: { status?: string; children: React.ReactNode }) {
  return (
    <Badge variant={badgeVariantFromStatus(status)} className="text-xs">
      {children}
    </Badge>
  );
}

export function CountBadges({ 
  counts, 
  total 
}: { 
  counts: { label: string; value: number; expected?: number }[]; 
  total?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {counts.map(({ label, value, expected }) => {
        const isPartial = expected !== undefined && value < expected * 0.8; // 80% threshold
        return (
          <Badge 
            key={label}
            variant={isPartial ? "secondary" : "outline"}
            className="text-xs"
          >
            {label}: {value}
            {expected && value < expected && (
              <span className="text-muted-foreground">/{expected}</span>
            )}
          </Badge>
        );
      })}
      {total !== undefined && (
        <Badge variant="outline" className="text-xs font-medium">
          Total: {total}
        </Badge>
      )}
    </div>
  );
}