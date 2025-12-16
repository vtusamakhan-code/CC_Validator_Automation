import { useState } from 'react';
import { Folder, Image, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface FolderData {
  name: string;
  files: File[];
}

interface FolderManagerProps {
  folders: FolderData[];
  onFoldersChange: (folders: FolderData[]) => void;
}

export function FolderManager({ folders, onFoldersChange }: FolderManagerProps) {
  const [newFolderName, setNewFolderName] = useState('');

  const addFolder = () => {
    if (newFolderName.trim()) {
      onFoldersChange([...folders, { name: newFolderName.trim(), files: [] }]);
      setNewFolderName('');
    }
  };

  const removeFolder = (index: number) => {
    const updated = folders.filter((_, i) => i !== index);
    onFoldersChange(updated);
  };

  const addFilesToFolder = (folderIndex: number, newFiles: File[]) => {
    const updated = folders.map((folder, i) => {
      if (i === folderIndex) {
        return { ...folder, files: [...folder.files, ...newFiles] };
      }
      return folder;
    });
    onFoldersChange(updated);
  };

  const removeFileFromFolder = (folderIndex: number, fileIndex: number) => {
    const updated = folders.map((folder, i) => {
      if (i === folderIndex) {
        return {
          ...folder,
          files: folder.files.filter((_, fi) => fi !== fileIndex),
        };
      }
      return folder;
    });
    onFoldersChange(updated);
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Folder className="w-4 h-4 text-primary" />
        Image Folders
      </h3>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Enter folder name..."
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addFolder()}
          className="text-sm"
        />
        <Button size="sm" onClick={addFolder} disabled={!newFolderName.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-3">
          {folders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Add folders to organize credit card images
            </p>
          ) : (
            folders.map((folder, folderIndex) => (
              <div
                key={folderIndex}
                className="bg-secondary/30 rounded-md p-3 border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium truncate flex items-center gap-2">
                    <Folder className="w-4 h-4 text-accent" />
                    {folder.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFolder(folderIndex)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                <div className="space-y-1">
                  {folder.files.map((file, fileIndex) => (
                    <div
                      key={fileIndex}
                      className="flex items-center justify-between text-xs bg-background/50 rounded px-2 py-1"
                    >
                      <span className="truncate flex items-center gap-1 text-muted-foreground">
                        <Image className="w-3 h-3" />
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFileFromFolder(folderIndex, fileIndex)}
                        className="text-muted-foreground hover:text-destructive ml-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <label className="mt-2 flex items-center justify-center gap-1 text-xs text-primary cursor-pointer hover:text-primary/80 py-1 border border-dashed border-primary/30 rounded">
                  <Plus className="w-3 h-3" />
                  Add images
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        addFilesToFolder(folderIndex, Array.from(e.target.files));
                      }
                    }}
                  />
                </label>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
