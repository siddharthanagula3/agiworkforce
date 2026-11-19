export const SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

export function serviceUnavailableRetryHeaders(): Record<string, string> {
  return { 'retry-after': String(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS) };
}
