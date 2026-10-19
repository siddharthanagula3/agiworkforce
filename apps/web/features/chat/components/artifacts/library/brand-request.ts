import { artifactReplyFormat } from '../artifact-edit-request';
import type { BrandPayload } from './studio-library-client';

export function buildApplyBrandRequest(
  title: string,
  brandName: string,
  brand: BrandPayload,
): string {
  return [
    `Rewrite the document "${title}" in the ${brandName} house style. Keep its structure, facts and title; change only wording and tone.`,
    '',
    brand.voice ? `House voice: ${brand.voice}` : 'House voice: clear, confident and plain.',
    '',
    artifactReplyFormat('document'),
  ].join('\n');
}
