'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  GREETING_BAND_GROUP,
  GREETING_TIME_BANDS,
  greetingFirstName,
  greetingHeadline,
  greetingTimeBand,
  greetingVariantIndex,
} from '@agiworkforce/unified-chat';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

interface GreetingResult {
  headline: string;
  /** The normalized first name the headline used, absent when none is known. */
  firstName: string | undefined;
  /**
   * False while the account is still loading. A caller that greets by name must
   * wait for this, or the nameless variant renders first and the name pops in.
   */
  nameResolved: boolean;
}

export function useGreeting(): GreetingResult {
  const { t, i18n } = useTranslation('chat');
  const { user: compatibilityUser, isLoading, initialized } = useAuthStore();
  const canonicalUser = useBillingStore((state) => state.user);

  const userName =
    canonicalUser?.profile?.preferred_name ||
    canonicalUser?.name ||
    compatibilityUser?.preferredName ||
    compatibilityUser?.name;

  const [snapshot] = React.useState(() => {
    const now = new Date();
    return { hour: now.getHours(), variantIndex: greetingVariantIndex(now.getDate()) };
  });

  const band = greetingTimeBand(snapshot.hour);
  const firstName = greetingFirstName(userName);

  const language = i18n?.language ?? 'en';
  const localized = !language.toLowerCase().startsWith('en');
  let headline: string;
  if (localized) {
    const group = GREETING_BAND_GROUP[band];
    const fallback = GREETING_TIME_BANDS[band].variants[0];
    headline = firstName
      ? t(`greeting.${group}Named`, {
          name: firstName,
          defaultValue: `${fallback}, {{name}}`,
        })
      : t(`greeting.${group}`, { defaultValue: fallback ?? 'Hello' });
  } else {
    headline = greetingHeadline(band, snapshot.variantIndex, firstName);
  }

  return {
    headline,
    firstName,
    nameResolved: Boolean(firstName) || (initialized && !isLoading),
  };
}
