import { useCallback } from 'react';
import { Upload, FileText, ImageIcon } from 'lucide-react';

interface FileUploadProps {
  accept: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  label: string;
  description: string;
  icon: 'csv' | 'image';
  files?: File[];
}

export function FileUpload({
  accept,
  multiple = false,
  onFilesSelected,
  label,
  description,
  icon,
  files = [],
}: FileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesSelected(droppedFiles);
    },
    [onFilesSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        onFilesSelected(Array.from(e.target.files));
      }
    },
    [onFilesSelected]
  );

  const IconComponent = icon === 'csv' ? FileText : ImageIcon;

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative group"
    >
      <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <div className="p-3 bg-primary/10 rounded-full mb-3 group-hover:bg-primary/20 transition-colors">
            <IconComponent className="w-8 h-8 text-primary" />
          </div>
          <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {files.length > 0 && (
            <p className="mt-2 text-xs text-primary font-mono">
              {files.length} file{files.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>
        <input
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
        />
      </label>
    </div>
  );
}
