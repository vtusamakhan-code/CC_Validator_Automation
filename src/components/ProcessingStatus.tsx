import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ProcessingStatusProps {
  currentFolder: string;
  processedCount: number;
  totalCount: number;
  status: 'idle' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
}

export function ProcessingStatus({
  currentFolder,
  processedCount,
  totalCount,
  status,
  errorMessage,
}: ProcessingStatusProps) {
  const progress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;

  return (
    <div className="bg-card rounded-lg border border-border p-6 animate-slide-in">
      <div className="flex items-center gap-3 mb-4">
        {status === 'idle' && (
          <Clock className="w-5 h-5 text-muted-foreground" />
        )}
        {status === 'processing' && (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        )}
        {status === 'complete' && (
          <CheckCircle2 className="w-5 h-5 text-success" />
        )}
        {status === 'error' && (
          <XCircle className="w-5 h-5 text-destructive" />
        )}
        <span className="font-medium">
          {status === 'idle' && 'Ready to process'}
          {status === 'processing' && 'Processing...'}
          {status === 'complete' && 'Processing complete'}
          {status === 'error' && 'Error occurred'}
        </span>
      </div>

      <Progress value={progress} className="h-2 mb-3" />

      <div className="flex justify-between text-sm text-muted-foreground">
        <span className="font-mono">
          {processedCount} / {totalCount} rows
        </span>
        <span>{Math.round(progress)}%</span>
      </div>

      {currentFolder && status === 'processing' && (
        <p className="mt-3 text-xs text-muted-foreground truncate">
          Current: <span className="text-foreground font-mono">{currentFolder}</span>
        </p>
      )}

      {errorMessage && (
        <p className="mt-3 text-xs text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
