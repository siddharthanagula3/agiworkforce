import { normalizeDisplayName } from '@agiworkforce/utils/display-name';

export type GreetingTimeBand =
  'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';

export type GreetingGroup = 'morning' | 'afternoon' | 'evening';

interface GreetingBandCopy {
  variants: readonly string[];
  variantsNamed: readonly string[];
}

export const GREETING_TIME_BANDS: Record<GreetingTimeBand, GreetingBandCopy> = {
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

export const GREETING_BAND_GROUP: Record<GreetingTimeBand, GreetingGroup> = {
  earlyMorning: 'morning',
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'evening',
  lateNight: 'evening',
};

const GREETING_VARIANT_COUNT = 3;
const GREETING_NAME_MAX_LENGTH = 50;

export function greetingTimeBand(hour: number): GreetingTimeBand {
  if (hour >= 4 && hour <= 6) return 'earlyMorning';
  if (hour >= 7 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  if (hour >= 21 && hour <= 23) return 'night';
  return 'lateNight';
}

export function greetingVariantIndex(dayOfMonth: number): number {
  return dayOfMonth % GREETING_VARIANT_COUNT;
}

export function greetingFirstName(userName: string | null | undefined): string | undefined {
  const raw = userName?.split(' ')[0]?.trim();
  if (!raw || raw.length > GREETING_NAME_MAX_LENGTH) return undefined;
  const cleaned = raw.replace(/\p{Cc}/gu, '');
  return cleaned ? normalizeDisplayName(cleaned) : undefined;
}

export function greetingHeadline(
  band: GreetingTimeBand,
  variantIndex: number,
  firstName?: string,
): string {
  const copy = GREETING_TIME_BANDS[band];
  if (firstName) {
    const template = copy.variantsNamed[variantIndex] ?? copy.variantsNamed[0];
    return (template ?? '{name}').replace('{name}', firstName);
  }
  return copy.variants[variantIndex] ?? copy.variants[0] ?? 'Hello';
}

export function resolveGreetingHeadline(now: Date, userName?: string | null): string {
  return greetingHeadline(
    greetingTimeBand(now.getHours()),
    greetingVariantIndex(now.getDate()),
    greetingFirstName(userName),
  );
}
