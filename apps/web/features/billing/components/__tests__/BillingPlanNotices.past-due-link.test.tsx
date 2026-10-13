import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BillingPlanNotices, type BillingPlanNoticesProps } from '../BillingPlanNotices';

const EXPLANATION_PATH = '/payment-failure';
const EXPLANATION_LINK = { name: 'why a payment fails and what to do' };
const APP_DIR = join(__dirname, '..', '..', '..', '..', 'app');

function notices(overrides: Partial<BillingPlanNoticesProps>) {
  return render(
    <BillingPlanNotices
      planLabel="Pro"
      status="active"
      billingSource="stripe"
      isEnterprise={false}
      periodEndSeconds={null}
      cancelAtPeriodEnd={false}
      planState={null}
      catalogPriceLabel={null}
      paymentMethodLabel={null}
      openInvoice={null}
      actionPending={false}
      actionError={null}
      portalPending={false}
      onResume={vi.fn()}
      onOpenPortal={vi.fn()}
      {...overrides}
    />,
  );
}

describe('the failed-payment notice in Settings, Billing', () => {
  it.each(['past_due', 'unpaid'])(
    'links the page that explains a failed payment when the plan is %s',
    (status) => {
      notices({ status });

      const notice = within(screen.getByRole('alert'));
      const link = notice.getByRole('link', EXPLANATION_LINK);
      expect(link).toHaveAttribute('href', EXPLANATION_PATH);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    },
  );

  it('keeps that link when the plan is not billed through Stripe and no fix can be offered here', () => {
    notices({ status: 'past_due', billingSource: 'manual' });

    const notice = within(screen.getByRole('alert'));
    expect(notice.getByRole('link', EXPLANATION_LINK)).toHaveAttribute('href', EXPLANATION_PATH);
    expect(notice.queryByRole('button', { name: 'Update payment method' })).toBeNull();
  });

  it('points at a page the site serves', () => {
    expect(existsSync(join(APP_DIR, EXPLANATION_PATH, 'page.tsx'))).toBe(true);
  });

  it('shows no failed-payment link on a healthy plan or an Enterprise contract', () => {
    const healthy = notices({ status: 'active' });
    expect(screen.queryByRole('link', EXPLANATION_LINK)).toBeNull();
    healthy.unmount();

    notices({ status: 'past_due', isEnterprise: true });
    expect(screen.queryByRole('link', EXPLANATION_LINK)).toBeNull();
  });
});
