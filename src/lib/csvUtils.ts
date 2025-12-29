export interface CSVRow {
  'Customer name': string;
  filename: string;
  'CCN Expected': string;
  'CCN Actual': string;
  'Luhn test Expected'?: string; // Legacy name
  'Luhn/BIN Expected'?: string; // New name
  'Luhn Test Actual'?: string; // Legacy name
  'Luhn/BIN Actual'?: string; // New name
  [key: string]: string | undefined;
}

// Helper function to get the correct column name for Luhn/BIN Expected
export function getLuhnBinExpectedColumn(row: CSVRow): string {
  return row['Luhn/BIN Expected'] !== undefined ? 'Luhn/BIN Expected' : 'Luhn test Expected';
}

// Helper function to get the correct column name for Luhn/BIN Actual
export function getLuhnBinActualColumn(row: CSVRow): string {
  return row['Luhn/BIN Actual'] !== undefined ? 'Luhn/BIN Actual' : 'Luhn Test Actual';
}

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Parse rows
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRow = {} as CSVRow;
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

export function generateCSV(rows: CSVRow[]): string {
  if (rows.length === 0) return '';

  // Exclude image URL columns from CSV output - they're only for UI display
  // Detect which column names are used in the data
  const hasNewFormat = rows.length > 0 && (
    rows[0]['Luhn/BIN Expected'] !== undefined || 
    rows[0]['Luhn/BIN Actual'] !== undefined
  );
  
  const headers = hasNewFormat
    ? ['Customer name', 'filename', 'CCN Expected', 'CCN Actual', 'Luhn/BIN Expected', 'Luhn/BIN Actual']
    : ['Customer name', 'filename', 'CCN Expected', 'CCN Actual', 'Luhn test Expected', 'Luhn Test Actual'];
  
  const escapeValue = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const headerLine = headers.map(escapeValue).join(',');
  const dataLines = rows.map(row => 
    headers.map(h => escapeValue(row[h] || '')).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
