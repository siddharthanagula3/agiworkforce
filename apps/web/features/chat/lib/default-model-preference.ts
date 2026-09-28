'use client';

import { useCallback, useEffect, useState } from 'react';
import { isFreeBillingPlanTier, normalizeBillingPlanTier } from '@agiworkforce/types';
import {
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  fetchPreferenceNamespace,
  savePreferenceNamespace,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { toUserMessage } from '@/lib/user-error-message';
import { modelLock } from '@features/chat/lib/model-plan-admission';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import type { AIModel } from '@shared/stores/model-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

const DEFAULT_MODEL_NAMESPACE = 'default-model';
const LOAD_FAILED_MESSAGE = 'Your default model could not be loaded.';

interface StoredDefaultModel {
  modelId?: unknown;
}

export type DefaultModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DefaultModelPreference {
  modelId: string | null;
  status: DefaultModelStatus;
  error: string | null;
  saving: boolean;
  save: (modelId: string | null) => Promise<void>;
  retry: () => void;
}

function storedModelId(value: unknown): string | null {
  const modelId = (value as StoredDefaultModel | null)?.modelId;
  return typeof modelId === 'string' && modelId ? modelId : null;
}

export function useKnownPlanTier(): string | null {
  const tier = useBillingStore((state) => normalizeBillingPlanTier(state.subscription?.tier));
  const ready = useBillingStore(isBillingPolicyReady);
  return ready ? tier : null;
}

export function isModelOnPlan(model: AIModel, tier: string): boolean {
  if (modelLock(model, tier).locked) return false;
  return !isFreeBillingPlanTier(tier) || FREE_TRIAL_MODELS.includes(model.id);
}

export function useDefaultModelPreference(enabled = true): DefaultModelPreference {
  const [modelId, setModelId] = useState<string | null>(null);
  const [status, setStatus] = useState<DefaultModelStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');
    fetchPreferenceNamespace<StoredDefaultModel>(DEFAULT_MODEL_NAMESPACE, {})
      .then((stored) => {
        if (cancelled) return;
        setModelId(storedModelId(stored));
        setError(null);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(toUserMessage(cause, LOAD_FAILED_MESSAGE));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, enabled]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PreferenceNamespaceSavedDetail>).detail;
      if (detail?.namespace !== DEFAULT_MODEL_NAMESPACE) return;
      setModelId(storedModelId(detail.value));
      setError(null);
      setStatus('ready');
    };
    window.addEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, listener);
    return () => window.removeEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, listener);
  }, []);

  const save = useCallback(async (next: string | null) => {
    setSaving(true);
    try {
      await savePreferenceNamespace<StoredDefaultModel>(DEFAULT_MODEL_NAMESPACE, {
        modelId: next,
      });
      setModelId(next);
    } finally {
      setSaving(false);
    }
  }, []);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { modelId, status, error, saving, save, retry };
}
