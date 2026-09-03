export const EEA_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
]);

export type EuAccessDecision = { blocked: false } | { blocked: true; country: string };

export function decideEuAccess(
  country: string | null | undefined,
  enabled: boolean,
): EuAccessDecision {
  if (!enabled) return { blocked: false };
  const code = country?.trim().toUpperCase();
  if (!code || !EEA_COUNTRY_CODES.has(code)) return { blocked: false };
  return { blocked: true, country: code };
}

export function euBlockEnabled(env: Record<string, string | undefined>): boolean {
  const raw = env['AGI_BLOCK_EEA_TRAFFIC']?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return raw === '1' || raw === 'true' || raw === 'on';
}
