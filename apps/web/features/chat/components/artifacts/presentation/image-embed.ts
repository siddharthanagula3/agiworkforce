const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;
export const MAX_EMBEDDED_IMAGE_CHARS = 600_000;

export class ImageEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageEmbedError';
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageEmbedError('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new ImageEmbedError('That file is not an image this browser can open.'));
    image.src = src;
  });
}

export async function embedImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ImageEmbedError('Choose an image file.');
  const original = await readAsDataUrl(file);
  if (file.type === 'image/svg+xml') {
    throw new ImageEmbedError('SVG files cannot be placed on a slide. Use PNG, JPEG, GIF or WebP.');
  }
  const image = await loadImage(original);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight, 1));
  if (scale === 1 && original.length <= MAX_EMBEDDED_IMAGE_CHARS) return original;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new ImageEmbedError('This browser cannot resize the image.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp';
  const resized = canvas.toDataURL(keepsAlpha ? 'image/png' : 'image/jpeg', JPEG_QUALITY);
  const compact =
    resized.length > MAX_EMBEDDED_IMAGE_CHARS && keepsAlpha
      ? canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      : resized;
  if (compact.length > MAX_EMBEDDED_IMAGE_CHARS) {
    throw new ImageEmbedError('That image is too large to place. Try a smaller one.');
  }
  return compact;
}

export function imageMarkdown(alt: string, dataUrl: string): string {
  const clean =
    alt
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[[\]]/g, '')
      .trim() || 'Image';
  return `![${clean}](${dataUrl})`;
}
