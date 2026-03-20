'use client';

import React from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';

interface GreetingResult {
  headline: string;
  emoji: string;
  subtext: string;
}

type TimeBand = 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';

interface TimeBandConfig {
  emoji: string;
  variants: string[];
  variantsNamed: string[];
}

const TIME_BANDS: Record<TimeBand, TimeBandConfig> = {
  earlyMorning: {
    emoji: '☕',
    variants: ['Rise and shine', 'Early start', 'Good early morning'],
    variantsNamed: ['Rise and shine, {name}', 'Early start, {name}', 'Good early morning, {name}'],
  },
  morning: {
    emoji: '🌤️',
    variants: ['Good morning', 'Morning', 'Good to see you this morning'],
    variantsNamed: [
      'Good morning, {name}',
      'Morning, {name}',
      'Good to see you this morning, {name}',
    ],
  },
  afternoon: {
    emoji: '☀️',
    variants: ['Good afternoon', 'Afternoon', 'Good to see you this afternoon'],
    variantsNamed: [
      'Good afternoon, {name}',
      'Afternoon, {name}',
      'Good to see you this afternoon, {name}',
    ],
  },
  evening: {
    emoji: '🌇',
    variants: ['Good evening', 'Evening', 'Good to see you this evening'],
    variantsNamed: [
      'Good evening, {name}',
      'Evening, {name}',
      'Good to see you this evening, {name}',
    ],
  },
  night: {
    emoji: '🌙',
    variants: ['Good night', 'Night session', 'Burning the midnight oil'],
    variantsNamed: [
      'Good night, {name}',
      'Night session, {name}',
      'Burning the midnight oil, {name}',
    ],
  },
  lateNight: {
    emoji: '🌙',
    variants: ['Late night session', 'Up late', 'Night owl mode'],
    variantsNamed: ['Late night session, {name}', 'Up late, {name}', 'Night owl mode, {name}'],
  },
};

function getTimeBand(hour: number): TimeBand {
  if (hour >= 4 && hour <= 6) return 'earlyMorning';
  if (hour >= 7 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  if (hour >= 21 && hour <= 23) return 'night';
  return 'lateNight';
}

export function useGreeting(): GreetingResult {
  const { user } = useAuthStore();
  const userName = user?.name;

  // Memoize: greeting only changes when user name changes (time band is stable per page load)
  const [snapshot] = React.useState(() => {
    const now = new Date();
    return { hour: now.getHours(), variantIndex: now.getDate() % 3 };
  });

  const hour = snapshot.hour;
  const variantIndex = snapshot.variantIndex;

  const band = getTimeBand(hour);
  const config = TIME_BANDS[band];

  // Cap name length to prevent layout overflow; strip non-printable chars
  const rawName = userName?.split(' ')[0]?.trim();
  const firstName =
    // eslint-disable-next-line no-control-regex -- intentional: strip non-printable control chars from user names
    rawName && rawName.length <= 50 ? rawName.replace(/[\u0000-\u001F\u007F]/g, '') : undefined;

  let headline: string;
  if (firstName) {
    const template = config.variantsNamed[variantIndex] ?? config.variantsNamed[0];
    headline = (template ?? '{name}').replace('{name}', firstName);
  } else {
    headline = config.variants[variantIndex] ?? config.variants[0] ?? 'Hello';
  }

  return {
    headline,
    emoji: config.emoji,
    subtext: 'What can I help you with today?',
  };
}
