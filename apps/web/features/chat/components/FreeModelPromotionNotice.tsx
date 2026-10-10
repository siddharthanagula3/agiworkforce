'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X as XIcon } from 'lucide-react';

import {
  getModelMetadataById,
  isFreeBillingPlanTier,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { useFreeModelPromotion } from '../hooks/use-free-model-promotion';
import {
  FREE_MODEL_PROMOTION_DISMISS_LABEL,
  FREE_MODEL_PROMOTION_FINE_PRINT,
  FREE_MODEL_PROMOTION_NOTICE_TITLE,
  freeModelPromotionHeadline,
} from '../lib/free-model-promotion-copy';
import { readAcknowledgedAccount, rememberAcknowledgedAccount } from '../lib/account-notice';

const STORAGE_KEY_PREFIX = 'agi.notice.free-model-promotion';

export function FreeModelPromotionNotice() {
  const accountId = useBillingStore((state) => state.user?.id ?? null);
  const subscription = useBillingStore((state) => state.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  const onFreePlan =
    billingPolicyReady && isFreeBillingPlanTier(normalizeBillingPlanTier(subscription?.tier));
  const { promotion } = useFreeModelPromotion(onFreePlan && accountId !== null);
  const modelName = promotion ? getModelMetadataById(promotion.modelId)?.name : undefined;
  const storageKey = promotion
    ? `${STORAGE_KEY_PREFIX}.${promotion.modelId}.${promotion.endsAt}`
    : null;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!storageKey || !accountId) {
      setDismissed(true);
      return;
    }
    setDismissed(readAcknowledgedAccount(storageKey) === accountId);
  }, [storageKey, accountId]);

  if (dismissed || !promotion || !modelName || !storageKey || !accountId) return null;

  return (
    <div
      role="note"
      aria-label={FREE_MODEL_PROMOTION_NOTICE_TITLE}
      data-testid="free-model-promotion-notice"
      className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--chat-border-subtle)] bg-[var(--chat-surface-elevated)] px-3 py-1.5 text-[13px] leading-5 text-[var(--chat-text-secondary)]"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-medium text-[var(--chat-text-primary)]">
          {freeModelPromotionHeadline(modelName, promotion.endsAt)}
        </span>
        , {FREE_MODEL_PROMOTION_FINE_PRINT}.
      </p>
      <button
        type="button"
        onClick={() => {
          rememberAcknowledgedAccount(storageKey, accountId);
          setDismissed(true);
        }}
        aria-label={FREE_MODEL_PROMOTION_DISMISS_LABEL}
        className="-me-1 flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] [@media(hover:none)]:h-11 [@media(hover:none)]:w-11"
      >
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
