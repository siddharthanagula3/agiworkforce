import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveReconciliationOutcome, type ReconciliationInput } from '../reconciliation-outcome';

const CLEAN_DRAIN = { processed: 40, succeeded: 40, pending: 0, terminal: 0 };
const DRIFTED_DRAIN = { processed: 40, succeeded: 38, pending: 0, terminal: 2 };

function input(over: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    settlement: CLEAN_DRAIN,
    settlementFailed: false,
    driftAlertDelivered: null,
    videoAlertFailure: null,
    stripeFailure: null,
    stripeDivergenceAlertDelivered: null,
    ...over,
  };
}

describe('a clean run', () => {
  it('is a 200 that alerts nobody', () => {
    expect(resolveReconciliationOutcome(input())).toEqual({
      status: 200,
      alerted: false,
      delivery: 'not_needed',
      reason: null,
      settlement: CLEAN_DRAIN,
    });
  });
});

describe('settlement drift', () => {
  it('alerts and stays a 200 when the alert reached a human', () => {
    const outcome = resolveReconciliationOutcome(
      input({ settlement: DRIFTED_DRAIN, driftAlertDelivered: true }),
    );

    expect(outcome).toMatchObject({ status: 200, alerted: true, delivery: 'delivered' });
    expect(outcome.reason).toBeNull();
  });

  it('is a 500 when the alert could not be delivered, because nobody has been told', () => {
    const outcome = resolveReconciliationOutcome(
      input({ settlement: DRIFTED_DRAIN, driftAlertDelivered: false }),
    );

    expect(outcome).toMatchObject({
      status: 500,
      alerted: true,
      delivery: 'undeliverable',
      reason: 'credit_settlement_drift_undeliverable',
    });
  });
});

describe('a settlement drain that never ran', () => {
  it('is a 500 that reports the settlement failure above every other one', () => {
    const outcome = resolveReconciliationOutcome(
      input({
        settlement: null,
        settlementFailed: true,
        videoAlertFailure: 'video_incident_alert_exhausted',
        stripeFailure: 'stripe_reconciliation_failed',
      }),
    );

    expect(outcome).toMatchObject({ status: 500, reason: 'credit_settlement_failed' });
    expect(outcome.settlement).toBeNull();
  });

  it('reports the failure even when the drain returned nothing without throwing', () => {
    expect(resolveReconciliationOutcome(input({ settlement: null }))).toMatchObject({
      status: 500,
      reason: 'credit_settlement_failed',
    });
  });
});

describe('failure precedence', () => {
  it('reports an exhausted video alert above a pending one', () => {
    expect(
      resolveReconciliationOutcome(input({ videoAlertFailure: 'video_incident_alert_exhausted' }))
        .reason,
    ).toBe('video_incident_alert_exhausted');
  });

  it('reports an undelivered drift alert above every downstream failure', () => {
    expect(
      resolveReconciliationOutcome(
        input({
          settlement: DRIFTED_DRAIN,
          driftAlertDelivered: false,
          videoAlertFailure: 'video_incident_alert_pending',
          stripeFailure: 'stripe_reconciliation_failed',
        }),
      ).reason,
    ).toBe('credit_settlement_drift_undeliverable');
  });

  it('reports an undelivered Stripe divergence alert above a failed comparison', () => {
    expect(
      resolveReconciliationOutcome(
        input({
          stripeDivergenceAlertDelivered: false,
          stripeFailure: 'stripe_reconciliation_failed',
        }),
      ).reason,
    ).toBe('stripe_divergence_undeliverable');
  });

  it('reports a COGS import failure last, and still as a 500', () => {
    expect(
      resolveReconciliationOutcome(input({ stripeFailure: 'cogs_import_failed' })),
    ).toMatchObject({ status: 500, reason: 'cogs_import_failed' });
  });

  it('does not turn a delivered divergence alert into a failure', () => {
    expect(
      resolveReconciliationOutcome(input({ stripeDivergenceAlertDelivered: true })),
    ).toMatchObject({ status: 200, reason: null });
  });
});
