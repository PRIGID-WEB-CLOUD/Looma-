export async function compressImageFile(
  file: File,
  maxDimension = 1280,
  maxChars = 420000
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPG, or WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported image format.'));
    img.src = dataUrl;
  });

  const scale = Math.min(
    1,
    maxDimension / Math.max(image.width || 1, image.height || 1)
  );
  const targetW = Math.max(1, Math.round(image.width * scale));
  const targetH = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas image processing is unavailable.');
  }
  ctx.drawImage(image, 0, 0, targetW, targetH);

  let quality = 0.86;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > maxChars && quality > 0.42) {
    quality -= 0.1;
    output = canvas.toDataURL('image/jpeg', quality);
  }
  return output;
}
