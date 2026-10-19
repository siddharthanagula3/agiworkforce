export const SCREENSHOT_MIME_TYPE = 'image/jpeg';
export const SCREENSHOT_JPEG_QUALITY = 80;

export interface CssViewportSize {
  clientWidth: number;
  clientHeight: number;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

// Browser tools take viewport CSS pixels, so the model must see the page at
// that scale. A high-density display captures at device pixels, which both
// misplaces coordinate clicks and pushes a step past the gateway's body limit.
export async function fitScreenshotToViewport(
  base64: string,
  viewport: CssViewportSize | undefined,
): Promise<string> {
  if (
    !viewport ||
    !(viewport.clientWidth > 0) ||
    !(viewport.clientHeight > 0) ||
    typeof OffscreenCanvas !== 'function' ||
    typeof createImageBitmap !== 'function'
  ) {
    return base64;
  }
  try {
    const bitmap = await createImageBitmap(
      new Blob([base64ToBytes(base64)], { type: SCREENSHOT_MIME_TYPE }),
    );
    const width = Math.round(viewport.clientWidth);
    const height = Math.round(viewport.clientHeight);
    if (bitmap.width <= width) {
      bitmap.close();
      return base64;
    }
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({
      type: SCREENSHOT_MIME_TYPE,
      quality: SCREENSHOT_JPEG_QUALITY / 100,
    });
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return base64;
  }
}
