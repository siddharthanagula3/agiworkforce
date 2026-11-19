import 'server-only';

import sharp, { type Metadata, type Sharp } from 'sharp';
import { CHAT_MODEL_IMAGE_ENVELOPE } from '@agiworkforce/cloud-contracts';

export type ModelImageEnvelope = typeof CHAT_MODEL_IMAGE_ENVELOPE;

export interface ModelImage {
  mimeType: string;
  data: Buffer;
  /** A sentence for the model when what it sees differs from the file in a way it should know. */
  note: string | null;
}

export class ModelImageUnreadableError extends Error {
  constructor(readonly filename: string) {
    super(`${filename} could not be read as an image.`);
    this.name = 'ModelImageUnreadableError';
  }
}

const FORMAT_MEDIA_TYPES: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const LOSSY_QUALITY = 85;
const SHRINK_STEP = 0.75;
const SMALLEST_EDGE_PIXELS = 256;

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

type OutputFormat = 'jpeg' | 'png' | 'webp';

function encode(pipeline: Sharp, format: OutputFormat): Promise<Buffer> {
  if (format === 'jpeg') return pipeline.jpeg({ quality: LOSSY_QUALITY }).toBuffer();
  if (format === 'png') return pipeline.png({ compressionLevel: 9 }).toBuffer();
  return pipeline.webp({ quality: LOSSY_QUALITY, alphaQuality: 100 }).toBuffer();
}

/**
 * A still picture keeps its own format while it fits; a picture with
 * transparency only ever moves to another format that keeps the alpha channel.
 */
function formatsToTry(format: string, hasAlpha: boolean): OutputFormat[] {
  if (format === 'jpeg') return ['jpeg'];
  if (format === 'webp') return ['webp'];
  if (format === 'png' || format === 'gif') return ['png', 'webp'];
  return hasAlpha ? ['webp'] : ['jpeg'];
}

/**
 * The picture a model is handed for one attachment. The stored file is never
 * changed; this is the copy that travels in the request. A file inside the
 * envelope goes as it is. Anything larger, wider, animated or in a format some
 * route cannot read is decoded once and re-encoded, smaller each round, until
 * it fits. Re-encoding drops the camera metadata and applies the orientation.
 */
export async function prepareModelImage(
  data: Buffer,
  filename: string,
  envelope: ModelImageEnvelope = CHAT_MODEL_IMAGE_ENVELOPE,
): Promise<ModelImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(data).metadata();
  } catch {
    throw new ModelImageUnreadableError(filename);
  }
  const sourceType = FORMAT_MEDIA_TYPES[metadata.format];
  if (!sourceType || !metadata.width || !metadata.height) {
    throw new ModelImageUnreadableError(filename);
  }

  const animated = (metadata.pages ?? 1) > 1;
  const note = animated
    ? `[${filename} is animated; the model is shown its first frame only]`
    : null;
  const { width, height } = metadata.autoOrient;
  const longestEdge = Math.max(width, height);

  if (
    !animated &&
    envelope.mediaTypes.includes(sourceType) &&
    base64Length(data.byteLength) <= envelope.maxBase64Bytes &&
    longestEdge <= envelope.maxEdgePixels
  ) {
    return { mimeType: sourceType, data, note: null };
  }

  const formats = formatsToTry(metadata.format, metadata.hasAlpha);
  let edge = Math.min(longestEdge, envelope.maxEdgePixels);
  for (;;) {
    for (const format of formats) {
      let encoded: Buffer;
      try {
        encoded = await encode(
          sharp(data, { animated: false, autoOrient: true }).resize({
            width: edge,
            height: edge,
            fit: 'inside',
            withoutEnlargement: true,
          }),
          format,
        );
      } catch {
        throw new ModelImageUnreadableError(filename);
      }
      if (base64Length(encoded.byteLength) <= envelope.maxBase64Bytes) {
        return { mimeType: FORMAT_MEDIA_TYPES[format]!, data: encoded, note };
      }
    }
    if (edge <= SMALLEST_EDGE_PIXELS) break;
    edge = Math.max(SMALLEST_EDGE_PIXELS, Math.floor(edge * SHRINK_STEP));
  }
  throw new ModelImageUnreadableError(filename);
}
