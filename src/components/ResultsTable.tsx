import { CSVRow } from '@/lib/csvUtils';
import { CheckCircle2, XCircle, Minus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ResultsTableProps {
  rows: CSVRow[];
}

export function ResultsTable({ rows }: ResultsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 text-center">
        <p className="text-muted-foreground">No data loaded. Upload a CSV file to begin.</p>
      </div>
    );
  }

  const renderStatus = (value: string) => {
    if (!value) {
      return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
    if (value.toLowerCase() === 'pass') {
      return <CheckCircle2 className="w-4 h-4 text-success" />;
    }
    return <XCircle className="w-4 h-4 text-destructive" />;
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50 hover:bg-secondary/50">
              <TableHead className="font-semibold text-foreground">Customer Name</TableHead>
              <TableHead className="font-semibold text-foreground">Filename</TableHead>
              <TableHead className="font-semibold text-foreground font-mono">CCN Expected</TableHead>
              <TableHead className="font-semibold text-foreground font-mono">CCN Actual</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Expected</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Actual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index} className="hover:bg-secondary/30">
                <TableCell className="max-w-[200px] truncate" title={row['Customer name']}>
                  {row['Customer name']}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.filename}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row['CCN Expected']}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row['CCN Actual'] ? (
                    <span className={row['CCN Actual'] === row['CCN Expected'] ? 'text-success' : 'text-warning'}>
                      {row['CCN Actual']}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {renderStatus(row['Luhn test Expected'])}
                </TableCell>
                <TableCell className="text-center">
                  {renderStatus(row['Luhn Test Actual'])}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
