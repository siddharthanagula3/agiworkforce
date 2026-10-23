import 'server-only';

import { open } from 'node:fs/promises';
import {
  embedImageProvenance,
  embedVideoProvenance,
  planVideoProvenance,
  type ProvenanceVideoMimeType,
} from '@agiworkforce/compliance';
import type { AiGeneratedProvenance } from '@/lib/compliance/ai-act';

export class GeneratedMediaProvenanceError extends Error {
  constructor(mimeType: string) {
    super(`Generated ${mimeType} could not be marked as AI-generated.`);
    this.name = 'GeneratedMediaProvenanceError';
  }
}

const VIDEO_MIME_TYPES: ReadonlySet<string> = new Set<ProvenanceVideoMimeType>([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

function normalisedMime(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function videoMimeType(mimeType: string): ProvenanceVideoMimeType {
  const mime = normalisedMime(mimeType);
  if (!VIDEO_MIME_TYPES.has(mime)) throw new GeneratedMediaProvenanceError(mimeType);
  return mime as ProvenanceVideoMimeType;
}

export function markGeneratedImage(bytes: Uint8Array, claim: AiGeneratedProvenance): Buffer {
  const marked = embedImageProvenance(bytes, claim);
  if (!marked) throw new GeneratedMediaProvenanceError('image');
  return Buffer.from(marked.buffer, marked.byteOffset, marked.byteLength);
}

export async function markGeneratedMediaBytes(
  bytes: Buffer,
  mimeType: string,
  claim: AiGeneratedProvenance,
): Promise<Buffer> {
  if (normalisedMime(mimeType).startsWith('image/')) return markGeneratedImage(bytes, claim);
  const marked = await embedVideoProvenance(bytes, videoMimeType(mimeType), claim);
  if (!marked) throw new GeneratedMediaProvenanceError(mimeType);
  return Buffer.from(marked.buffer, marked.byteOffset, marked.byteLength);
}

/** Marks a staged video in place and returns its new size, without reading the media payload. */
export async function markGeneratedVideoFile(
  filePath: string,
  mimeType: string,
  claim: AiGeneratedProvenance,
): Promise<number> {
  const mime = videoMimeType(mimeType);
  const handle = await open(filePath, 'r+');
  try {
    const { size } = await handle.stat();
    const plan = await planVideoProvenance(
      {
        size,
        read: async (offset, length) => {
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buffer, 0, length, offset);
          return buffer.subarray(0, bytesRead);
        },
      },
      mime,
      claim,
    );
    if (!plan) throw new GeneratedMediaProvenanceError(mimeType);
    for (const patch of plan.patches) {
      await handle.write(patch.bytes, 0, patch.bytes.length, patch.offset);
    }
    await handle.write(plan.append, 0, plan.append.length, size);
    return size + plan.append.length;
  } finally {
    await handle.close();
  }
}
