import JSZip from 'jszip';

export interface ZipFile {
  name: string;
  blob: Blob;
  folder?: string;
}

export async function createAndDownloadZip(files: ZipFile[], zipName: string): Promise<void> {
  const zip = new JSZip();
  
  for (const file of files) {
    if (file.folder) {
      zip.folder(file.folder)?.file(file.name, file.blob);
    } else {
      zip.file(file.name, file.blob);
    }
  }
  
  const content = await zip.generateAsync({ type: 'blob' });
  
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function createZipBlob(files: ZipFile[]): Promise<Blob> {
  const zip = new JSZip();
  
  for (const file of files) {
    if (file.folder) {
      zip.folder(file.folder)?.file(file.name, file.blob);
    } else {
      zip.file(file.name, file.blob);
    }
  }
  
  return await zip.generateAsync({ type: 'blob' });
}

