import { RedactionMetadata, PolygonPoint } from './ocrApi';

export async function combineImagesVertically(images: File[]): Promise<Blob> {
  const loadedImages = await Promise.all(
    images.map((file) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    })
  );

  const totalHeight = loadedImages.reduce((sum, img) => sum + img.height, 0);
  const maxWidth = Math.max(...loadedImages.map((img) => img.width));

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  let currentY = 0;
  for (const img of loadedImages) {
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;
    URL.revokeObjectURL(img.src);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    }, 'image/jpeg', 0.9);
  });
}

export async function combineImagesVerticallyFromBlobs(images: Blob[]): Promise<Blob> {
  const loadedImages = await Promise.all(
    images.map((blob) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });
    })
  );

  const totalHeight = loadedImages.reduce((sum, img) => sum + img.height, 0);
  const maxWidth = Math.max(...loadedImages.map((img) => img.width));

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  let currentY = 0;
  for (const img of loadedImages) {
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;
    URL.revokeObjectURL(img.src);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    }, 'image/jpeg', 0.9);
  });
}

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function expandPolygonCVC(polygon: PolygonPoint[], widthFactor: number, heightFactor: number): PolygonPoint[] {
  if (polygon.length < 3) return polygon;
  
  // Find bounds
  const minX = Math.min(...polygon.map(p => p.x));
  const minY = Math.min(...polygon.map(p => p.y));
  
  // Expand: width to the right, height downward
  return polygon.map(p => ({
    x: minX + (p.x - minX) * widthFactor,
    y: minY + (p.y - minY) * heightFactor
  }));
}

function drawPolygonMask(
  ctx: CanvasRenderingContext2D, 
  polygon: PolygonPoint[], 
  scaleX: number, 
  scaleY: number
) {
  if (polygon.length < 3) return;
  
  ctx.beginPath();
  ctx.moveTo(polygon[0].x * scaleX, polygon[0].y * scaleY);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x * scaleX, polygon[i].y * scaleY);
  }
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.fill();
}

export async function applyRedactionToImage(
  imageBlob: Blob,
  redactionMetadata: RedactionMetadata
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Calculate scale factors if API dimensions differ from actual image
      const pageInfo = redactionMetadata.pages[0];
      const scaleX = pageInfo ? img.width / pageInfo.width : 1;
      const scaleY = pageInfo ? img.height / pageInfo.height : 1;
      
      // Apply black mask to card number boxes
      for (const box of redactionMetadata.card_number_boxes) {
        drawPolygonMask(ctx, box.polygon, scaleX, scaleY);
      }
      
      // Apply black mask to CVC boxes (with 4x width and 2x height expansion)
      for (const box of redactionMetadata.cvc_boxes) {
        const expandedPolygon = expandPolygonCVC(box.polygon, 4, 2);
        drawPolygonMask(ctx, expandedPolygon, scaleX, scaleY);
      }
      
      URL.revokeObjectURL(img.src);
      
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create redacted image blob'));
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for redaction'));
    };
    
    img.src = URL.createObjectURL(imageBlob);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface SeparateRedactionResult {
  frontOriginal: Blob;
  frontRedacted: Blob;
  backOriginal: Blob;
  backRedacted: Blob;
  frontFilename: string;
  backFilename: string;
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

async function applyRedactionToSingleImage(
  imageBlob: Blob,
  boxes: RedactionBox[],
  isCVC: boolean,
  pageWidth: number,
  pageHeight: number
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const img = await loadImageFromBlob(imageBlob);
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      
      const scaleX = img.width / pageWidth;
      const scaleY = img.height / pageHeight;
      
      for (const box of boxes) {
        let polygon = box.polygon;
        if (isCVC) {
          polygon = expandPolygonCVC(polygon, 4, 2);
        }
        drawPolygonMask(ctx, polygon, scaleX, scaleY);
      }
      
      URL.revokeObjectURL(img.src);
      
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create redacted image blob'));
      }, 'image/jpeg', 0.95);
    } catch (error) {
      reject(error);
    }
  });
}

