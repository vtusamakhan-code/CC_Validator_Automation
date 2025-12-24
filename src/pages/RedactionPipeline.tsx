import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Download, Play, RefreshCw, FolderOpen, Package, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { RedactionResultsGallery, RedactedCard } from '@/components/RedactionResultsGallery';
import { FolderUploadPreview } from '@/components/FolderUploadPreview';
import { 
  categorizeImages, 
  groupCreditCards, 
  getRedactionMetadata,
  CreditCardPair 
} from '@/lib/ocrApi';
import { 
  combineImagesVertically, 
  applyRedactionToImage,
  applyRedactionToSeparateImages 
} from '@/lib/imageUtils';
import { createAndDownloadZip, ZipFile } from '@/lib/zipUtils';
import { toast } from 'sonner';

export interface FolderStructure {
  folderName: string;
  customerName: string;
  files: File[];
}

function extractCustomerName(folderName: string): string {
  const parts = folderName.split('_');
  const hashPattern = /^[a-f0-9]{8,}$/i;
  
  let customerParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (hashPattern.test(parts[i]) && i > 0) {
      break;
    }
    customerParts.push(parts[i]);
  }
  
  return customerParts.join(' ').trim();
}

export default function RedactionPipeline() {
  const [folderStructure, setFolderStructure] = useState<FolderStructure[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentFolder, setCurrentFolder] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [redactedCards, setRedactedCards] = useState<RedactedCard[]>([]);

  const handleFolderUpload = useCallback((files: File[]) => {
    const folderMap = new Map<string, File[]>();
    
    for (const file of files) {
      const pathParts = file.webkitRelativePath.split('/');
      
      if (pathParts.length >= 2) {
        const subfolderName = pathParts[1];
        
        if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name)) {
          if (!folderMap.has(subfolderName)) {
            folderMap.set(subfolderName, []);
          }
          folderMap.get(subfolderName)!.push(file);
        }
      }
    }

    const structure: FolderStructure[] = [];
    for (const [folderName, files] of folderMap) {
      const customerName = extractCustomerName(folderName);
      structure.push({
        folderName,
        customerName,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    structure.sort((a, b) => a.customerName.localeCompare(b.customerName));
    
    setFolderStructure(structure);
    setTotalCount(structure.length);
    toast.success(`Found ${structure.length} customer folders with ${files.filter(f => f.type.startsWith('image/')).length} images`);
  }, []);

  const processFolder = async (folder: FolderStructure): Promise<RedactedCard[]> => {
    const cards: RedactedCard[] = [];
    const imageCount = folder.files.length;

    if (imageCount === 0) {
      return cards;
    }

    if (imageCount === 1) {
      // Single image - direct OCR/Redaction
      const file = folder.files[0];
      const blob = file as Blob;
      
      try {
        const redactionResponse = await getRedactionMetadata(blob);
        const redactedBlob = await applyRedactionToImage(blob, redactionResponse.redaction_metadata);
        
        cards.push({
          id: `${folder.folderName}-0`,
          folderName: folder.folderName,
          cardIndex: 0,
          originalBlob: blob,
          redactedBlob,
          sourceFiles: [file.name],
        });
      } catch (error) {
        console.error(`Error processing single image in ${folder.folderName}:`, error);
      }
      
      return cards;
    }

    // Multiple images - use categorize and group APIs
    try {
      const categorizeResult = await categorizeImages(folder.files);
      const cardPairs = await groupCreditCards(folder.files, categorizeResult);
      
      console.log(`Processing ${cardPairs.length} card(s) for ${folder.folderName}`);
      
      let cardIdx = 0;
      for (let i = 0; i < cardPairs.length; i++) {
        const pair = cardPairs[i];
        
        try {
          if (pair.front && pair.back) {
            // Paired card - combine for API, but save separate redacted images
            const frontFile = folder.files.find(f => f.name === pair.front);
            const backFile = folder.files.find(f => f.name === pair.back);
            
            if (frontFile && backFile) {
              // Combine images for API call
              const mergedBlob = await combineImagesVertically([frontFile, backFile]);
              
              // Get redaction metadata from merged image
              const redactionResponse = await getRedactionMetadata(mergedBlob);
              
              // Apply redaction to separate images
              const separateResult = await applyRedactionToSeparateImages(
                frontFile,
                backFile,
                redactionResponse.redaction_metadata,
                0 // Will be calculated inside the function
              );
              
              // Add front image as separate card
              cards.push({
                id: `${folder.folderName}-${cardIdx}`,
                folderName: folder.folderName,
                cardIndex: cardIdx,
                originalBlob: separateResult.frontOriginal,
                redactedBlob: separateResult.frontRedacted,
                sourceFiles: [pair.front],
              });
              cardIdx++;
              
              // Add back image as separate card
              cards.push({
                id: `${folder.folderName}-${cardIdx}`,
                folderName: folder.folderName,
                cardIndex: cardIdx,
                originalBlob: separateResult.backOriginal,
                redactedBlob: separateResult.backRedacted,
                sourceFiles: [pair.back],
              });
              cardIdx++;
            } else {
              console.error(`Files not found: front=${pair.front}, back=${pair.back}`);
              continue;
            }
          } else {
            // Non-paired card - single image
            const singleFileName = pair.front || pair.back;
            const singleFile = folder.files.find(f => f.name === singleFileName);
            
            if (singleFile) {
              const originalBlob = singleFile as Blob;
              
              // Get redaction metadata and apply redaction
              const redactionResponse = await getRedactionMetadata(originalBlob);
              const redactedBlob = await applyRedactionToImage(originalBlob, redactionResponse.redaction_metadata);
              
              cards.push({
                id: `${folder.folderName}-${cardIdx}`,
                folderName: folder.folderName,
                cardIndex: cardIdx,
                originalBlob,
                redactedBlob,
                sourceFiles: [singleFileName],
              });
              cardIdx++;
            } else {
              console.error(`File not found: ${singleFileName}`);
              continue;
            }
          }
        } catch (error) {
          console.error(`Error processing card ${i} in ${folder.folderName}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error in categorization/grouping for ${folder.folderName}:`, error);
    }
    
    return cards;
  };

  const processImages = useCallback(async () => {
    if (folderStructure.length === 0) {
      toast.error('Please upload the main folder with customer subfolders');
      return;
    }

    setStatus('processing');
    setProcessedCount(0);
    setErrorMessage('');
    setRedactedCards([]);

    const allCards: RedactedCard[] = [];
    
    for (let i = 0; i < folderStructure.length; i++) {
      const folder = folderStructure[i];
      setCurrentFolder(`${folder.customerName} (${i + 1}/${folderStructure.length})`);
      
      try {
        const cards = await processFolder(folder);
        allCards.push(...cards);
        setRedactedCards([...allCards]);
      } catch (error) {
        console.error(`Error processing folder ${folder.folderName}:`, error);
      }
      
      setProcessedCount(i + 1);
    }

    setRedactedCards(allCards);
    setStatus('complete');
    setCurrentFolder('');
    toast.success(`Processing complete! ${allCards.length} cards redacted.`);
  }, [folderStructure]);

  const handleDownloadAllOriginals = useCallback(async () => {
    if (redactedCards.length === 0) return;
    
    const files: ZipFile[] = redactedCards.map(card => ({
      name: `card${card.cardIndex + 1}.jpg`,
      blob: card.originalBlob,
      folder: `original/${card.folderName}`,
    }));
    
    await createAndDownloadZip(files, 'originals.zip');
    toast.success('Original images downloaded');
  }, [redactedCards]);

  const handleDownloadAllRedacted = useCallback(async () => {
    if (redactedCards.length === 0) return;
    
    const files: ZipFile[] = redactedCards.map(card => ({
      name: `card${card.cardIndex + 1}.jpg`,
      blob: card.redactedBlob,
      folder: `redacted/${card.folderName}`,
    }));
    
    await createAndDownloadZip(files, 'redacted.zip');
    toast.success('Redacted images downloaded');
  }, [redactedCards]);

  const handleDownloadAll = useCallback(async () => {
    if (redactedCards.length === 0) return;
    
    const files: ZipFile[] = [];
    
    for (const card of redactedCards) {
      files.push({
        name: `card${card.cardIndex + 1}.jpg`,
        blob: card.originalBlob,
        folder: `original/${card.folderName}`,
      });
      files.push({
        name: `card${card.cardIndex + 1}.jpg`,
        blob: card.redactedBlob,
        folder: `redacted/${card.folderName}`,
      });
    }
    
    await createAndDownloadZip(files, 'all_images.zip');
    toast.success('All images downloaded');
  }, [redactedCards]);

  const handleReset = useCallback(() => {
    setFolderStructure([]);
    setProcessedCount(0);
    setTotalCount(0);
    setCurrentFolder('');
    setStatus('idle');
    setErrorMessage('');
    setRedactedCards([]);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">CC Redaction Pipeline</h1>
                <p className="text-xs text-muted-foreground">
                  Folder-Based Credit Card Redaction
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <Link to="/">
                  <CreditCard className="w-4 h-4 mr-1" />
                  OCR Validator
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={status === 'processing'}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Reset
              </Button>
              {redactedCards.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadAllOriginals}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Originals ZIP
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadAllRedacted}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Redacted ZIP
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDownloadAll}
                  >
                    <Package className="w-4 h-4 mr-1" />
                    Download All
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
              1. Upload Main Folder
            </h2>
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors group">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <div className="p-3 bg-accent/10 rounded-full mb-3 group-hover:bg-accent/20 transition-colors">
                  <FolderOpen className="w-8 h-8 text-accent" />
                </div>
                <p className="mb-2 text-sm font-medium text-foreground">Select main folder</p>
                <p className="text-xs text-muted-foreground">Contains customer subfolders with credit card images</p>
                {folderStructure.length > 0 && (
                  <p className="mt-2 text-xs text-primary font-mono">
                    {folderStructure.length} folders loaded
                  </p>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                {...{ webkitdirectory: '', directory: '' } as any}
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    handleFolderUpload(Array.from(e.target.files));
                  }
                }}
              />
            </label>
          </div>

          {folderStructure.length > 0 && (
            <FolderUploadPreview 
              folders={folderStructure} 
              csvCustomers={[]}
            />
          )}

          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
              2. Process & Redact
            </h2>
            <Button
              className="w-full"
              size="lg"
              onClick={processImages}
              disabled={status === 'processing' || folderStructure.length === 0}
            >
              {status === 'processing' ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Redaction Pipeline
                </>
              )}
            </Button>
          </div>

          <ProcessingStatus
            currentFolder={currentFolder}
            processedCount={processedCount}
            totalCount={totalCount}
            status={status}
            errorMessage={errorMessage}
          />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Results
              </h2>
              {redactedCards.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {redactedCards.length} cards processed
                </span>
              )}
            </div>
            <RedactionResultsGallery results={redactedCards} />
          </div>
        </div>
      </main>
    </div>
  );
}

