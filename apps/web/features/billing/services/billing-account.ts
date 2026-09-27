import { z } from 'zod';
import { IDEMPOTENCY_KEY_HEADER } from '@agiworkforce/cloud-contracts';
import {
  isValidAutoReloadSettingsUpdate,
  type AutoReloadSettings,
  type AutoReloadSettingsUpdate,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { apiErrorCode, apiErrorMessage } from '../lib/api-error';
import {
  AutoReloadSettingsSchema,
  BillingRefundSchema,
  PlanChangeStateSchema,
  TopUpReceiptSchema,
  type BillingRefund,
  type PlanChangeState,
  type TopUpReceipt,
} from '../lib/billing-account-types';

const PLAN_CHANGE_PATH = '/api/billing/downgrade-preview';
const AUTO_RELOAD_PATH = '/api/billing/auto-reload';
const PAYMENT_METHOD_REQUIRED = 'payment_method_required';
const UNEXPECTED_SHAPE = 'Billing returned an unexpected answer. Refresh and try again.';

export class PaymentMethodRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentMethodRequiredError';
  }
}

const ReceiptsResponseSchema = z.object({ receipts: z.array(TopUpReceiptSchema) });
const RefundsResponseSchema = z.object({ refunds: z.array(BillingRefundSchema) });

async function requestJson(path: string, init: RequestInit, fallback: string): Promise<unknown> {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, fallback));
  return body;
}

async function postJson(path: string, payload: unknown, fallback: string): Promise<unknown> {
  return requestJson(
    path,
    {
      method: 'POST',
      headers: await addCsrfHeaders({
        'Content-Type': 'application/json',
        [IDEMPOTENCY_KEY_HEADER]: `agi.billing.web.${crypto.randomUUID()}`,
      }),
      body: JSON.stringify(payload),
    },
    fallback,
  );
}

function parseWith<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(UNEXPECTED_SHAPE);
  return parsed.data;
}

export async function fetchPlanChangeState(): Promise<PlanChangeState> {
  return parseWith(
    PlanChangeStateSchema,
    await requestJson(PLAN_CHANGE_PATH, {}, 'Your plan details could not be loaded.'),
  );
}

export async function scheduleDowngrade(
  plan: SelfServeIndividualPlanTier,
): Promise<PlanChangeState> {
  return parseWith(
    PlanChangeStateSchema,
    await postJson(PLAN_CHANGE_PATH, { plan }, 'The plan change could not be scheduled.'),
  );
}

export async function keepCurrentPlan(): Promise<PlanChangeState> {
  return parseWith(
    PlanChangeStateSchema,
    await postJson('/api/billing/resume-cancellation', {}, 'Your plan could not be resumed.'),
  );
}

export async function fetchTopUpReceipts(): Promise<TopUpReceipt[]> {
  const body = await requestJson(
    '/api/billing/receipts',
    {},
    'Your credit purchase receipts could not be loaded.',
  );
  return parseWith(ReceiptsResponseSchema, body).receipts;
}

export async function fetchAutoReload(): Promise<AutoReloadSettings> {
  return parseWith(
    AutoReloadSettingsSchema,
    await requestJson(AUTO_RELOAD_PATH, {}, 'Your auto-reload settings could not be loaded.'),
  );
}

export async function saveAutoReload(
  update: AutoReloadSettingsUpdate,
): Promise<AutoReloadSettings> {
  if (!isValidAutoReloadSettingsUpdate(update)) {
    throw new Error('Choose a valid threshold and pack before saving auto-reload.');
  }
  const response = await fetch(AUTO_RELOAD_PATH, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      [IDEMPOTENCY_KEY_HEADER]: `agi.billing.web.${crypto.randomUUID()}`,
    }),
    body: JSON.stringify(update),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = apiErrorMessage(body, 'Your auto-reload settings were not saved.');
    if (apiErrorCode(body) === PAYMENT_METHOD_REQUIRED) {
      throw new PaymentMethodRequiredError(message);
    }
    throw new Error(message);
  }
  return parseWith(AutoReloadSettingsSchema, body);
}

export async function fetchRefunds(): Promise<BillingRefund[]> {
  const body = await requestJson('/api/billing/refunds', {}, 'Your refunds could not be loaded.');
  return parseWith(RefundsResponseSchema, body).refunds;
}
