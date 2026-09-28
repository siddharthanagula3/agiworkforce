export function formatSourcePublishedDate(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.length > 32 ? null : value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
