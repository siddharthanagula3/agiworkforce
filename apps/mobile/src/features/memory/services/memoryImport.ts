import {
  ImportTextTooLargeError,
  MAX_IMPORT_TEXT_CHARS,
  buildImportPreview,
  normalizeImportSourceName,
  normalizeImportedMemoryKey,
  parseImportedMemoryText,
  parseManagedMemoryImportPreviewResponse,
  type ManagedMemoryImportPreviewItem,
} from '@agiworkforce/types';
import { api } from '@/services/api';
import { listMemoryFacts } from '@/storage/memory';

export const MEMORY_IMPORT_PATH = '/api/memory/import';
export const MEMORY_IMPORT_SOURCES = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Other'] as const;
export type MemoryImportSource = (typeof MEMORY_IMPORT_SOURCES)[number];
export { ImportTextTooLargeError, MAX_IMPORT_TEXT_CHARS };

const MAX_LOCAL_KNOWN_FACTS = 5_000;

export interface MemoryImportPreview {
  sourceName: string;
  items: ManagedMemoryImportPreviewItem[];
  itemsTruncated: boolean;
}

export async function previewMemoryImport(
  text: string,
  sourceName: string,
  scope: 'local' | 'cloud',
): Promise<MemoryImportPreview> {
  if (scope === 'cloud') {
    const preview = parseManagedMemoryImportPreviewResponse(
      await api.post<unknown>(MEMORY_IMPORT_PATH, { mode: 'dry-run', text, sourceName }),
    );
    if (!preview) throw new Error('The memory import preview could not be read.');
    return {
      sourceName: preview.sourceName,
      items: preview.items,
      itemsTruncated: preview.itemsTruncated,
    };
  }

  const parsed = parseImportedMemoryText(text);
  const known = await listMemoryFacts({ limit: MAX_LOCAL_KNOWN_FACTS });
  return {
    sourceName: normalizeImportSourceName(sourceName),
    items: buildImportPreview(
      parsed.items,
      new Set(known.map((fact) => normalizeImportedMemoryKey(fact.fact))),
    ),
    itemsTruncated: parsed.itemsTruncated,
  };
}
