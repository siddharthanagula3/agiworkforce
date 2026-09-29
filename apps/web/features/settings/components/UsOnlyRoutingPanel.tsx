'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import { modelRegistry } from '@agiworkforce/model-registry';
import {
  BILLING_PLAN_PRICING,
  isBillingPlanTier,
  normalizeSubscriptionAccessTier,
} from '@agiworkforce/types';
import {
  ME_ROUTING_PREFERENCES_PATH,
  RoutingPreferencesSchema,
  type RoutingPreferences,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { toUserMessage } from '@/lib/user-error-message';
import { SaveStatusLine } from './SaveStatusLine';

const ROUTING_PREFERENCES_PATH = ME_ROUTING_PREFERENCES_PATH;
const LABEL = 'Only use AI providers based in the US';

const US_ONLY_TIERS: readonly string[] =
  modelRegistry.policies.auto.providerPolicies.usOnly.allowedTiers;

const US_ONLY_PLAN_LABELS = US_ONLY_TIERS.flatMap((tier) =>
  isBillingPlanTier(tier) ? [BILLING_PLAN_PRICING[tier].label] : [],
).join(' and ');

export function UsOnlyRoutingPanel() {
  const subscription = useBillingStore((s) => s.subscription);
  const eligible =
    subscription?.status === 'active' &&
    US_ONLY_TIERS.includes(normalizeSubscriptionAccessTier(subscription.tier));
  const [preferences, setPreferences] = useState<RoutingPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(ROUTING_PREFERENCES_PATH, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Routing preferences could not be loaded.');
        const body = RoutingPreferencesSchema.parse(await response.json());
        if (!cancelled) setPreferences(body);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(toUserMessage(caught, 'Routing preferences could not be loaded.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (usOnly: boolean) => {
    const previous = preferences;
    const next = { ...preferences, us_only: usOnly };
    setPreferences(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(ROUTING_PREFERENCES_PATH, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error('The setting was not saved.');
    } catch (caught) {
      setPreferences(previous);
      setError(toUserMessage(caught, 'The setting was not saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      aria-busy={preferences === null && !error}
      style={{
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid var(--settings-border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
        <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{LABEL}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {eligible
            ? 'Auto and the models you pick are served only by providers based in the United States. Models without one are unavailable while this is on.'
            : `Available on ${US_ONLY_PLAN_LABELS}.`}
        </span>
        {preferences === null && !error ? (
          <span role="status" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Loading your setting…
          </span>
        ) : null}
        {error ? <SaveStatusLine failed>{error}</SaveStatusLine> : null}
      </div>
      <Switch
        checked={preferences?.us_only === true}
        disabled={!eligible || preferences === null || saving}
        onCheckedChange={(checked) => void save(checked)}
        aria-label={LABEL}
      />
    </div>
  );
}
