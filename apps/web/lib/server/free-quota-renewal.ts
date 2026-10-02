import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';
import {
  PLATFORM_ADMIN_ENV_VAR,
  parsePlatformAdminIds,
} from '@/features/admin/lib/platform-admin-access';
import {
  UNREADABLE_SUSPENSION_AT_MS,
  attestationStanding,
  readFreeQuotaState,
  type AttestationStanding,
  type FreeQuotaPolicy,
} from '@/lib/free-quota-authorization';
import { logger } from '@/lib/logger';
import { SITE_URL } from '@/lib/seo/site';
import {
  alertHtml,
  pageOnCall,
  type AlertSeverity,
  type PageOutcome,
} from '@/lib/server/incident/pager';
import { getIdentityUser } from '@/lib/server/identity';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { loadFreePools, termsReviewStanding, type FreeQuotaTermsReview } from './free-pools';
import { loadFreeQuotaPolicy, sharedFreeQuotaStore } from './free-quota-catalogue';

const REMINDER_PREFIX = 'agi-fquota-renewal';
const REMINDER_LEASE_SECONDS = 15 * 60;
const REMINDER_RETENTION_SECONDS = 120 * 24 * 60 * 60;
const PAGER_SOURCE = 'free-quota-renewal';
const OPERATOR_QUOTA_PATH = '/operator#quota';
const FREE_POOLS_FILE = 'apps/web/config/free-pools.json';
const RUNBOOK_FILE = 'docs/runbooks/free-quota-models.md';
const USER_IMPACT =
  'While a gate is lapsed, every free quota model shows "Not available right now" in the model picker, and a message sent to one is refused before it reaches the provider.';

export type FreeQuotaRenewalAlert =
  | { reason: 'terms_review_expiring' | 'terms_review_expired'; review: FreeQuotaTermsReview }
  | {
      reason: 'console_check_expiring' | 'console_check_expired' | 'console_check_other_key';
      checkedAtMs: number;
      freshUntilMs: number;
    }
  | { reason: 'console_check_missing' | 'billing_signal_unreadable'; day: string }
  | { reason: 'billing_signal'; signalAtMs: number };

export type FreeQuotaRenewalReason = FreeQuotaRenewalAlert['reason'];

export interface FreeQuotaRenewalMessage {
  severity: AlertSeverity;
  subject: string;
  text: string;
}

export type FreeQuotaReminderOutcome = 'sent' | 'already_sent' | 'undelivered';

export type FreeQuotaRenewalRun =
  | { checked: false; missing: Array<'shared_state' | 'credential' | 'inventory'> }
  | {
      checked: true;
      reminders: Array<{ reason: FreeQuotaRenewalReason; outcome: FreeQuotaReminderOutcome }>;
    };

