import 'server-only';

import { getHarnessMediaInput, getModelMetadataById } from '@agiworkforce/types';

const NATIVE_DOCUMENT_KEY = 'x_native_document';
const PDF_MEDIA_TYPE = 'application/pdf';
const PDF_MODALITY = 'pdf';

export interface NativeDocument {
  filename: string;
  mediaType: string;
  data: string;
  pageCount: number;
}

interface NativeDocumentMarker extends NativeDocument {
  fallbackPartCount: number;
}

type NativeDocumentAdmission = (document: NativeDocument) => boolean;

function readMarker(part: unknown): NativeDocumentMarker | null {
  if (!part || typeof part !== 'object') return null;
  const marker = (part as Record<string, unknown>)[NATIVE_DOCUMENT_KEY];
  return marker && typeof marker === 'object' ? (marker as NativeDocumentMarker) : null;
}

export function markNativeDocument<T extends object>(
  header: T,
  fallback: readonly T[],
  document: NativeDocument,
): T[] {
  const marker: NativeDocumentMarker = { ...document, fallbackPartCount: fallback.length };
  return [{ ...header, [NATIVE_DOCUMENT_KEY]: marker }, ...fallback];
}

export function maxImagesPerRequest(modelId: string, harnessId: string): number | null {
  return (
    getModelMetadataById(modelId)?.imageInput?.maxImagesPerRequest ??
    getHarnessMediaInput(harnessId).maxImagesPerRequest ??
    null
  );
}

export function countImageParts(
  messages: ReadonlyArray<{ content: string | ReadonlyArray<{ type?: string }> }>,
): number {
  return messages.reduce(
    (count, message) =>
      typeof message.content === 'string'
        ? count
        : count + message.content.filter((part) => part.type === 'image_url').length,
    0,
  );
}

export function nativeDocumentAdmission(
  modelId: string,
  harnessId: string | undefined,
): NativeDocumentAdmission {
  const metadata = getModelMetadataById(modelId);
  if (!harnessId || !metadata?.inputModalities?.includes(PDF_MODALITY)) return () => false;
  const media = getHarnessMediaInput(harnessId);
  const acceptedTypes = new Set(media.documentMediaTypes ?? []);
  const maxPages =
    metadata.documentInput?.maxPagesPerRequest ?? media.maxDocumentPagesPerRequest ?? null;
  let pagesAdmitted = 0;
  return (document) => {
    if (document.mediaType !== PDF_MEDIA_TYPE || !acceptedTypes.has(document.mediaType)) {
      return false;
    }
    if (maxPages !== null && pagesAdmitted + document.pageCount > maxPages) return false;
    pagesAdmitted += document.pageCount;
    return true;
  };
}

export function withNativeDocuments(
  parts: readonly unknown[],
  admit: NativeDocumentAdmission,
): unknown[] {
  const out: unknown[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const marker = readMarker(part);
    if (!marker) {
      out.push(part);
      continue;
    }
    const { [NATIVE_DOCUMENT_KEY]: _marker, ...header } = part as Record<string, unknown>;
    out.push(header);
    if (!admit(marker)) continue;
    out.push({
      type: 'file',
      file: {
        filename: marker.filename,
        mime_type: marker.mediaType,
        file_data: `data:${marker.mediaType};base64,${marker.data}`,
      },
    });
    index += marker.fallbackPartCount;
  }
  return out;
}
