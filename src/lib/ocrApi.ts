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
  
  if (data.Credit_Card_Number?.value) {
    const cleanedCCN = data.Credit_Card_Number.value.replace(/\D/g, '');
    console.log('OCR Extracted CCN:', data.Credit_Card_Number.value, '-> Cleaned:', cleanedCCN);
    return cleanedCCN;
  }
  
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
