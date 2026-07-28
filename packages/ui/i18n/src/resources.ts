/**
 * Every translation the product ships, for every surface.
 *
 * Web and Desktop each carried their own copy of this corpus. Desktop's had 12
 * locales; web's had 3, so the same language menu offered a different world
 * depending on which app you opened, and a string fixed in one stayed wrong in
 * the other. Mobile had no translations at all.
 *
 * The merge kept both key sets and let web's value win where the two disagreed,
 * since web is the canonical UI reference. Keys that only web had exist in
 * English plus whichever locales web already translated; everywhere else
 * i18next falls back to English, which is the honest behaviour for a string
 * nobody has translated yet.
 *
 * Generated from the merge, then maintained by hand. Add a language by adding
 * its folder under `locales/` and an entry in `SUPPORTED_LANGUAGES`.
 */

import ar_auth from '../locales/ar/auth.json' with { type: 'json' };
import ar_chat from '../locales/ar/chat.json' with { type: 'json' };
import ar_common from '../locales/ar/common.json' with { type: 'json' };
import ar_errors from '../locales/ar/errors.json' with { type: 'json' };
import ar_models from '../locales/ar/models.json' with { type: 'json' };
import ar_pricing from '../locales/ar/pricing.json' with { type: 'json' };
import ar_settings from '../locales/ar/settings.json' with { type: 'json' };
import ar_v3 from '../locales/ar/v3.json' with { type: 'json' };
import de_auth from '../locales/de/auth.json' with { type: 'json' };
import de_chat from '../locales/de/chat.json' with { type: 'json' };
import de_common from '../locales/de/common.json' with { type: 'json' };
import de_errors from '../locales/de/errors.json' with { type: 'json' };
import de_models from '../locales/de/models.json' with { type: 'json' };
import de_pricing from '../locales/de/pricing.json' with { type: 'json' };
import de_settings from '../locales/de/settings.json' with { type: 'json' };
import de_v3 from '../locales/de/v3.json' with { type: 'json' };
import en_auth from '../locales/en/auth.json' with { type: 'json' };
import en_chat from '../locales/en/chat.json' with { type: 'json' };
import en_common from '../locales/en/common.json' with { type: 'json' };
import en_errors from '../locales/en/errors.json' with { type: 'json' };
import en_models from '../locales/en/models.json' with { type: 'json' };
import en_pricing from '../locales/en/pricing.json' with { type: 'json' };
import en_settings from '../locales/en/settings.json' with { type: 'json' };
import en_v3 from '../locales/en/v3.json' with { type: 'json' };
import es_auth from '../locales/es/auth.json' with { type: 'json' };
import es_chat from '../locales/es/chat.json' with { type: 'json' };
import es_common from '../locales/es/common.json' with { type: 'json' };
import es_errors from '../locales/es/errors.json' with { type: 'json' };
import es_models from '../locales/es/models.json' with { type: 'json' };
import es_pricing from '../locales/es/pricing.json' with { type: 'json' };
import es_settings from '../locales/es/settings.json' with { type: 'json' };
import es_v3 from '../locales/es/v3.json' with { type: 'json' };
import fr_auth from '../locales/fr/auth.json' with { type: 'json' };
import fr_chat from '../locales/fr/chat.json' with { type: 'json' };
import fr_common from '../locales/fr/common.json' with { type: 'json' };
import fr_errors from '../locales/fr/errors.json' with { type: 'json' };
import fr_models from '../locales/fr/models.json' with { type: 'json' };
import fr_pricing from '../locales/fr/pricing.json' with { type: 'json' };
import fr_settings from '../locales/fr/settings.json' with { type: 'json' };
import fr_v3 from '../locales/fr/v3.json' with { type: 'json' };
import hi_auth from '../locales/hi/auth.json' with { type: 'json' };
import hi_chat from '../locales/hi/chat.json' with { type: 'json' };
import hi_common from '../locales/hi/common.json' with { type: 'json' };
import hi_errors from '../locales/hi/errors.json' with { type: 'json' };
import hi_models from '../locales/hi/models.json' with { type: 'json' };
import hi_pricing from '../locales/hi/pricing.json' with { type: 'json' };
import hi_settings from '../locales/hi/settings.json' with { type: 'json' };
import hi_v3 from '../locales/hi/v3.json' with { type: 'json' };
import it_auth from '../locales/it/auth.json' with { type: 'json' };
import it_chat from '../locales/it/chat.json' with { type: 'json' };
import it_common from '../locales/it/common.json' with { type: 'json' };
import it_errors from '../locales/it/errors.json' with { type: 'json' };
import it_models from '../locales/it/models.json' with { type: 'json' };
import it_pricing from '../locales/it/pricing.json' with { type: 'json' };
import it_settings from '../locales/it/settings.json' with { type: 'json' };
import it_v3 from '../locales/it/v3.json' with { type: 'json' };
import ja_auth from '../locales/ja/auth.json' with { type: 'json' };
import ja_chat from '../locales/ja/chat.json' with { type: 'json' };
import ja_common from '../locales/ja/common.json' with { type: 'json' };
import ja_errors from '../locales/ja/errors.json' with { type: 'json' };
import ja_models from '../locales/ja/models.json' with { type: 'json' };
import ja_pricing from '../locales/ja/pricing.json' with { type: 'json' };
import ja_settings from '../locales/ja/settings.json' with { type: 'json' };
import ja_v3 from '../locales/ja/v3.json' with { type: 'json' };
import ko_auth from '../locales/ko/auth.json' with { type: 'json' };
import ko_chat from '../locales/ko/chat.json' with { type: 'json' };
import ko_common from '../locales/ko/common.json' with { type: 'json' };
import ko_errors from '../locales/ko/errors.json' with { type: 'json' };
import ko_models from '../locales/ko/models.json' with { type: 'json' };
import ko_pricing from '../locales/ko/pricing.json' with { type: 'json' };
import ko_settings from '../locales/ko/settings.json' with { type: 'json' };
import ko_v3 from '../locales/ko/v3.json' with { type: 'json' };
import pt_auth from '../locales/pt/auth.json' with { type: 'json' };
import pt_chat from '../locales/pt/chat.json' with { type: 'json' };
import pt_common from '../locales/pt/common.json' with { type: 'json' };
import pt_errors from '../locales/pt/errors.json' with { type: 'json' };
import pt_models from '../locales/pt/models.json' with { type: 'json' };
import pt_pricing from '../locales/pt/pricing.json' with { type: 'json' };
import pt_settings from '../locales/pt/settings.json' with { type: 'json' };
import pt_v3 from '../locales/pt/v3.json' with { type: 'json' };
import ru_auth from '../locales/ru/auth.json' with { type: 'json' };
import ru_chat from '../locales/ru/chat.json' with { type: 'json' };
import ru_common from '../locales/ru/common.json' with { type: 'json' };
import ru_errors from '../locales/ru/errors.json' with { type: 'json' };
import ru_models from '../locales/ru/models.json' with { type: 'json' };
import ru_pricing from '../locales/ru/pricing.json' with { type: 'json' };
import ru_settings from '../locales/ru/settings.json' with { type: 'json' };
import ru_v3 from '../locales/ru/v3.json' with { type: 'json' };
import zh_auth from '../locales/zh/auth.json' with { type: 'json' };
import zh_chat from '../locales/zh/chat.json' with { type: 'json' };
import zh_common from '../locales/zh/common.json' with { type: 'json' };
import zh_errors from '../locales/zh/errors.json' with { type: 'json' };
import zh_models from '../locales/zh/models.json' with { type: 'json' };
import zh_pricing from '../locales/zh/pricing.json' with { type: 'json' };
import zh_settings from '../locales/zh/settings.json' with { type: 'json' };
import zh_v3 from '../locales/zh/v3.json' with { type: 'json' };

