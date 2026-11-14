export const PRIVACY_NAMESPACE = 'privacy';
export const PROVIDER_TRAINING_OPT_OUT_KEY = 'keepOutOfProviderTraining';
export const CHAT_MODEL_IMPROVEMENT_KEY = 'allowChatsForModelImprovement';
export const VOICE_MODEL_IMPROVEMENT_KEY = 'allowVoiceForModelImprovement';

export const TRAINING_PREFERENCE_KEYS = [
  PROVIDER_TRAINING_OPT_OUT_KEY,
  CHAT_MODEL_IMPROVEMENT_KEY,
  VOICE_MODEL_IMPROVEMENT_KEY,
] as const;

export type TrainingPreferenceKey = (typeof TRAINING_PREFERENCE_KEYS)[number];
export type TrainingPreferenceValues = Record<TrainingPreferenceKey, boolean>;

export type TrainingPreferences = {
  values: TrainingPreferenceValues;
  version: string | null;
};

export const TRAINING_PREFERENCES_OFF: TrainingPreferenceValues = {
  [PROVIDER_TRAINING_OPT_OUT_KEY]: false,
  [CHAT_MODEL_IMPROVEMENT_KEY]: false,
  [VOICE_MODEL_IMPROVEMENT_KEY]: false,
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Training preferences unavailable');
  }
  return value as Record<string, unknown>;
}

function version(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error('Training preferences version unavailable');
}

function values(settings: Record<string, unknown>): TrainingPreferenceValues {
  const parsed = { ...TRAINING_PREFERENCES_OFF };
  for (const key of TRAINING_PREFERENCE_KEYS) {
    const value = settings[key];
    if (value !== undefined && typeof value !== 'boolean') {
      throw new Error('Training preferences unavailable');
    }
    parsed[key] = value === true;
  }
  return parsed;
}

export function parseTrainingPreferences(body: unknown): TrainingPreferences {
  const response = record(body);
  return { values: values(record(response.settings)), version: version(response.version) };
}

export function parseTrainingPreferenceReceipt(
  body: unknown,
  key: TrainingPreferenceKey,
  expected: boolean,
): TrainingPreferences {
  const response = record(body);
  const settings = record(record(response.settings)[PRIVACY_NAMESPACE]);
  const savedVersion = version(response.version);
  if (typeof settings[key] !== 'boolean' || settings[key] !== expected || savedVersion === null) {
    throw new Error('Training preference write unconfirmed');
  }
  return { values: values(settings), version: savedVersion };
}
