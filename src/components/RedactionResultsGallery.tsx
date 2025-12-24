import { useState, useEffect } from 'react';
import { Download, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { blobToDataURL, downloadBlob } from '@/lib/imageUtils';

export interface RedactedCard {
  id: string;
  folderName: string;
  cardIndex: number;
  originalBlob: Blob;
  redactedBlob: Blob;
  sourceFiles: string[];
}

interface RedactionResultsGalleryProps {
  results: RedactedCard[];
}

interface CardPreviewProps {
  card: RedactedCard;
}

function CardPreview({ card }: CardPreviewProps) {
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [redactedUrl, setRedactedUrl] = useState<string>('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const loadImages = async () => {
      const [origUrl, redUrl] = await Promise.all([
        blobToDataURL(card.originalBlob),
        blobToDataURL(card.redactedBlob)
      ]);
      
      if (mounted) {
        setOriginalUrl(origUrl);
        setRedactedUrl(redUrl);
      }
    };
    
    loadImages();
    
    return () => {
      mounted = false;
    };
  }, [card]);

  const handleDownloadOriginal = () => {
    const filename = `${card.folderName}_card${card.cardIndex + 1}_original.jpg`;
    downloadBlob(card.originalBlob, filename);
  };

  const handleDownloadRedacted = () => {
    const filename = `${card.folderName}_card${card.cardIndex + 1}_redacted.jpg`;
    downloadBlob(card.redactedBlob, filename);
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md overflow-hidden bg-secondary flex-shrink-0">
            {redactedUrl && (
              <img 
                src={redactedUrl} 
                alt="Preview" 
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div>
            <p className="font-medium text-sm">{card.folderName}</p>
            <p className="text-xs text-muted-foreground">
              Card {card.cardIndex + 1} • {card.sourceFiles.join(', ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadRedacted();
            }}
          >
            <Download className="w-4 h-4 mr-1" />
            Redacted
          </Button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 pt-0 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={showOriginal ? "outline" : "default"}
              size="sm"
              onClick={() => setShowOriginal(false)}
            >
              <EyeOff className="w-4 h-4 mr-1" />
              Redacted
            </Button>
            <Button
              variant={showOriginal ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOriginal(true)}
            >
              <Eye className="w-4 h-4 mr-1" />
              Original
            </Button>
          </div>
          
          <div className="rounded-lg overflow-hidden bg-secondary/30 mb-4">
            {(showOriginal ? originalUrl : redactedUrl) && (
              <img 
                src={showOriginal ? originalUrl : redactedUrl}
                alt={showOriginal ? "Original" : "Redacted"}
                className="w-full h-auto max-h-[400px] object-contain"
              />
            )}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOriginal}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-1" />
              Download Original
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadRedacted}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-1" />
              Download Redacted
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RedactionResultsGallery({ results }: RedactionResultsGalleryProps) {
  if (results.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 text-center">
        <p className="text-muted-foreground">No redacted images yet. Upload a folder and process to see results.</p>
      </div>
    );
  }

  // Group results by folder
  const groupedResults = results.reduce((acc, card) => {
    if (!acc[card.folderName]) {
      acc[card.folderName] = [];
    }
    acc[card.folderName].push(card);
    return acc;
  }, {} as Record<string, RedactedCard[]>);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <ScrollArea className="h-[500px]">
        <div className="p-4 space-y-3">
          {Object.entries(groupedResults).map(([folderName, cards]) => (
            <div key={folderName} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {folderName}
              </h3>
              {cards.map((card) => (
                <CardPreview key={card.id} card={card} />
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

