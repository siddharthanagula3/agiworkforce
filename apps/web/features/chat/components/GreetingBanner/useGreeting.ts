'use client';

import React from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

interface GreetingResult {
  headline: string;
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

/**
 * Make a profile name presentable in a hero headline.
 *
 * The greeting is the largest text on the empty chat screen, so it inherits
 * whatever casing the identity provider happens to store. A Clerk profile
 * saved as "SIDDHARTHA" rendered "Good evening, SIDDHARTHA" — the headline
 * shouts at the user, which reads as a bug in a product demo.
 *
 * Only the two unambiguously-wrong shapes are touched:
 *   ALL CAPS  -> Title Case   ("SIDDHARTHA" -> "Siddhartha")
 *   all lower -> Title Case   ("siddhartha" -> "Siddhartha")
 *
 * Anything with deliberate internal capitalisation is left exactly as written,
 * so "McDonald", "d'Angelo", "DeShawn" and "van Dijk" survive. Two-letter
 * all-caps names are also left alone because those are initials ("JT", "AJ"),
 * and title-casing them would be the same class of error in reverse.
 * Hyphens and apostrophes start new words, so "O'BRIEN" -> "O'Brien" and
 * "MARY-JANE" -> "Mary-Jane".
 */
export function normalizeGreetingName(name: string): string {
  const hasLower = name !== name.toLocaleUpperCase();
  const hasUpper = name !== name.toLocaleLowerCase();

  // Mixed case is intentional — never second-guess it.
  if (hasLower && hasUpper) return name;
  // Initials, not a shouted name.
  if (!hasLower && name.length <= 2) return name;
  // No cased characters at all (e.g. CJK, digits) — nothing to normalise.
  if (!hasLower && !hasUpper) return name;

  return name
    .toLocaleLowerCase()
    .replace(
      /(^|[\s\-'’])(\p{L})/gu,
      (_match, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase(),
    );
}

function getTimeBand(hour: number): TimeBand {
  if (hour >= 4 && hour <= 6) return 'earlyMorning';
  if (hour >= 7 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  if (hour >= 21 && hour <= 23) return 'night';
  return 'lateNight';
}

export function useGreeting(): GreetingResult {
  const { user: compatibilityUser } = useAuthStore();
  const canonicalUser = useBillingStore((state) => state.user);

  // PER-2: this used to read `localStorage['agi.profile.preferredName']` and
  // give it precedence — a key NOTHING in the repository ever wrote, so the
  // "preferred name" mechanism was dead code masquerading as the
  // personalization feature. The preferred name now comes from the same
  // server-resolved identity every other surface reads (PER-8): Settings →
  // General writes it to the `general` settings namespace, GET /api/me
  // resolves it, and the auth store carries it. Falls back to the full display
  // name when the user has not set a preferred one.
  const userName =
    canonicalUser?.profile?.preferred_name ||
    canonicalUser?.name ||
    compatibilityUser?.preferredName ||
    compatibilityUser?.name;

  // Memoize: greeting only changes when user name changes (time band is stable per page load)
  const [snapshot] = React.useState(() => {
    const now = new Date();
    return { hour: now.getHours(), variantIndex: now.getDate() % 3 };
  });

  const hour = snapshot.hour;
  const variantIndex = snapshot.variantIndex;

  const band = getTimeBand(hour);
  const config = TIME_BANDS[band];

  // Cap name length to prevent layout overflow; strip non-printable chars.
  // `\p{Cc}` is the Unicode control category (C0 0x00-0x1F plus DEL and the C1
  // range), which covers the previous explicit escape range and satisfies
  // `no-control-regex` without an inline suppression.
  const rawName = userName?.split(' ')[0]?.trim();
  const cleanedName = rawName && rawName.length <= 50 ? rawName.replace(/\p{Cc}/gu, '') : undefined;
  const firstName = cleanedName ? normalizeGreetingName(cleanedName) : undefined;

  let headline: string;
  if (firstName) {
    const template = config.variantsNamed[variantIndex] ?? config.variantsNamed[0];
    headline = (template ?? '{name}').replace('{name}', firstName);
  } else {
    headline = config.variants[variantIndex] ?? config.variants[0] ?? 'Hello';
  }

  return {
    headline,
  };
}
