import { describe, expect, it } from 'vitest';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  type BillingPlanCapability,
} from '@agiworkforce/types';
import {
  FREE_MEDIA_PLAN_CAPABILITY,
  catalogueFreeMediaOffer,
  freeMediaAccess,
  freeMediaLastDayLabel,
  freeMediaLimitedLine,
  freeMediaOfferNote,
  freeMediaPlanStanding,
  freeQuotaCalendarDay,
  limitedFreeMedia,
  orderedReadyFreeMedia,
  readyFreeMediaOffer,
} from './free-media-offer';

const RESETS_AT = '2026-10-05T00:00:00.000Z';

function model(patch: Partial<FreeQuotaModel> & Pick<FreeQuotaModel, 'key'>): FreeQuotaModel {
  return {
    displayName: patch.key,
    providerModelId: patch.key,
    category: 'image',
    limit: 100,
    unit: 'images',
    consumedApproximate: 0,
    expiresOn: '2026-10-21',
    status: 'ready',
    ...patch,
  };
}

function catalogue(patch: Partial<FreeQuotaCatalogue> = {}): FreeQuotaCatalogue {
  return {
    issuer: 'Fixture Cloud',
    observedOn: '2026-09-19',
    evidenceUrl: 'https://provider.example/free-quota',
    reportedEligible: 4,
    reportedUnavailable: 0,
    models: [
      model({ key: 'image-early', expiresOn: '2026-10-21' }),
      model({ key: 'image-late', expiresOn: '2026-11-26' }),
      model({ key: 'image-spent', expiresOn: '2026-12-31', status: 'exhausted' }),
      model({ key: 'video-only', category: 'video', unit: 'seconds', expiresOn: '2026-11-05' }),
    ],
    limitedOffer: [
      { category: 'image', dailyCap: 5, remainingToday: 5, resetsAt: RESETS_AT },
      { category: 'video', dailyCap: 1, remainingToday: 1, resetsAt: RESETS_AT },
    ],
    ...patch,
  };
}

function label(planIncludes: boolean, value: FreeQuotaCatalogue | null, kind: 'image' | 'video') {
  return freeMediaAccess({ planIncludes, offer: catalogueFreeMediaOffer(value, kind) });
}

describe('the label on image and video generation', () => {
  it('is Limited, with the last day the latest-ending ready offering of that kind still serves', () => {
    expect(label(false, catalogue(), 'image')).toEqual({ label: 'limited', lastDay: '2026-11-25' });
    expect(label(false, catalogue(), 'video')).toEqual({ label: 'limited', lastDay: '2026-11-04' });
  });

  it('ignores a later date that belongs to an offering which is not ready', () => {
    expect(readyFreeMediaOffer(catalogue().models, 'image')).toEqual({ lastDay: '2026-11-25' });
  });

  it.each([
    ['2026-10-21', '2026-10-20'],
    ['2026-11-01', '2026-10-31'],
    ['2027-01-01', '2026-12-31'],
    ['2028-03-01', '2028-02-29'],
  ])(
    'takes the day before the catalogue end date %s, the first day the server refuses',
    (expiresOn, lastDay) => {
      expect(readyFreeMediaOffer([model({ key: 'image-only', expiresOn })], 'image')).toEqual({
        lastDay,
      });
    },
  );

  it('states no day when the catalogue end date cannot be read as one', () => {
    expect(readyFreeMediaOffer([model({ key: 'image-only', expiresOn: 'soon' })], 'image')).toEqual(
      { lastDay: null },
    );
  });

  it('is Upgrade again once no offering of that kind is ready', () => {
    for (const status of ['exhausted', 'expired', 'unavailable'] as const) {
      const lapsed = catalogue({
        models: catalogue().models.map((entry) =>
          entry.category === 'image' ? { ...entry, status } : entry,
        ),
      });
      expect(label(false, lapsed, 'image'), status).toEqual({ label: 'upgrade' });
      expect(label(false, lapsed, 'video'), status).toEqual({
        label: 'limited',
        lastDay: '2026-11-04',
      });
    }
  });

  it('is Upgrade when the offer does not cover the account, or no catalogue was read', () => {
    expect(label(false, catalogue({ limitedOffer: undefined }), 'image')).toEqual({
      label: 'upgrade',
    });
    expect(label(false, null, 'video')).toEqual({ label: 'upgrade' });
    const imagesOnly = catalogue({ limitedOffer: [catalogue().limitedOffer![0]!] });
    expect(label(false, imagesOnly, 'image').label).toBe('limited');
    expect(label(false, imagesOnly, 'video')).toEqual({ label: 'upgrade' });
  });

  it('never replaces what a plan already includes', () => {
    expect(label(true, catalogue(), 'image')).toEqual({ label: 'included' });
    expect(label(true, null, 'video')).toEqual({ label: 'included' });
  });

  it('states no date when a ready offering has none', () => {
    const undated = catalogue({
      models: [model({ key: 'image-early' }), model({ key: 'image-undated', expiresOn: null })],
    });
    expect(label(false, undated, 'image')).toEqual({ label: 'limited', lastDay: null });
    expect(freeMediaLimitedLine(null)).toBe('Free while our free capacity lasts.');
  });
});

