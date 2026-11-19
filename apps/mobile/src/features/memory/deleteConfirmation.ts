const EXCERPT_LENGTH = 80;

export function describeMemoryDeletion(fact: string, isCloud: boolean): string {
  const text = fact.trim();
  const excerpt =
    text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
  const where = isCloud ? 'from your account and every synced device' : 'from this device';
  return `This permanently deletes “${excerpt}” ${where}. It cannot be restored.`;
}
