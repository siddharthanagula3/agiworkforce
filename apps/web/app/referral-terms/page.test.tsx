import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { billingIntervalsForPlan } from '@agiworkforce/types';
import { TRIAL_REMINDER_DAYS } from '@/lib/services/trial-reminder-service';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import ReferralTermsPage from './page';

const SOURCE = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
const YEARLY_CADENCE = /every year|yearly|annual/i;

function trialCopy(): string {
  const { container } = render(<ReferralTermsPage />);
  return container.querySelector('#trial')?.textContent?.replace(/\s+/g, ' ') ?? '';
}

describe('ReferralTermsPage', () => {
  it('bills the converted trial every month, the only cadence the catalog sells Pro at', () => {
    expect(
      billingIntervalsForPlan('pro'),
      'Pro gained or lost a billing interval: revise the trial cadence sentence on /referral-terms as a dated policy version',
    ).toEqual(['monthly']);

    const copy = trialCopy();
    expect(copy).toContain('billed every month, until you cancel.');
    expect(copy).not.toMatch(YEARLY_CADENCE);
    expect(SOURCE).not.toContain('every year');
  });

  it('promises the emailed reminder and its cancel link right after the monthly cadence', () => {
    expect(trialCopy()).toContain(
      `billed every month, until you cancel. ${TRIAL_REMINDER_DAYS} days before it converts we ` +
        'email you a reminder with the amount, the date and a one-click cancel link.',
    );
  });
});
