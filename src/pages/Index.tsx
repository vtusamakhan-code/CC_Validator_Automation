import { useState, useCallback } from 'react';
import { CreditCard, Download, Play, RefreshCw, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/FileUpload';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { ResultsTable } from '@/components/ResultsTable';
import { FolderUploadPreview } from '@/components/FolderUploadPreview';
import { parseCSV, generateCSV, downloadCSV, CSVRow } from '@/lib/csvUtils';
import { sendToOCR, categorizeImages, groupCreditCards, CreditCardPair } from '@/lib/ocrApi';
import { luhn_validate } from '@/lib/luhn';
import { combineImagesVertically } from '@/lib/imageUtils';
import { toast } from 'sonner';

export interface FolderStructure {
  folderName: string;
  customerName: string;
  files: File[];
}

function extractCustomerName(folderName: string): string {
  // Folder names are like "CUSTOMER_NAME_hash" 
  // Remove the hash suffix (last part after underscore followed by hex)
  const parts = folderName.split('_');
  // Find where the hash starts (typically last segment is a hash)
  // Hash is usually 8+ hex characters at the end
  const hashPattern = /^[a-f0-9]{8,}$/i;
  
  let customerParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (hashPattern.test(parts[i]) && i > 0) {
      // This looks like the hash, stop here
      break;
    }
    customerParts.push(parts[i]);
  }
  
  // Convert underscores to spaces and normalize
  return customerParts.join(' ').trim();
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function Index() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [folderStructure, setFolderStructure] = useState<FolderStructure[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentFolder, setCurrentFolder] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleCSVUpload = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      setCsvFile(file);
      setCsvRows(rows);
      setStatus('idle');
      setProcessedCount(0);
      toast.success(`Loaded ${rows.length} rows from CSV`);
    } catch (error) {
      toast.error('Failed to parse CSV file');
    }
  }, []);

  const handleFolderUpload = useCallback((files: File[]) => {
    // Group files by their parent folder
    const folderMap = new Map<string, File[]>();
    
    for (const file of files) {
      // webkitRelativePath gives us path like "main_folder/subfolder/image.jpg"
      const pathParts = file.webkitRelativePath.split('/');
      
      if (pathParts.length >= 2) {
        // Get the subfolder name (second level)
        const subfolderName = pathParts[1];
        
        // Only include image files
        if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name)) {
          if (!folderMap.has(subfolderName)) {
            folderMap.set(subfolderName, []);
          }
          folderMap.get(subfolderName)!.push(file);
        }
      }
    }

    // Convert to FolderStructure array
    const structure: FolderStructure[] = [];
    for (const [folderName, files] of folderMap) {
      const customerName = extractCustomerName(folderName);
      structure.push({
        folderName,
        customerName,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    // Sort by customer name
    structure.sort((a, b) => a.customerName.localeCompare(b.customerName));
    
    setFolderStructure(structure);
    toast.success(`Found ${structure.length} customer folders with ${files.filter(f => f.type.startsWith('image/')).length} images`);
  }, []);

  const findMatchingFolder = useCallback((customerName: string): FolderStructure | null => {
    const normalizedCustomer = normalizeForComparison(customerName);
    
    for (const folder of folderStructure) {
      const normalizedFolder = normalizeForComparison(folder.customerName);
      
      // Check if names match (allowing for slight variations)
      if (normalizedFolder === normalizedCustomer) {
        return folder;
      }
      
      // Also check if one contains the other
      if (normalizedFolder.includes(normalizedCustomer) || normalizedCustomer.includes(normalizedFolder)) {
        return folder;
      }
    }
    
    return null;
  }, [folderStructure]);

  const processImages = useCallback(async () => {
    if (csvRows.length === 0) {
      toast.error('Please upload a CSV file first');
      return;
    }

    if (folderStructure.length === 0) {
      toast.error('Please upload the main folder with customer subfolders');
      return;
    }

    setStatus('processing');
    setProcessedCount(0);
    setErrorMessage('');

    const updatedRows = [...csvRows];
    
    // Group CSV rows by customer name
    const customerGroups = new Map<string, number[]>();
    csvRows.forEach((row, index) => {
      const name = row['Customer name'];
      if (!customerGroups.has(name)) {
        customerGroups.set(name, []);
      }
      customerGroups.get(name)!.push(index);
    });

    let processed = 0;
    const totalCustomers = customerGroups.size;
    let customerIndex = 0;

    for (const [customerName, rowIndices] of customerGroups) {
      customerIndex++;
      setCurrentFolder(`${customerName} (${customerIndex}/${totalCustomers})`);

      const folder = findMatchingFolder(customerName);
      
      if (!folder || folder.files.length === 0) {
        console.log(`No folder found for: ${customerName}`);
        processed += rowIndices.length;
        setProcessedCount(processed);
        continue;
      }

      try {
        const imageCount = folder.files.length;
        
        if (imageCount === 1) {
          // Scenario 7: Single image - direct OCR, no categorization
          const ccn = await sendToOCR(folder.files[0]);
          const luhnResult = luhn_validate(ccn) ? 'Pass' : 'Fail';
          
          // Find CSV row by filename
          const filename = folder.files[0].name;
          for (const idx of rowIndices) {
            if (normalizeForComparison(updatedRows[idx].filename) === normalizeForComparison(filename)) {
              updatedRows[idx] = {
                ...updatedRows[idx],
                'CCN Actual': ccn,
                'Luhn Test Actual': luhnResult,
              };
            }
          }
          // If no filename match, update first row
          if (!rowIndices.some(idx => normalizeForComparison(updatedRows[idx].filename) === normalizeForComparison(filename))) {
            updatedRows[rowIndices[0]] = {
              ...updatedRows[rowIndices[0]],
              'CCN Actual': ccn,
              'Luhn Test Actual': luhnResult,
            };
          }
        } else {
          // Scenario 1: 2+ images - use categorize and group APIs
          const categorizeResult = await categorizeImages(folder.files);
          const cardPairs = await groupCreditCards(folder.files, categorizeResult);
          
          console.log(`Processing ${cardPairs.length} card(s) for ${customerName}`);
          
          // Process each card pair
          for (const pair of cardPairs) {
            let imageBlob: Blob;
            let matchFilenames: string[] = [];
            
            if (pair.front && pair.back) {
              // Scenario 2: Paired card (front + back) - combine vertically
              const frontFile = folder.files.find(f => f.name === pair.front);
              const backFile = folder.files.find(f => f.name === pair.back);
              
              if (frontFile && backFile) {
                imageBlob = await combineImagesVertically([frontFile, backFile]);
                matchFilenames = [pair.front, pair.back];
              } else {
                console.error(`Files not found: front=${pair.front}, back=${pair.back}`);
                continue;
              }
            } else {
              // Scenario 3: Non-paired card (only front OR back)
              const singleFileName = pair.front || pair.back;
              const singleFile = folder.files.find(f => f.name === singleFileName);
              
              if (singleFile) {
                imageBlob = singleFile;
                matchFilenames = [singleFileName];
              } else {
                console.error(`File not found: ${singleFileName}`);
                continue;
              }
            }
            
            // Call OCR
            const ccn = await sendToOCR(imageBlob);
            const luhnResult = luhn_validate(ccn) ? 'Pass' : 'Fail';
            
            console.log(`Card OCR result: ${ccn}, Luhn: ${luhnResult}`);
            
            // Update CSV rows matching these filenames
            let updated = false;
            for (const idx of rowIndices) {
              const rowFilename = updatedRows[idx].filename;
              if (matchFilenames.some(fn => normalizeForComparison(fn) === normalizeForComparison(rowFilename))) {
                updatedRows[idx] = {
                  ...updatedRows[idx],
                  'CCN Actual': ccn,
                  'Luhn Test Actual': luhnResult,
                };
                updated = true;
              }
            }
            
            // If no filename match found, try to update an empty row
            if (!updated) {
              for (const idx of rowIndices) {
                if (!updatedRows[idx]['CCN Actual']) {
                  updatedRows[idx] = {
                    ...updatedRows[idx],
                    'CCN Actual': ccn,
                    'Luhn Test Actual': luhnResult,
                  };
                  break;
                }
              }
            }
          }
        }

        // Update state immediately after each customer
        setCsvRows([...updatedRows]);
        processed += rowIndices.length;
        setProcessedCount(processed);
        
      } catch (error) {
        console.error(`Error processing ${customerName}:`, error);
        processed += rowIndices.length;
        setProcessedCount(processed);
      }
    }

    setCsvRows(updatedRows);
    setStatus('complete');
    setCurrentFolder('');
    toast.success('Processing complete!');
  }, [csvRows, folderStructure, findMatchingFolder]);

  const handleDownload = useCallback(() => {
    if (csvRows.length === 0) return;
    const csvContent = generateCSV(csvRows);
    const filename = csvFile?.name.replace('.csv', '_validated.csv') || 'validated_results.csv';
    downloadCSV(csvContent, filename);
    toast.success('CSV downloaded successfully');
  }, [csvRows, csvFile]);

  const handleReset = useCallback(() => {
    setCsvFile(null);
    setCsvRows([]);
    setFolderStructure([]);
    setProcessedCount(0);
    setCurrentFolder('');
    setStatus('idle');
    setErrorMessage('');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CreditCard className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">CC OCR Validator</h1>
                <p className="text-xs text-muted-foreground">
                  Automated Credit Card OCR & Validation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={status === 'processing'}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleDownload}
                disabled={csvRows.length === 0}
              >
                <Download className="w-4 h-4 mr-1" />
                Download CSV
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
              1. Upload CSV
            </h2>
            <FileUpload
              accept=".csv"
              onFilesSelected={handleCSVUpload}
              label="Drop CSV file here"
              description="or click to browse"
              icon="csv"
              files={csvFile ? [csvFile] : []}
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
              2. Upload Main Folder
            </h2>
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-lg cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors group">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <div className="p-3 bg-accent/10 rounded-full mb-3 group-hover:bg-accent/20 transition-colors">
                  <FolderOpen className="w-8 h-8 text-accent" />
                </div>
                <p className="mb-2 text-sm font-medium text-foreground">Select main folder</p>
                <p className="text-xs text-muted-foreground">Contains customer subfolders</p>
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
              csvCustomers={csvRows.map(r => r['Customer name'])}
            />
          )}

          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
              3. Process
            </h2>
            <Button
              className="w-full"
              size="lg"
              onClick={processImages}
              disabled={status === 'processing' || csvRows.length === 0 || folderStructure.length === 0}
            >
              {status === 'processing' ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start OCR Processing
                </>
              )}
            </Button>
          </div>

          <ProcessingStatus
            currentFolder={currentFolder}
            processedCount={processedCount}
            totalCount={csvRows.length}
            status={status}
            errorMessage={errorMessage}
          />

          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
              Results
            </h2>
            <ResultsTable rows={csvRows} />
            
            {csvRows.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {csvRows.filter(r => r['CCN Actual']).length} of {csvRows.length} processed
                </span>
                <span>
                  {csvRows.filter(r => r['Luhn Test Actual'] === 'Pass').length} passed Luhn validation
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
