const OCR_BASE_URL = 'https://gb-ocr-stage.vertekx.com';

export interface OCRResponse {
  Credit_Card_Number?: {
    value: string;
    confidence: number;
  };
  [key: string]: unknown;
}

export interface CategorizeResponse {
  categories: Array<{
    type: string;
    files: Array<{
      front: string;
      back: string;
    }>;
  }>;
}

export interface GroupCreditCardsResponse {
  credit_cards_group: Array<{
    type: string;
    files: Array<{
      front: string;
      back: string;
    }>;
  }>;
}

export interface CreditCardPair {
  front: string;
  back: string;
}

// Redaction API Types
export interface PolygonPoint {
  x: number;
  y: number;
}

export interface RedactionBox {
  page: number;
  polygon: PolygonPoint[];
}

export interface PageInfo {
  page: number;
  width: number;
  height: number;
  unit: string;
}

export interface RedactionMetadata {
  pages: PageInfo[];
  card_number_boxes: RedactionBox[];
  cvc_boxes: RedactionBox[];
}

export interface RedactionResponse {
  document_type: {
    value: string;
    confidence: number;
  };
  redaction_metadata: RedactionMetadata;
}

export async function sendToOCR(imageBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'credit_card.jpg');

  const response = await fetch(`${OCR_BASE_URL}/credit_card`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR API error: ${response.status} ${response.statusText}`);
  }

  const data: OCRResponse = await response.json();
  
  console.log('OCR Raw Response:', JSON.stringify(data, null, 2));
  
  // Check if value exists and is not empty
  if (data.Credit_Card_Number?.value && data.Credit_Card_Number.value.trim() !== '') {
    const cleanedCCN = data.Credit_Card_Number.value.replace(/\D/g, '');
    if (cleanedCCN.length > 0) {
      console.log('OCR Extracted CCN:', data.Credit_Card_Number.value, '-> Cleaned:', cleanedCCN);
      return cleanedCCN;
    }
  }
  
  // Log the issue for debugging
  console.warn('⚠️ OCR returned empty card number. Confidence:', data.Credit_Card_Number?.confidence);
  throw new Error('No credit card number found in image');
}

export async function categorizeImages(files: File[]): Promise<CategorizeResponse> {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file, file.name);
  });

  const response = await fetch(`${OCR_BASE_URL}/categorize`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Categorize API error: ${response.status} ${response.statusText}`);
  }

  const data: CategorizeResponse = await response.json();
  console.log('Categorize Response:', JSON.stringify(data, null, 2));
  return data;
}

export async function groupCreditCards(
  files: File[], 
  documentStructure: CategorizeResponse
): Promise<CreditCardPair[]> {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file, file.name);
  });
  formData.append('document_structure', JSON.stringify(documentStructure));

  const response = await fetch(`${OCR_BASE_URL}/group_credit_cards`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Group Credit Cards API error: ${response.status} ${response.statusText}`);
  }

  const data: GroupCreditCardsResponse = await response.json();
  console.log('Group Credit Cards Response:', JSON.stringify(data, null, 2));

  // Flatten all pairs from all groups
  const pairs: CreditCardPair[] = [];
  for (const group of data.credit_cards_group) {
    for (const filePair of group.files) {
      pairs.push({ front: filePair.front, back: filePair.back });
    }
  }
  return pairs;
}

export async function getRedactionMetadata(imageBlob: Blob): Promise<RedactionResponse> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'credit_card.jpg');

  const response = await fetch(`${OCR_BASE_URL}/credit_card`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Redaction API error: ${response.status} ${response.statusText}`);
  }

  const data: RedactionResponse = await response.json();
  console.log('Redaction Response:', JSON.stringify(data, null, 2));
  return data;
}
