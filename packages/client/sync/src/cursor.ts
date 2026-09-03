export function bigintGreater(a: string, b: string): boolean {
  const na = a.replace(/^0+/, '') || '0';
  const nb = b.replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

export function maxCursor(base: string, ...versions: string[]): string {
  let max = base;
  for (const v of versions) if (v && bigintGreater(v, max)) max = v;
  return max;
}

export function selectNextCursor(
  current: string,
  responseCursor: string | null | undefined,
): string {
  return responseCursor ? maxCursor(current, responseCursor) : current;
}
