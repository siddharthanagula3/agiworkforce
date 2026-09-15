import en_auth from '../locales/en/auth.json' with { type: 'json' };
import en_chat from '../locales/en/chat.json' with { type: 'json' };
import en_common from '../locales/en/common.json' with { type: 'json' };
import en_errors from '../locales/en/errors.json' with { type: 'json' };
import en_models from '../locales/en/models.json' with { type: 'json' };
import en_pricing from '../locales/en/pricing.json' with { type: 'json' };
import en_settings from '../locales/en/settings.json' with { type: 'json' };
import en_v3 from '../locales/en/v3.json' with { type: 'json' };

export const englishResources = {
  auth: en_auth,
  chat: en_chat,
  common: en_common,
  errors: en_errors,
  models: en_models,
  pricing: en_pricing,
  settings: en_settings,
  v3: en_v3,
} as const;
