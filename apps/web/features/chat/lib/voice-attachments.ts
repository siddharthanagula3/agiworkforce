/**
 * GPT-Live does not take images or files itself; its Responses backend does.
 * The documented path is a Responses input item queued with
 * response.item.create on the session's data channel, followed by
 * response.create. The data channel carries the item inline, so a photo is
 * downscaled to JPEG and a PDF is sent as base64, both within the channel's
 * largest message.
 */

export const VOICE_ATTACHMENT_ACCEPT = 'image/*,application/pdf';
export const DEFAULT_DATA_CHANNEL_MESSAGE_BYTES = 256 * 1024;

const PDF_TYPE = 'application/pdf';
const JPEG_TYPE = 'image/jpeg';
const IMAGE_PREFIX = 'image/';
const ENVELOPE_BYTES = 2_048;
const IMAGE_ATTEMPTS: ReadonlyArray<{ maxEdge: number; quality: number }> = [
  { maxEdge: 1_280, quality: 0.8 },
  { maxEdge: 1_024, quality: 0.7 },
  { maxEdge: 768, quality: 0.6 },
];

export type VoiceAttachmentContent =
  | { type: 'input_image'; image_url: string; detail: 'auto' }
  | { type: 'input_file'; filename: string; file_data: string };

export type VoiceAttachmentResult =
  | { ok: true; name: string; kind: 'image' | 'file'; content: VoiceAttachmentContent }
  | { ok: false; reason: 'unsupported' | 'too_large' | 'unreadable' };

export type ImageDownscaler = (
  file: File,
  maxEdge: number,
  quality: number,
) => Promise<string | null>;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export const downscaleImage: ImageDownscaler = async (file, maxEdge, quality) => {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(JPEG_TYPE, quality);
  } finally {
    bitmap.close();
  }
};

export async function prepareVoiceAttachment(
  file: File,
  maxMessageBytes: number,
  downscale: ImageDownscaler = downscaleImage,
): Promise<VoiceAttachmentResult> {
  const budget = maxMessageBytes - ENVELOPE_BYTES - file.name.length;
  try {
    if (file.type === PDF_TYPE) {
      const fileData = await readAsDataUrl(file);
      if (fileData.length > budget) return { ok: false, reason: 'too_large' };
      return {
        ok: true,
        name: file.name,
        kind: 'file',
        content: { type: 'input_file', filename: file.name, file_data: fileData },
      };
    }
    if (!file.type.startsWith(IMAGE_PREFIX)) return { ok: false, reason: 'unsupported' };
    for (const attempt of IMAGE_ATTEMPTS) {
      const dataUrl = await downscale(file, attempt.maxEdge, attempt.quality);
      if (!dataUrl) return { ok: false, reason: 'unreadable' };
      if (dataUrl.length <= budget) {
        return {
          ok: true,
          name: file.name,
          kind: 'image',
          content: { type: 'input_image', image_url: dataUrl, detail: 'auto' },
        };
      }
    }
    return { ok: false, reason: 'too_large' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