export async function applyRedactionToSeparateImages(
  frontFile: File,
  backFile: File,
  redactionMetadata: RedactionMetadata,
  mergedImageHeight: number
): Promise<SeparateRedactionResult> {
  // Load both images to get their heights
  const frontImg = await loadImageFromBlob(frontFile);
  const backImg = await loadImageFromBlob(backFile);
  
  const frontHeight = frontImg.height;
  const backHeight = backImg.height;
  
  URL.revokeObjectURL(frontImg.src);
  URL.revokeObjectURL(backImg.src);
  
  // Get page info from API response
  const pageInfo = redactionMetadata.pages[0];
  const apiImageWidth = pageInfo?.width || 1;
  const apiImageHeight = pageInfo?.height || mergedImageHeight;
  
  // Calculate the split point in API coordinates
  // The ratio of front height to total merged height
  const frontRatio = frontHeight / (frontHeight + backHeight);
  const apiFrontHeight = apiImageHeight * frontRatio;
  
  // Separate boxes for front and back images
  const frontCardBoxes: RedactionBox[] = [];
  const frontCvcBoxes: RedactionBox[] = [];
  const backCardBoxes: RedactionBox[] = [];
  const backCvcBoxes: RedactionBox[] = [];
  
  // Split card number boxes
  for (const box of redactionMetadata.card_number_boxes) {
    const avgY = box.polygon.reduce((sum, p) => sum + p.y, 0) / box.polygon.length;
    
    if (avgY < apiFrontHeight) {
      // Box belongs to front image
      frontCardBoxes.push(box);
    } else {
      // Box belongs to back image - adjust y coordinates
      const adjustedPolygon = box.polygon.map(p => ({
        x: p.x,
        y: p.y - apiFrontHeight
      }));
      backCardBoxes.push({ ...box, polygon: adjustedPolygon });
    }
  }
  
  // Split CVC boxes
  for (const box of redactionMetadata.cvc_boxes) {
    const avgY = box.polygon.reduce((sum, p) => sum + p.y, 0) / box.polygon.length;
    
    if (avgY < apiFrontHeight) {
      // Box belongs to front image
      frontCvcBoxes.push(box);
    } else {
      // Box belongs to back image - adjust y coordinates
      const adjustedPolygon = box.polygon.map(p => ({
        x: p.x,
        y: p.y - apiFrontHeight
      }));
      backCvcBoxes.push({ ...box, polygon: adjustedPolygon });
    }
  }
  
  // Calculate separate page dimensions for each image
  const frontPageWidth = apiImageWidth;
  const frontPageHeight = apiFrontHeight;
  const backPageWidth = apiImageWidth;
  const backPageHeight = apiImageHeight - apiFrontHeight;
  
  // Apply redaction to front image
  let frontRedacted: Blob = frontFile;
  if (frontCardBoxes.length > 0 || frontCvcBoxes.length > 0) {
    // Apply card number boxes
    if (frontCardBoxes.length > 0) {
      frontRedacted = await applyRedactionToSingleImage(
        frontRedacted,
        frontCardBoxes,
        false,
        frontPageWidth,
        frontPageHeight
      );
    }
    // Apply CVC boxes
    if (frontCvcBoxes.length > 0) {
      frontRedacted = await applyRedactionToSingleImage(
        frontRedacted,
        frontCvcBoxes,
        true,
        frontPageWidth,
        frontPageHeight
      );
    }
  }
  
  // Apply redaction to back image
  let backRedacted: Blob = backFile;
  if (backCardBoxes.length > 0 || backCvcBoxes.length > 0) {
    // Apply card number boxes
    if (backCardBoxes.length > 0) {
      backRedacted = await applyRedactionToSingleImage(
        backRedacted,
        backCardBoxes,
        false,
        backPageWidth,
        backPageHeight
      );
    }
    // Apply CVC boxes
    if (backCvcBoxes.length > 0) {
      backRedacted = await applyRedactionToSingleImage(
        backRedacted,
        backCvcBoxes,
        true,
        backPageWidth,
        backPageHeight
      );
    }
  }
  
  return {
    frontOriginal: frontFile,
    frontRedacted,
    backOriginal: backFile,
    backRedacted,
    frontFilename: frontFile.name,
    backFilename: backFile.name
  };
}
