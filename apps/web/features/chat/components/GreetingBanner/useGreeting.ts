'use client';

import React from 'react';
import { normalizeDisplayName } from '@agiworkforce/utils/display-name';
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

type TimeBand = 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';

interface TimeBandConfig {
  variants: string[];
  variantsNamed: string[];
}

const TIME_BANDS: Record<TimeBand, TimeBandConfig> = {
  earlyMorning: {
    variants: ['Good morning', 'Early start', 'Good early morning'],
    variantsNamed: ['Good morning, {name}', 'Early start, {name}', 'Good early morning, {name}'],
  },
  morning: {
    variants: ['Good morning', 'Morning', 'Good to see you this morning'],
    variantsNamed: [
      'Good morning, {name}',
      'Morning, {name}',
      'Good to see you this morning, {name}',
    ],
  },
  afternoon: {
    variants: ['Good afternoon', 'Afternoon', 'Good to see you this afternoon'],
    variantsNamed: [
      'Good afternoon, {name}',
      'Afternoon, {name}',
      'Good to see you this afternoon, {name}',
    ],
  },
  evening: {
    variants: ['Good evening', 'Evening', 'Good to see you this evening'],
    variantsNamed: [
      'Good evening, {name}',
      'Evening, {name}',
      'Good to see you this evening, {name}',
    ],
  },
  night: {
    variants: ['Good evening', 'Night session', 'Burning the midnight oil'],
    variantsNamed: [
      'Good evening, {name}',
      'Night session, {name}',
      'Burning the midnight oil, {name}',
    ],
  },
  lateNight: {
    variants: ['Good evening', 'Up late', 'Night owl mode'],
    variantsNamed: ['Good evening, {name}', 'Up late, {name}', 'Night owl mode, {name}'],
  },
};

export { normalizeDisplayName as normalizeGreetingName } from '@agiworkforce/utils/display-name';

function getTimeBand(hour: number): TimeBand {
  if (hour >= 4 && hour <= 6) return 'earlyMorning';
  if (hour >= 7 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  if (hour >= 21 && hour <= 23) return 'night';
  return 'lateNight';
}

export function useGreeting(): GreetingResult {
  const { user: compatibilityUser, isLoading, initialized } = useAuthStore();
  const canonicalUser = useBillingStore((state) => state.user);

  const userName =
    canonicalUser?.profile?.preferred_name ||
    canonicalUser?.name ||
    compatibilityUser?.preferredName ||
    compatibilityUser?.name;

  const [snapshot] = React.useState(() => {
    const now = new Date();
    return { hour: now.getHours(), variantIndex: now.getDate() % 3 };
  });

  const hour = snapshot.hour;
  const variantIndex = snapshot.variantIndex;

  const band = getTimeBand(hour);
  const config = TIME_BANDS[band];

  const rawName = userName?.split(' ')[0]?.trim();
  const cleanedName = rawName && rawName.length <= 50 ? rawName.replace(/\p{Cc}/gu, '') : undefined;
  const firstName = cleanedName ? normalizeDisplayName(cleanedName) : undefined;

  let headline: string;
  if (firstName) {
    const template = config.variantsNamed[variantIndex] ?? config.variantsNamed[0];
    headline = (template ?? '{name}').replace('{name}', firstName);
  } else {
    headline = config.variants[variantIndex] ?? config.variants[0] ?? 'Hello';
  }

  return {
    headline,
    firstName,
    nameResolved: Boolean(firstName) || (initialized && !isLoading),
  };
}
