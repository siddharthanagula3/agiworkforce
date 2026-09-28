'use client';

import type { FriendlyError } from '@agiworkforce/utils';
import { useUiTranslation } from '@agiworkforce/ui/i18n';

export function useFriendlyErrorCopy(friendly: FriendlyError): FriendlyError {
  const { t } = useUiTranslation('errors');
  const key = friendly.copyKey;
  if (!key) return friendly;
  return {
    ...friendly,
    title: t(`friendly.${key}.title`, friendly.title),
    message: t(`friendly.${key}.message`, friendly.message),
    suggestion: friendly.suggestion && t(`friendly.${key}.suggestion`, friendly.suggestion),
  };
}
