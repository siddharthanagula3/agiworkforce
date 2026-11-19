export function formatToolDetailText(text: string): string {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return text;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null ? JSON.stringify(parsed, null, 2) : text;
  } catch {
    return text;
  }
}
