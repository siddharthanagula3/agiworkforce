import { t, tPlural } from '../../i18n';

export function autofillSuccessMessage(response: Record<string, unknown>): string {
  const result = response['autofill'];
  const filled =
    result && typeof result === 'object'
      ? (result as { filledCount?: unknown }).filledCount
      : undefined;
  return typeof filled === 'number' && Number.isFinite(filled) && filled > 0
    ? tPlural('spAutofillFilled', filled)
    : t('spAutofillNothingFilled');
}
