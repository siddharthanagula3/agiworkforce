export function helpArticlePath(docId: string): string {
  return `/help/${encodeURIComponent(docId)}`;
}
