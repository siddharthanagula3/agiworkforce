import 'server-only';

export type ReconciliationFailure =
  | 'credit_settlement_failed'
  | 'credit_settlement_drift_undeliverable'
  | 'video_incident_alert_pending'
  | 'video_incident_alert_exhausted'
  | 'video_incident_alert_recovery_failed'
  | 'stripe_reconciliation_failed'
  | 'stripe_divergence_undeliverable'
  | 'cogs_import_failed';

export type AlertDelivery = 'not_needed' | 'delivered' | 'undeliverable';

export interface SettlementDrainResult {
  processed: number;
  succeeded: number;
  pending: number;
  terminal: number;
}

export interface ReconciliationInput {
  settlement: SettlementDrainResult | null;
  settlementFailed: boolean;
  driftAlertDelivered: boolean | null;
  videoAlertFailure: ReconciliationFailure | null;
  stripeFailure: ReconciliationFailure | null;
  stripeDivergenceAlertDelivered: boolean | null;
}

export interface ReconciliationOutcome {
  status: number;
  alerted: boolean;
  delivery: AlertDelivery;
  reason: ReconciliationFailure | null;
  settlement: SettlementDrainResult | null;
}

/**
 * The order failures are reported in, worst first. A run can fail several ways
 * at once and the response carries one reason, so the order decides which
 * problem a human is told about. Money that was served and will never be
 * debited outranks a comparison that did not run.
 */
const FAILURE_PRECEDENCE: readonly ReconciliationFailure[] = [
  'credit_settlement_failed',
  'credit_settlement_drift_undeliverable',
  'video_incident_alert_exhausted',
  'video_incident_alert_pending',
  'video_incident_alert_recovery_failed',
  'stripe_divergence_undeliverable',
  'stripe_reconciliation_failed',
  'cogs_import_failed',
];

function worst(failures: readonly (ReconciliationFailure | null)[]): ReconciliationFailure | null {
  const present = failures.filter((failure): failure is ReconciliationFailure => failure !== null);
  for (const candidate of FAILURE_PRECEDENCE) {
    if (present.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * Turns one reconciliation run into the answer the cron scheduler acts on.
 *
 * The rule the route encodes, stated once so it can be tested: a run reports
 * 500 whenever a human needs to look, and an undelivered alert is exactly that
 * case. An alert that was raised and delivered is a 200, because the run did
 * its job even though it found drift.
 */
export function resolveReconciliationOutcome(input: ReconciliationInput): ReconciliationOutcome {
  if (input.settlementFailed || input.settlement === null) {
    return {
      status: 500,
      alerted: false,
      delivery: 'not_needed',
      reason: worst(['credit_settlement_failed', input.videoAlertFailure, input.stripeFailure]),
      settlement: null,
    };
  }

  const drifted = input.settlement.terminal > 0;
  const delivery: AlertDelivery = !drifted
    ? 'not_needed'
    : input.driftAlertDelivered === true
      ? 'delivered'
      : 'undeliverable';

  const divergenceUndeliverable =
    input.stripeDivergenceAlertDelivered === false ? 'stripe_divergence_undeliverable' : null;

  const reason = worst([
    delivery === 'undeliverable' ? 'credit_settlement_drift_undeliverable' : null,
    input.videoAlertFailure,
    divergenceUndeliverable,
    input.stripeFailure,
  ]);

  return {
    status: reason === null ? 200 : 500,
    alerted: drifted,
    delivery,
    reason,
    settlement: input.settlement,
  };
}
