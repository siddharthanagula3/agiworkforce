export function composerTextWithIncoming(current: string, incoming: string): string {
  if (!incoming.trim()) return current;
  if (!current.trim()) return incoming;
  if (current.includes(incoming)) return current;
  return `${current.trimEnd()}\n\n${incoming}`;
}
