import { describe, expect, it } from 'vitest';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  type BillingPlanCapability,
} from '@agiworkforce/types';
import {
  FREE_MEDIA_PLAN_CAPABILITY,
  freeMediaPlanIncludes,
  freeQuotaCalendarDay,
  orderedReadyFreeMedia,
} from './free-media';

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
    ...patch,
  };
}

describe('which plans include free quota image and video', () => {
  const planHas = (plan: string, capability: BillingPlanCapability) =>
    (BILLING_PLAN_CAPABILITY_TIERS[capability] as readonly string[]).includes(plan);

  it('follows the plan capability for every plan, so no plan gets media the capability withholds', () => {
    for (const plan of Object.keys(BILLING_PLAN_PRICING)) {
      for (const category of ['image', 'video'] as const) {
        expect(freeMediaPlanIncludes(plan, category), `${plan} ${category}`).toBe(
          planHas(plan, FREE_MEDIA_PLAN_CAPABILITY[category]),
        );
      }
    }
  });

  it('gives the Free plan neither kind and an unknown plan nothing', () => {
    expect(freeMediaPlanIncludes('free', 'image')).toBe(false);
    expect(freeMediaPlanIncludes('free', 'video')).toBe(false);
    expect(freeMediaPlanIncludes(null, 'image')).toBe(false);
    expect(freeMediaPlanIncludes('not-a-plan', 'video')).toBe(false);
  });

  it('keeps paid image and video generation on the plans that have it', () => {
    expect(freeMediaPlanIncludes('pro', 'image')).toBe(true);
    expect(freeMediaPlanIncludes('max_15x', 'video')).toBe(true);
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

describe('the calendar day a free offer ends', () => {
  it('is printed in UTC and passes an unreadable date through', () => {
    expect(freeQuotaCalendarDay('2026-10-21', 'en-US')).toBe('Oct 21, 2026');
    expect(freeQuotaCalendarDay('soon')).toBe('soon');
  });
});
