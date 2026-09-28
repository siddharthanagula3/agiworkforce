'use client';

import { useMemo } from 'react';
import { Label } from '@agiworkforce/ui';
import { isFreeBillingPlanTier, normalizeBillingPlanTier } from '@agiworkforce/types';
import { getAllowedAutoModesForTier, isModelAllowedForTier } from '@shared/config/llm';
import { findSelectableModel, useModelStore } from '@shared/stores/model-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { useBillingStore } from '@shared/stores/web-auth-store';

const FIELD_ID = 'ps-default-model';

export function ProjectDefaultModelField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const availableModels = useModelStore((s) => s.availableModels);
  const subscription = useBillingStore((s) => s.subscription);
  const billingReady = useBillingStore(isBillingPolicyReady);
  const tier = billingReady ? normalizeBillingPlanTier(subscription?.tier) : null;

  const options = useMemo(
    () =>
      availableModels.filter((model) => {
        if (model.availability === 'coming_soon') return false;
        if (tier === null) return true;
        if (model.providerKey === 'managed_cloud') {
          return (
            !isFreeBillingPlanTier(tier) && getAllowedAutoModesForTier(tier).includes(model.id)
          );
        }
        return isModelAllowedForTier(model.id, tier);
      }),
    [availableModels, tier],
  );
  const current = value ? findSelectableModel(value) : null;
  const currentListed = value === null || options.some((model) => model.id === value);

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={FIELD_ID}
        className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground"
      >
        Default model
      </Label>
      <p className="text-xs text-muted-foreground">
        New chats in this project start on this model. You can still switch in any chat.
      </p>
      <select
        id={FIELD_ID}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-11 w-full rounded-xl border border-input bg-muted/40 px-3 text-sm text-foreground"
      >
        <option value="">No default, use the model you last picked</option>
        {!currentListed && value ? (
          <option value={value}>{`${current?.name ?? value} (not available on your plan)`}</option>
        ) : null}
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
