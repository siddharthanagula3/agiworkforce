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
