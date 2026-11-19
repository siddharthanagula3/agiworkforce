const IANA_ZONE_MAX_LENGTH = 64;

export function getDeviceTimeZone(): string | undefined {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' &&
      timeZone.length > 0 &&
      timeZone.length <= IANA_ZONE_MAX_LENGTH
      ? timeZone
      : undefined;
  } catch {
    return undefined;
  }
}