export const resources = {
  ar: {
    auth: ar_auth,
    chat: ar_chat,
    common: ar_common,
    errors: ar_errors,
    models: ar_models,
    pricing: ar_pricing,
    settings: ar_settings,
    v3: ar_v3,
  },
  de: {
    auth: de_auth,
    chat: de_chat,
    common: de_common,
    errors: de_errors,
    models: de_models,
    pricing: de_pricing,
    settings: de_settings,
    v3: de_v3,
  },
  en: {
    auth: en_auth,
    chat: en_chat,
    common: en_common,
    errors: en_errors,
    models: en_models,
    pricing: en_pricing,
    settings: en_settings,
    v3: en_v3,
  },
  es: {
    auth: es_auth,
    chat: es_chat,
    common: es_common,
    errors: es_errors,
    models: es_models,
    pricing: es_pricing,
    settings: es_settings,
    v3: es_v3,
  },
  fr: {
    auth: fr_auth,
    chat: fr_chat,
    common: fr_common,
    errors: fr_errors,
    models: fr_models,
    pricing: fr_pricing,
    settings: fr_settings,
    v3: fr_v3,
  },
  hi: {
    auth: hi_auth,
    chat: hi_chat,
    common: hi_common,
    errors: hi_errors,
    models: hi_models,
    pricing: hi_pricing,
    settings: hi_settings,
    v3: hi_v3,
  },
  it: {
    auth: it_auth,
    chat: it_chat,
    common: it_common,
    errors: it_errors,
    models: it_models,
    pricing: it_pricing,
    settings: it_settings,
    v3: it_v3,
  },
  ja: {
    auth: ja_auth,
    chat: ja_chat,
    common: ja_common,
    errors: ja_errors,
    models: ja_models,
    pricing: ja_pricing,
    settings: ja_settings,
    v3: ja_v3,
  },
  ko: {
    auth: ko_auth,
    chat: ko_chat,
    common: ko_common,
    errors: ko_errors,
    models: ko_models,
    pricing: ko_pricing,
    settings: ko_settings,
    v3: ko_v3,
  },
  pt: {
    auth: pt_auth,
    chat: pt_chat,
    common: pt_common,
    errors: pt_errors,
    models: pt_models,
    pricing: pt_pricing,
    settings: pt_settings,
    v3: pt_v3,
  },
  ru: {
    auth: ru_auth,
    chat: ru_chat,
    common: ru_common,
    errors: ru_errors,
    models: ru_models,
    pricing: ru_pricing,
    settings: ru_settings,
    v3: ru_v3,
  },
  zh: {
    auth: zh_auth,
    chat: zh_chat,
    common: zh_common,
    errors: zh_errors,
    models: zh_models,
    pricing: zh_pricing,
    settings: zh_settings,
    v3: zh_v3,
  },
} as const;
