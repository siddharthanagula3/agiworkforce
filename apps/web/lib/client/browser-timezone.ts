/**
 * Return the browser's IANA time-zone identifier for managed chat context.
 *
 * This is only a client hint. The server validates it and combines it with its
 * own authoritative UTC instant before it reaches the model.
 */
export function getBrowserTimeZone(): string | undefined {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.length > 0 && timeZone.length <= 64
      ? timeZone
      : undefined;
  } catch {
    return undefined;
  }
}
