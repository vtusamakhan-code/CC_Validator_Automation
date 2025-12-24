import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Download, Play, RefreshCw, FolderOpen, Shield } from 'lucide-react';
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
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim();
}

function normalizeCustomerName(name: string): string {
  if (!name) return '';
  // More aggressive normalization for customer names
  return name
    .toUpperCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\./g, '')    // Remove dots
    .replace(/,/g, '')      // Remove commas
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
    const normalizedCustomer = normalizeCustomerName(customerName);
    
    for (const folder of folderStructure) {
      const normalizedFolder = normalizeCustomerName(folder.customerName);
      
      // Exact match
      if (normalizedFolder === normalizedCustomer) {
        console.log(`✅ Exact match: "${customerName}" → "${folder.customerName}"`);
        return folder;
      }
      
      // Check if one contains the other (for partial matches)
      if (normalizedFolder.includes(normalizedCustomer) || normalizedCustomer.includes(normalizedFolder)) {
        console.log(`✅ Partial match: "${customerName}" → "${folder.customerName}"`);
        return folder;
      }
    }
    
    console.warn(`❌ No folder match for: "${customerName}"`);
    console.warn(`   Available folders:`, folderStructure.map(f => f.customerName));
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

    // Log comparison for debugging
    console.log(`\n📋 Processing Summary:`);
    console.log(`   CSV customers: ${customerGroups.size}`);
    console.log(`   Available folders: ${folderStructure.length}`);
    console.log(`\n📁 Available folders:`, folderStructure.map(f => f.customerName));
    console.log(`\n📄 CSV customers:`, Array.from(customerGroups.keys()));

    let processed = 0;
    const totalCustomers = customerGroups.size;
    let customerIndex = 0;

    for (const [customerName, rowIndices] of customerGroups) {
      customerIndex++;
      setCurrentFolder(`${customerName} (${customerIndex}/${totalCustomers})`);

      const folder = findMatchingFolder(customerName);
      
      if (!folder || folder.files.length === 0) {
        console.warn(`❌ No folder found for: "${customerName}"`);
        console.warn(`   Available folders:`, folderStructure.map(f => f.customerName));
        console.warn(`   CSV row indices:`, rowIndices);
        
        // Update CSV rows with NOT_FOUND when folder is missing
        for (const idx of rowIndices) {
          if (!updatedRows[idx]['CCN Actual']) {
            updatedRows[idx] = {
              ...updatedRows[idx],
              'CCN Actual': 'FOLDER_NOT_FOUND',
              'Luhn Test Actual': 'Fail',
            };
          }
        }
        
        processed += rowIndices.length;
        setProcessedCount(processed);
        continue;
      }
      
      console.log(`✅ Found folder for "${customerName}": ${folder.folderName} with ${folder.files.length} image(s)`);

      try {
        const imageCount = folder.files.length;
        
        if (imageCount === 1) {
          // Scenario 7: Single image - direct OCR, no categorization
          const filename = folder.files[0].name;
          console.log(`Single image for ${customerName}: ${filename}`);
          console.log(`CSV rows for ${customerName}:`, rowIndices.map(idx => ({
            filename: updatedRows[idx].filename,
            index: idx
          })));
          
          let ccn = '';
          let luhnResult = 'Fail';
          
          try {
            ccn = await sendToOCR(folder.files[0]);
            luhnResult = ccn ? (luhn_validate(ccn) ? 'Pass' : 'Fail') : 'Fail';
            console.log(`OCR result: ${ccn || 'NOT_FOUND'}, Luhn: ${luhnResult}`);
          } catch (error: any) {
            console.warn(`⚠️ OCR failed for ${customerName}:`, error.message);
            ccn = 'NOT_FOUND';
            luhnResult = 'Fail';
          }
          
          // Find CSV row by filename
          let matched = false;
          for (const idx of rowIndices) {
            if (normalizeForComparison(updatedRows[idx].filename) === normalizeForComparison(filename)) {
              console.log(`✅ Matched CSV row ${idx}: "${updatedRows[idx].filename}" with file "${filename}"`);
              updatedRows[idx] = {
                ...updatedRows[idx],
                'CCN Actual': ccn,
                'Luhn Test Actual': luhnResult,
              };
              matched = true;
            }
          }
          // If no filename match, update first row
          if (!matched) {
            console.warn(`⚠️ No CSV filename match found for "${filename}". Available CSV filenames:`, 
              rowIndices.map(idx => updatedRows[idx].filename));
            console.log(`   Updating first row ${rowIndices[0]} with filename: ${updatedRows[rowIndices[0]].filename}`);
            updatedRows[rowIndices[0]] = {
              ...updatedRows[rowIndices[0]],
              'CCN Actual': ccn,
              'Luhn Test Actual': luhnResult,
            };
          }
        } else {
          // Scenario 1: 2+ images - use categorize and group APIs
          let cardPairs: CreditCardPair[] = [];
          let groupingFailed = false;
          
          try {
            const categorizeResult = await categorizeImages(folder.files);
            cardPairs = await groupCreditCards(folder.files, categorizeResult);
            console.log(`Processing ${cardPairs.length} card(s) for ${customerName}`);
          } catch (error: any) {
            console.warn(`⚠️ Grouping failed for ${customerName}:`, error.message);
            console.warn(`   Will try to process images individually`);
            groupingFailed = true;
            // Create individual pairs for each file
            cardPairs = folder.files.map(file => ({ front: file.name, back: '' }));
          }
          
          console.log(`Available files in folder:`, folder.files.map(f => f.name));
          
          // If no pairs found, process all files individually
          if (cardPairs.length === 0) {
            console.warn(`⚠️ No card pairs found. Processing all ${folder.files.length} files individually`);
            cardPairs = folder.files.map(file => ({ front: file.name, back: '' }));
          }
          
          // Process each card pair
          for (const pair of cardPairs) {
            let imageBlob: Blob;
            let matchFilenames: string[] = [];
            let frontFile: File | undefined;
            let backFile: File | undefined;
            
            if (pair.front && pair.back) {
              // Scenario 2: Paired card (front + back) - combine vertically
              // Use normalized comparison to handle case differences
              frontFile = folder.files.find(f => 
                normalizeForComparison(f.name) === normalizeForComparison(pair.front) ||
                f.name === pair.front
              );
              backFile = folder.files.find(f => 
                normalizeForComparison(f.name) === normalizeForComparison(pair.back) ||
                f.name === pair.back
              );
              
              if (frontFile && backFile) {
                imageBlob = await combineImagesVertically([frontFile, backFile]);
                matchFilenames = [frontFile.name, backFile.name]; // Use actual file names
                console.log(`Matched files: front=${frontFile.name}, back=${backFile.name}`);
              } else {
                console.error(`Files not found for ${customerName}:`);
                console.error(`  API returned: front="${pair.front}", back="${pair.back}"`);
                console.error(`  Available files:`, folder.files.map(f => f.name));
                if (!frontFile) console.error(`  ❌ Front file "${pair.front}" not found`);
                if (!backFile) console.error(`  ❌ Back file "${pair.back}" not found`);
                
                // Still update CSV rows with NOT_FOUND even if files don't match
                const missingFiles = [pair.front, pair.back].filter(f => f);
                for (const idx of rowIndices) {
                  const rowFilename = updatedRows[idx].filename;
                  if (missingFiles.some(f => normalizeForComparison(f) === normalizeForComparison(rowFilename))) {
                    console.log(`   Updating CSV row ${idx} with NOT_FOUND for missing file`);
                    updatedRows[idx] = {
                      ...updatedRows[idx],
                      'CCN Actual': 'NOT_FOUND',
                      'Luhn Test Actual': 'Fail',
                    };
                  }
                }
                continue;
              }
            } else {
              // Scenario 3: Non-paired card (only front OR back)
              const singleFileName = pair.front || pair.back;
              const singleFile = folder.files.find(f => 
                normalizeForComparison(f.name) === normalizeForComparison(singleFileName) ||
                f.name === singleFileName
              );
              
              if (singleFile) {
                imageBlob = singleFile;
                matchFilenames = [singleFile.name]; // Use actual file name
                console.log(`Matched file: ${singleFile.name}`);
              } else {
                console.error(`File not found for ${customerName}:`);
                console.error(`  API returned: "${singleFileName}"`);
                console.error(`  Available files:`, folder.files.map(f => f.name));
                
                // Still update CSV row with NOT_FOUND if filename matches
                for (const idx of rowIndices) {
                  const rowFilename = updatedRows[idx].filename;
                  if (normalizeForComparison(singleFileName) === normalizeForComparison(rowFilename)) {
                    console.log(`   Updating CSV row ${idx} with NOT_FOUND for missing file`);
                    updatedRows[idx] = {
                      ...updatedRows[idx],
                      'CCN Actual': 'NOT_FOUND',
                      'Luhn Test Actual': 'Fail',
                    };
                  }
                }
                continue;
              }
            }
            
            // Call OCR
            let ccn = '';
            let luhnResult = 'Fail';
            
            try {
              ccn = await sendToOCR(imageBlob);
              luhnResult = ccn ? (luhn_validate(ccn) ? 'Pass' : 'Fail') : 'Fail';
              console.log(`Card OCR result: ${ccn || 'NOT_FOUND'}, Luhn: ${luhnResult}`);
            } catch (error: any) {
              console.warn(`⚠️ OCR failed for merged image (${matchFilenames.join(', ')}):`, error.message);
              
              // Fallback: If merged image failed and we have front+back, try processing separately
              if (pair.front && pair.back && frontFile && backFile) {
                console.log(`   🔄 Trying to process front and back separately...`);
                
                // Try front image first
                try {
                  const frontCCN = await sendToOCR(frontFile);
                  if (frontCCN && frontCCN.trim() !== '') {
                    ccn = frontCCN;
                    luhnResult = luhn_validate(ccn) ? 'Pass' : 'Fail';
                    console.log(`   ✅ Found CCN in front image: ${ccn}`);
                  }
                } catch (frontError: any) {
                  console.warn(`   ⚠️ Front image OCR also failed:`, frontError.message);
                }
                
                // If front didn't work, try back image
                if (!ccn || ccn.trim() === '') {
                  try {
                    const backCCN = await sendToOCR(backFile);
                    if (backCCN && backCCN.trim() !== '') {
                      ccn = backCCN;
                      luhnResult = luhn_validate(ccn) ? 'Pass' : 'Fail';
                      console.log(`   ✅ Found CCN in back image: ${ccn}`);
                    }
                  } catch (backError: any) {
                    console.warn(`   ⚠️ Back image OCR also failed:`, backError.message);
                  }
                }
                
                // If still no CCN found, mark as NOT_FOUND
                if (!ccn || ccn.trim() === '') {
                  ccn = 'NOT_FOUND';
                  luhnResult = 'Fail';
                  console.warn(`   ❌ Could not find CCN in either front or back image`);
                }
              } else {
                // Not a paired card or files not available, just mark as NOT_FOUND
                ccn = 'NOT_FOUND';
                luhnResult = 'Fail';
              }
            }
            console.log(`Looking for CSV rows with filenames:`, matchFilenames);
            console.log(`CSV rows for ${customerName}:`, rowIndices.map(idx => ({
              filename: updatedRows[idx].filename,
              index: idx
            })));
            
            // Update CSV rows matching these filenames
            let updatedCount = 0;
            const updatedIndices = new Set<number>();
            
            for (const idx of rowIndices) {
              const rowFilename = updatedRows[idx].filename;
              const normalizedRowFilename = normalizeForComparison(rowFilename);
              
              for (const matchFilename of matchFilenames) {
                const normalizedMatchFilename = normalizeForComparison(matchFilename);
                if (normalizedMatchFilename === normalizedRowFilename) {
                  console.log(`✅ Matched CSV row ${idx}: "${rowFilename}" with file "${matchFilename}"`);
                  updatedRows[idx] = {
                    ...updatedRows[idx],
                    'CCN Actual': ccn,
                    'Luhn Test Actual': luhnResult,
                  };
                  updatedIndices.add(idx);
                  updatedCount++;
                  break; // Found match for this row, move to next row
                }
              }
            }
            
            // If no filename match found, try to update empty rows
            if (updatedCount === 0) {
              console.warn(`⚠️ No CSV filename match found. Available CSV filenames:`, 
                rowIndices.map(idx => updatedRows[idx].filename));
              console.warn(`   Trying to update empty rows...`);
              for (const idx of rowIndices) {
                if (!updatedRows[idx]['CCN Actual'] && !updatedIndices.has(idx)) {
                  console.log(`   Updating empty row ${idx} with filename: ${updatedRows[idx].filename}`);
                  updatedRows[idx] = {
                    ...updatedRows[idx],
                    'CCN Actual': ccn,
                    'Luhn Test Actual': luhnResult,
                  };
                  updatedIndices.add(idx);
                  updatedCount++;
                  // For paired cards, update up to 2 rows; for single, update 1
                  if (matchFilenames.length === 1 || updatedCount >= 2) {
                    break;
                  }
                }
              }
              } else {
              console.log(`   Updated ${updatedCount} CSV row(s) with CCN: ${ccn}`);
            }
          }
          
          // Fallback: Process any remaining files that weren't matched
          if (imageCount > 1) {
            const processedFiles = new Set<string>();
            cardPairs.forEach(pair => {
              if (pair.front) processedFiles.add(pair.front);
              if (pair.back) processedFiles.add(pair.back);
            });
            
            const unprocessedFiles = folder.files.filter(f => !processedFiles.has(f.name));
            if (unprocessedFiles.length > 0) {
              console.warn(`⚠️ Found ${unprocessedFiles.length} unprocessed file(s) for ${customerName}:`, 
                unprocessedFiles.map(f => f.name));
              
              for (const file of unprocessedFiles) {
                let ccn = '';
                let luhnResult = 'Fail';
                
                try {
                  ccn = await sendToOCR(file);
                  luhnResult = ccn ? (luhn_validate(ccn) ? 'Pass' : 'Fail') : 'Fail';
                  console.log(`   Processed ungrouped file ${file.name}: ${ccn || 'NOT_FOUND'}`);
                } catch (error: any) {
                  console.warn(`   OCR failed for ${file.name}:`, error.message);
                  ccn = 'NOT_FOUND';
                  luhnResult = 'Fail';
                }
                
                // Update matching CSV rows
                for (const idx of rowIndices) {
                  const rowFilename = updatedRows[idx].filename;
                  if (normalizeForComparison(rowFilename) === normalizeForComparison(file.name)) {
                    if (!updatedRows[idx]['CCN Actual']) {
                      console.log(`   ✅ Updated CSV row ${idx} for ungrouped file ${file.name}`);
                      updatedRows[idx] = {
                        ...updatedRows[idx],
                        'CCN Actual': ccn,
                        'Luhn Test Actual': luhnResult,
                      };
                    }
                  }
                }
              }
            }
          }
        }

        // Update state immediately after each customer
        setCsvRows([...updatedRows]);
        processed += rowIndices.length;
        setProcessedCount(processed);
        
      } catch (error: any) {
        console.error(`Error processing ${customerName}:`, error.message);
        
        // Still update CSV rows with error status
        for (const idx of rowIndices) {
          if (!updatedRows[idx]['CCN Actual']) {
            updatedRows[idx] = {
              ...updatedRows[idx],
              'CCN Actual': 'PROCESSING_ERROR',
              'Luhn Test Actual': 'Fail',
            };
          }
        }
        
        processed += rowIndices.length;
        setProcessedCount(processed);
      }
    }

    setCsvRows(updatedRows);
    setStatus('complete');
    setCurrentFolder('');
    
    // Summary logging
    const updatedCount = updatedRows.filter(r => r['CCN Actual']).length;
    const totalRows = updatedRows.length;
    console.log(`\n📊 Processing Summary:`);
    console.log(`   Total CSV rows: ${totalRows}`);
    console.log(`   Rows with CCN Actual: ${updatedCount}`);
    console.log(`   Rows without CCN: ${totalRows - updatedCount}`);
    
    if (updatedCount < totalRows) {
      const missingRows = updatedRows
        .map((row, idx) => ({ idx, name: row['Customer name'], filename: row.filename, hasCCN: !!row['CCN Actual'] }))
        .filter(r => !r.hasCCN);
      console.warn(`   ⚠️ Rows without CCN Actual:`, missingRows);
    }
    
    toast.success(`Processing complete! ${updatedCount}/${totalRows} rows processed.`);
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
                variant="ghost"
                size="sm"
                asChild
              >
                <Link to="/redaction">
                  <Shield className="w-4 h-4 mr-1" />
                  Redaction Pipeline
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
