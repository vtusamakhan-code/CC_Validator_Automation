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
