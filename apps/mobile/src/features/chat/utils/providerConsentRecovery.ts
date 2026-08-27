import {
  ChineseHqProviderNotOptedInError,
  chineseHqProviderDisplayName,
  isChineseHqProvider,
  type ChineseHqProviderId,
} from '@agiworkforce/compliance';

type ProviderConsentErrorName = ChineseHqProviderNotOptedInError['name'];
type ProviderConsentErrorCode = ChineseHqProviderNotOptedInError['code'];

const PROVIDER_CONSENT_ERROR_NAME: ProviderConsentErrorName = 'ChineseHqProviderNotOptedInError';
const PROVIDER_CONSENT_ERROR_CODE: ProviderConsentErrorCode = 'cn_hq_provider_not_opted_in';

export interface ProviderConsentErrorState {
  providerId: ChineseHqProviderId;
  displayName: string;
  code: ProviderConsentErrorCode;
}

function readProviderId(error: unknown): string | null {
  if (error instanceof ChineseHqProviderNotOptedInError) return error.providerId;
  if (!(error instanceof Error) || error.name !== PROVIDER_CONSENT_ERROR_NAME) return null;
  const candidate = (error as { providerId?: unknown }).providerId;
  return typeof candidate === 'string' ? candidate : null;
}

export function providerConsentErrorStateFromError(
  error: unknown,
): ProviderConsentErrorState | null {
  const providerId = readProviderId(error);
  if (providerId === null || !isChineseHqProvider(providerId)) return null;
  return {
    providerId,
    displayName: chineseHqProviderDisplayName(providerId),
    code: PROVIDER_CONSENT_ERROR_CODE,
  };
}

export function providerConsentErrorMessage(state: ProviderConsentErrorState): string {
  return `${state.displayName} is turned off for your account. Turn it on to send with this model, or pick a different one.`;
}
