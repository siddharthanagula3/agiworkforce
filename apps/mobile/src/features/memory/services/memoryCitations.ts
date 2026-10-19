import {
  MANAGED_MEMORY_CITATIONS_HEADER,
  parseManagedMemoryCitations,
  type ManagedMemoryCitations,
} from '@agiworkforce/types';

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

export function readMemoryCitationsHeader(
  headers: Pick<Headers, 'get'>,
): ManagedMemoryCitations | null {
  const value = headers.get(MANAGED_MEMORY_CITATIONS_HEADER);
  if (!value) return null;
  try {
    return parseManagedMemoryCitations(JSON.parse(decodeBase64Utf8(value)));
  } catch {
    return null;
  }
}

export function messageMemoryCitations(
  metadata: Record<string, unknown> | undefined,
): ManagedMemoryCitations | null {
  return parseManagedMemoryCitations(metadata?.['memoryCitations']);
}