describe('where a plan stands on free image and video', () => {
  const planHas = (plan: string, capability: BillingPlanCapability) =>
    (BILLING_PLAN_CAPABILITY_TIERS[capability] as readonly string[]).includes(plan);

  it('is included with the paid capability, open to the offer on other managed cloud plans, and closed elsewhere', () => {
    const standings = new Set<string>();
    for (const plan of Object.keys(BILLING_PLAN_PRICING)) {
      for (const category of ['image', 'video'] as const) {
        const standing = freeMediaPlanStanding(plan, category);
        standings.add(standing);
        expect(standing, `${plan} ${category}`).toBe(
          planHas(plan, FREE_MEDIA_PLAN_CAPABILITY[category])
            ? 'included'
            : planHas(plan, 'managed_chat')
              ? 'offer_eligible'
              : 'ineligible',
        );
      }
    }
    expect([...standings].sort()).toEqual(['included', 'ineligible', 'offer_eligible']);
    expect(freeMediaPlanStanding('free', 'image')).toBe('offer_eligible');
    expect(freeMediaPlanStanding('free', 'video')).toBe('offer_eligible');
    expect(freeMediaPlanStanding(null, 'image')).toBe('ineligible');
    expect(freeMediaPlanStanding('not-a-plan', 'video')).toBe('ineligible');
  });
});

describe('the line beside the Limited label', () => {
  it('says free while capacity lasts, with the last day and the zone that day is counted in', () => {
    expect(freeMediaLimitedLine('2026-11-25', 'en-GB')).toBe(
      'Free while our free capacity lasts, until 25 Nov 2026 (UTC) at the latest.',
    );
    expect(freeMediaLastDayLabel('2026-11-25', 'en-GB')).toBe('25 Nov 2026 (UTC)');
    expect(freeMediaLastDayLabel('2026-11-25')).toBe(`${freeQuotaCalendarDay('2026-11-25')} (UTC)`);
  });

  it("says when today's share is used and when it resets, instead of promising more", () => {
    const limited = limitedFreeMedia(
      catalogue({
        limitedOffer: [{ category: 'image', dailyCap: 5, remainingToday: 0, resetsAt: RESETS_AT }],
      }),
      'image',
    )!;
    const threeHoursBefore = Date.parse(RESETS_AT) - 3 * 60 * 60 * 1_000;

    expect(freeMediaOfferNote(limited, threeHoursBefore)).toBe(
      "Today's free limit is used. Resets in 3 hours.",
    );
    expect(freeMediaOfferNote({ ...limited, remainingToday: 2 }, threeHoursBefore)).toBe(
      freeMediaLimitedLine('2026-11-25'),
    );
  });
});

describe('which ready free media offering is used first', () => {
  it('follows the order the server decided, then the listing order', () => {
    const ordered = catalogue({ mediaUseOrder: ['image-late', 'video-only'] });

    expect(orderedReadyFreeMedia(ordered).map((entry) => entry.key)).toEqual([
      'image-late',
      'video-only',
      'image-early',
    ]);
    expect(orderedReadyFreeMedia(ordered, 'image').map((entry) => entry.key)).toEqual([
      'image-late',
      'image-early',
    ]);
    expect(orderedReadyFreeMedia(catalogue(), 'image').map((entry) => entry.key)).toEqual([
      'image-early',
      'image-late',
    ]);
  });
});
