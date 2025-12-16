import { Folder, Image, CheckCircle2, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderStructure } from '@/pages/Index';

interface FolderUploadPreviewProps {
  folders: FolderStructure[];
  csvCustomers: string[];
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function FolderUploadPreview({ folders, csvCustomers }: FolderUploadPreviewProps) {
  const normalizedCsvCustomers = csvCustomers.map(normalizeForComparison);

  const isMatched = (customerName: string): boolean => {
    const normalized = normalizeForComparison(customerName);
    return normalizedCsvCustomers.some(
      csv => csv === normalized || csv.includes(normalized) || normalized.includes(csv)
    );
  };

  const matchedCount = folders.filter(f => isMatched(f.customerName)).length;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Folder className="w-4 h-4 text-accent" />
          Detected Folders
        </h3>
        <span className="text-xs text-muted-foreground">
          {matchedCount}/{folders.length} matched
        </span>
      </div>

      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {folders.map((folder, index) => {
            const matched = isMatched(folder.customerName);
            return (
              <div
                key={index}
                className={`flex items-center justify-between p-2 rounded text-xs ${
                  matched ? 'bg-success/10 border border-success/20' : 'bg-secondary/50 border border-border'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {matched ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="truncate" title={folder.customerName}>
                    {folder.customerName}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0 ml-2">
                  <Image className="w-3 h-3" />
                  <span>{folder.files.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
