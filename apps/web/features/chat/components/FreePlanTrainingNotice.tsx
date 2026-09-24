'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info, X as XIcon } from 'lucide-react';

import { isFreeBillingPlanTier, normalizeBillingPlanTier } from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
  FREE_PLAN_TRAINING_NOTICE_LEAD,
  FREE_PLAN_TRAINING_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_NOTICE_TAIL,
  FREE_PLAN_TRAINING_NOTICE_TITLE,
} from '@/lib/compliance/free-plan-training-disclosure';
import { readAcknowledgedAccount, rememberAcknowledgedAccount } from '../lib/account-notice';

export const FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY = 'agi.notice.free-plan-training';

export function FreePlanTrainingNotice() {
  const accountId = useBillingStore((state) => state.user?.id ?? null);
  const subscription = useBillingStore((state) => state.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  const [dismissed, setDismissed] = useState(true);

  // A tier that has not resolved yet is not a Free tier, so nothing is shown
  // until the account's own plan has answered for itself.
  const onFreePlan =
    billingPolicyReady && isFreeBillingPlanTier(normalizeBillingPlanTier(subscription?.tier));

  useEffect(() => {
    if (!onFreePlan || !accountId) {
      setDismissed(true);
      return;
    }
    setDismissed(readAcknowledgedAccount(FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY) === accountId);
  }, [onFreePlan, accountId]);

  if (dismissed || !onFreePlan || !accountId) return null;

  return (
    <div
      role="note"
      aria-label={FREE_PLAN_TRAINING_NOTICE_TITLE}
      data-testid="free-plan-training-notice"
      className="mb-2 flex items-start gap-2 rounded-lg border border-[var(--chat-border-subtle)] bg-[var(--chat-surface-elevated)] px-3 py-2 text-[13px] leading-relaxed text-[var(--chat-text-secondary)]"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {FREE_PLAN_TRAINING_NOTICE_LEAD} {FREE_PLAN_TRAINING_DATA_DISCLOSURE}{' '}
        {FREE_PLAN_TRAINING_NOTICE_TAIL}{' '}
        <Link
          href="/data-use"
          className="rounded-sm text-[var(--chat-accent-primary-text)] underline underline-offset-2 transition-colors hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          {FREE_PLAN_TRAINING_NOTICE_LINK_LABEL}
        </Link>
      </p>
      <button
        type="button"
        onClick={() => {
          rememberAcknowledgedAccount(FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY, accountId);
          setDismissed(true);
        }}
        aria-label={FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL}
        className="-me-1 flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] [@media(hover:none)]:h-11 [@media(hover:none)]:w-11"
      >
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
