export const EXTRACTION_TRUNCATION_NOTE = '[Content truncated during extraction.]';

export function truncateExtractedText(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n\n${EXTRACTION_TRUNCATION_NOTE}`;
}

export function wasExtractionTruncated(text: string | null): boolean {
  return text?.endsWith(EXTRACTION_TRUNCATION_NOTE) ?? false;
}
