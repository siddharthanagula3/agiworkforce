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

/**
 * Article 27 GDPR obliges a non-EU controller offering services to people in the
 * EU to appoint a local representative. No representative is appointed, so EEA
 * traffic is refused rather than served without one. Lifting the block is a
 * one-line env change once a representative exists — the EU-specific consent,
 * erasure and disclosure code stays wired and tested so nothing has to be
 * rebuilt.
 */
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
