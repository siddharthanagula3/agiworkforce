import { citationPublishedLabel } from '@agiworkforce/unified-chat/citation-publisher';

export function formatSourcePublishedDate(raw: string | undefined): string | null {
  return citationPublishedLabel({ publishedDate: raw }) ?? null;
}
