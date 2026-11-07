export const PRIVACY_NAMESPACE = 'privacy';
export const PROVIDER_TRAINING_OPT_OUT_KEY = 'keepOutOfProviderTraining';

export type ProviderTrainingChoice = {
  optedOut: boolean;
  version: string | null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Provider training preference unavailable');
  }
  return value as Record<string, unknown>;
}

function version(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error('Provider training preference version unavailable');
}

export function parseProviderTrainingChoice(body: unknown): ProviderTrainingChoice {
  const response = record(body);
  const settings = record(response.settings);
  const optedOut = settings[PROVIDER_TRAINING_OPT_OUT_KEY];
  if (optedOut !== undefined && typeof optedOut !== 'boolean') {
    throw new Error('Provider training preference unavailable');
  }
  return { optedOut: optedOut === true, version: version(response.version) };
}

export function parseProviderTrainingReceipt(body: unknown, expectedOptedOut: boolean): ProviderTrainingChoice {
  const response = record(body);
  const settings = record(record(response.settings)[PRIVACY_NAMESPACE]);
  const optedOut = settings[PROVIDER_TRAINING_OPT_OUT_KEY];
  const savedVersion = version(response.version);
  if (typeof optedOut !== 'boolean' || optedOut !== expectedOptedOut || savedVersion === null) {
    throw new Error('Provider training preference write unconfirmed');
  }
  return { optedOut, version: savedVersion };
}