export function freeQuotaRenewalAlerts(input: {
  termsReview: FreeQuotaTermsReview | null;
  attestation: AttestationStanding;
  policy: FreeQuotaPolicy;
  nowMs: number;
}): FreeQuotaRenewalAlert[] {
  const { termsReview, attestation, policy, nowMs } = input;
  const alerts: FreeQuotaRenewalAlert[] = [];
  const terms = termsReviewStanding(termsReview, nowMs, policy.renewalReminderLeadMs);
  if (termsReview && (terms === 'expiring' || terms === 'expired')) {
    alerts.push({
      reason: terms === 'expiring' ? 'terms_review_expiring' : 'terms_review_expired',
      review: termsReview,
    });
  }
  switch (attestation.standing) {
    case 'billing_signal':
      alerts.push(
        attestation.signalAtMs === UNREADABLE_SUSPENSION_AT_MS
          ? { reason: 'billing_signal_unreadable', day: utcDay(nowMs) }
          : { reason: 'billing_signal', signalAtMs: attestation.signalAtMs },
      );
      break;
    case 'expiring':
    case 'other_credential':
      alerts.push({
        reason:
          attestation.standing === 'expiring'
            ? 'console_check_expiring'
            : 'console_check_other_key',
        checkedAtMs: attestation.attestation.checkedAtMs,
        freshUntilMs: attestation.freshUntilMs,
      });
      break;
    case 'stale':
      if (nowMs >= attestation.freshUntilMs) {
        alerts.push({
          reason: 'console_check_expired',
          checkedAtMs: attestation.attestation.checkedAtMs,
          freshUntilMs: attestation.freshUntilMs,
        });
      }
      break;
    case 'missing':
      if (terms === 'current' || terms === 'expiring') {
        alerts.push({ reason: 'console_check_missing', day: utcDay(nowMs) });
      }
      break;
    case 'current':
      break;
  }
  return alerts;
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function reminderAnchor(alert: FreeQuotaRenewalAlert): string | number {
  switch (alert.reason) {
    case 'terms_review_expiring':
    case 'terms_review_expired':
      return alert.review.expiresAtMs;
    case 'console_check_expiring':
    case 'console_check_expired':
    case 'console_check_other_key':
      return alert.freshUntilMs;
    case 'console_check_missing':
    case 'billing_signal_unreadable':
      return alert.day;
    case 'billing_signal':
      return alert.signalAtMs;
  }
}

function dedupeKey(alert: FreeQuotaRenewalAlert): string {
  return `${REMINDER_PREFIX}:${alert.reason}:${reminderAnchor(alert)}`;
}

function at(ms: number): string {
  const instant = new Date(ms);
  return Number.isNaN(instant.getTime()) ? 'an unrecorded time' : instant.toISOString();
}

function subjectLine(severity: AlertSeverity, environment: string, detail: string): string {
  return `[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}] ${environment} free quota models · ${detail}`;
}

function renewalNotice(alert: FreeQuotaRenewalAlert): {
  severity: AlertSeverity;
  detail: string;
  body: string[];
} {
  switch (alert.reason) {
    case 'terms_review_expiring':
      return {
        severity: 'warning',
        detail: `renew the terms review by ${at(alert.review.expiresAtMs)}`,
        body: [
          `The terms review in ${FREE_POOLS_FILE} runs out at ${at(alert.review.expiresAtMs)}. When it does, every free quota model stops serving.`,
          'Renewing it is a reviewed code change plus a deploy, so start now.',
        ],
      };
    case 'terms_review_expired':
      return {
        severity: 'critical',
        detail: 'the terms review ran out, free models are off',
        body: [
          `The terms review in ${FREE_POOLS_FILE} ran out at ${at(alert.review.expiresAtMs)}, so every free quota model is off.`,
          'They serve again once a renewed review is merged and deployed.',
        ],
      };
    case 'console_check_expiring':
      return {
        severity: 'warning',
        detail: `renew the console check by ${at(alert.freshUntilMs)}`,
        body: [
          `The Free quota only console check recorded at ${at(alert.checkedAtMs)} stops counting at ${at(alert.freshUntilMs)}. When it does, every free quota model stops serving.`,
          'Check the provider console and record a new check in the operator console.',
        ],
      };
    case 'console_check_expired':
      return {
        severity: 'critical',
        detail: 'the console check ran out, free models are off',
        body: [
          `The Free quota only console check recorded at ${at(alert.checkedAtMs)} stopped counting at ${at(alert.freshUntilMs)}, so every free quota model is off.`,
          'Check the provider console and record a new check in the operator console.',
        ],
      };
    case 'console_check_missing':
      return {
        severity: 'critical',
        detail: 'no console check is recorded, free models are off',
        body: [
          'The terms review is current, but no Free quota only console check is recorded for this deployment, so every free quota model is off. That is the state before the first check, and after a recorded check is lost or can no longer be read.',
          'Check the provider console and record a check in the operator console. This reminder repeats each day until one is recorded.',
        ],
      };
    case 'console_check_other_key':
      return {
        severity: 'critical',
        detail: 'the provider key changed, free models are off',
        body: [
          `The console check recorded at ${at(alert.checkedAtMs)} was made for a different provider key than this deployment now uses, so every free quota model is off.`,
          'Check the provider console for the current key and record a new check in the operator console.',
        ],
      };
    case 'billing_signal':
      return {
        severity: 'critical',
        detail: 'the provider reported a billing state, free models are off',
        body: [
          `At ${at(alert.signalAtMs)} the provider answered a free model with an account billing code, so every free quota model was withdrawn.`,
          "Check the account's billing and that Free quota only is on, then record a new check in the operator console.",
        ],
      };
    case 'billing_signal_unreadable':
      return {
        severity: 'critical',
        detail: 'a billing signal record cannot be read, free models are off',
        body: [
          "A billing signal record exists for this deployment's provider key but cannot be read, so every free quota model is off and no console check can clear it.",
          "Check the account's billing in the provider console. Once it is clear, delete the record as the runbook describes under Billing signal, then record a new console check. This reminder repeats each day until the record is gone.",
        ],
      };
  }
}

export function describeFreeQuotaRenewal(
  alert: FreeQuotaRenewalAlert,
  environment: string,
): FreeQuotaRenewalMessage {
  const { severity, detail, body } = renewalNotice(alert);
  const text = [
    `Environment: ${environment}`,
    '',
    ...body,
    '',
    USER_IMPACT,
    '',
    `Operator console: ${SITE_URL}${OPERATOR_QUOTA_PATH}`,
    `Runbook: ${RUNBOOK_FILE}`,
  ].join('\n');
  return { severity, subject: subjectLine(severity, environment, detail), text };
}

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

async function platformAdminAddresses(): Promise<string[]> {
  const ids = parsePlatformAdminIds(process.env[PLATFORM_ADMIN_ENV_VAR]);
  const users = await Promise.all(
    ids.map((id) =>
      getIdentityUser(id).catch((error: unknown) => {
        logger.warn(
          { event: 'free_quota_renewal_admin_unresolved', error },
          '[free-quota] a platform admin could not be resolved for the renewal reminder',
        );
        return null;
      }),
    ),
  );
  const addresses = users.flatMap((user) =>
    user?.primaryEmail && user.primaryEmailVerification === 'verified' ? [user.primaryEmail] : [],
  );
  return addresses.length > 0 ? [...new Set(addresses)] : [getHandoffConfig().fallbackEmail];
}

async function deliver(
  message: FreeQuotaRenewalMessage,
  recipients: readonly string[],
): Promise<{ paged: PageOutcome; emailed: number }> {
  const html = alertHtml(message.text);
  const [paged, sent] = await Promise.all([
    pageOnCall(message.severity, message.subject, message.text, undefined, PAGER_SOURCE),
    Promise.allSettled(
      recipients.map((to) =>
        sendSupportEmail({ to, subject: message.subject, text: message.text, html }),
      ),
    ),
  ]);
  let emailed = 0;
  for (const result of sent) {
    if (result.status === 'fulfilled') {
      if (result.value.delivered) emailed += 1;
      continue;
    }
    logger.error(
      { event: 'free_quota_renewal_email_failed', error: result.reason },
      '[free-quota] a renewal reminder email could not be sent',
    );
  }
  return { paged, emailed };
}

async function sendReminder(
  alert: FreeQuotaRenewalAlert,
  recipients: () => Promise<readonly string[]>,
): Promise<boolean> {
  const message = describeFreeQuotaRenewal(alert, environmentLabel());
  const { paged, emailed } = await deliver(message, await recipients());
  const delivered = emailed > 0 || paged === 'paged';
  const fields = {
    event: delivered
      ? 'free_quota_renewal_reminder_sent'
      : 'free_quota_renewal_reminder_undeliverable',
    reason: alert.reason,
    severity: message.severity,
    emailed,
    paged,
  };
  if (!delivered) {
    logger.error(fields, '[free-quota] renewal reminder reached nobody; the next run tries again');
  } else if (message.severity === 'critical') {
    logger.error(fields, '[free-quota] free quota models are off; platform admins were told');
  } else {
    logger.warn(fields, '[free-quota] a free quota gate runs out soon; platform admins were told');
  }
  return delivered;
}

async function settleClaim(
  store: KeyValueStore,
  alert: FreeQuotaRenewalAlert,
  delivered: boolean,
  nowMs: number,
): Promise<void> {
  try {
    if (delivered) {
      await store.set(
        dedupeKey(alert),
        { atMs: nowMs },
        { ttlSeconds: REMINDER_RETENTION_SECONDS },
      );
    } else {
      await store.delete(dedupeKey(alert));
    }
  } catch (error) {
    logger.error(
      { event: 'free_quota_renewal_claim_unsettled', reason: alert.reason, delivered, error },
      '[free-quota] a renewal reminder claim could not be settled; its lease runs out before the next run',
    );
  }
}

async function remindOnce(
  store: KeyValueStore,
  alert: FreeQuotaRenewalAlert,
  nowMs: number,
  recipients: () => Promise<readonly string[]>,
): Promise<FreeQuotaReminderOutcome> {
  const claimed = await store.set(
    dedupeKey(alert),
    { atMs: nowMs },
    { onlyIfAbsent: true, ttlSeconds: REMINDER_LEASE_SECONDS },
  );
  if (!claimed) return 'already_sent';
  let delivered = false;
  try {
    delivered = await sendReminder(alert, recipients);
  } finally {
    await settleClaim(store, alert, delivered, nowMs);
  }
  return delivered ? 'sent' : 'undelivered';
}

export async function remindFreeQuotaRenewals(nowMs: number): Promise<FreeQuotaRenewalRun> {
  const inventory = loadFreePools().inventory;
  const store = sharedFreeQuotaStore(process.env.NODE_ENV);
  const apiKey = process.env['QWEN_API_KEY'] ?? '';
  if (!inventory || !store || !apiKey) {
    return {
      checked: false,
      missing: [
        ...(store ? [] : (['shared_state'] as const)),
        ...(apiKey ? [] : (['credential'] as const)),
        ...(inventory ? [] : (['inventory'] as const)),
      ],
    };
  }
  const policy = loadFreeQuotaPolicy();
  const state = await readFreeQuotaState(store, {
    apiKey,
    observedOn: inventory.observedOn,
    offeringKeys: [],
  });
  const alerts = freeQuotaRenewalAlerts({
    termsReview: inventory.termsReview,
    attestation: attestationStanding({ state, apiKey, policy, nowMs }),
    policy,
    nowMs,
  });
  if (alerts.length === 0) return { checked: true, reminders: [] };
  let addresses: Promise<readonly string[]> | undefined;
  const recipients = () => (addresses ??= platformAdminAddresses());
  const settled = await Promise.allSettled(
    alerts.map((alert) => remindOnce(store, alert, nowMs, recipients)),
  );
  return {
    checked: true,
    reminders: alerts.map((alert, index) => {
      const result = settled[index]!;
      if (result.status === 'fulfilled') return { reason: alert.reason, outcome: result.value };
      logger.error(
        { event: 'free_quota_renewal_reminder_failed', reason: alert.reason, error: result.reason },
        '[free-quota] a renewal reminder failed before it reached anyone; the next run tries again',
      );
      return { reason: alert.reason, outcome: 'undelivered' };
    }),
  };
}
