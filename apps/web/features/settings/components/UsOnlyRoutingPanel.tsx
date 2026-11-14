'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { usePreferenceOwner, usePreferenceView } from '../hooks/use-preference-owner';
import { SaveStatusLine } from './SaveStatusLine';

const ROUTING_PREFERENCES_PATH = ME_ROUTING_PREFERENCES_PATH;
const LABEL = 'Only use AI providers based in the US';

const US_ONLY_TIERS: readonly string[] =
  modelRegistry.policies.auto.providerPolicies.usOnly.allowedTiers;

const US_ONLY_PLAN_LABELS = US_ONLY_TIERS.flatMap((tier) =>
  isBillingPlanTier(tier) ? [BILLING_PLAN_PRICING[tier].label] : [],
).join(' and ');

type RoutingLane = {
  active: boolean;
  ready: RoutingPreferences | null;
  operation: RequestAuthority | null;
};

type RoutingView = {
  lane: RoutingLane;
  ready: RoutingPreferences | null;
  checked: boolean;
  busy: boolean;
  message: string | null;
  failed: boolean;
};

export function UsOnlyRoutingPanel() {
  const owner = usePreferenceOwner();
  const capture = usePreferenceView(owner);
  const subscription = useBillingStore((s) => s.subscription);
  const status = subscription?.status;
  const tier = subscription?.tier;
  const eligible =
    subscription?.status === 'active' &&
    US_ONLY_TIERS.includes(normalizeSubscriptionAccessTier(subscription.tier));
  const [eligibilityRevision, setEligibilityRevision] = useState(0);
  const lane = useMemo<RoutingLane>(
    () =>
      Object.assign(
        { active: false, ready: null, operation: null },
        { binding: { eligibilityRevision, owner, status, tier } },
      ),
    [owner, status, tier, eligibilityRevision],
  );
  const [view, setView] = useState<RoutingView | null>(null);
  const displayed = view?.lane === lane ? view : null;
  const ready = displayed?.ready ?? null;
  const laneCurrent = useCallback(() => {
    const live = useBillingStore.getState().subscription;
    return (
      lane.active && owner?.isCurrent() === true && live?.status === status && live?.tier === tier
    );
  }, [lane, owner, status, tier]);

  const read = useCallback(
    async (
      operation: RequestAuthority,
      message: string | null = null,
      acknowledged: RoutingPreferences | null = null,
    ) => {
      const current = () => lane.operation === operation && operation.isCurrent();
      try {
        const response = await operation.fetch(ROUTING_PREFERENCES_PATH, { cache: 'no-store' });
        if (!response.ok) throw new Error('Routing preferences unavailable');
        const body = RoutingPreferencesSchema.parse(await response.json());
        if (!current()) return;
        lane.ready = body;
        setView({
          lane,
          ready: body,
          checked: body.us_only === true,
          busy: false,
          message,
          failed: message !== null && acknowledged === null,
        });
      } catch {
        if (!current()) return;
        lane.ready = null;
        setView({
          lane,
          ready: null,
          checked: acknowledged?.us_only === true,
          busy: false,
          message: acknowledged
            ? `Your US-only provider setting was saved as ${acknowledged.us_only ? 'on' : 'off'}, but the latest setting could not be loaded. Retry loading it.`
            : `${message ? `${message} ` : ''}Your provider location setting could not be loaded. Retry loading it.`,
          failed: true,
        });
      } finally {
        if (lane.operation === operation) lane.operation = null;
        operation.retire();
      }
    },
    [lane],
  );

  const load = useCallback(() => {
    const viewCurrent = capture();
    if (!owner || !laneCurrent() || !viewCurrent() || lane.operation) return;
    const operation = createRequestAuthority(owner.session, () => laneCurrent() && viewCurrent());
    lane.operation = operation;
    lane.ready = null;
    setView({ lane, ready: null, checked: false, busy: true, message: null, failed: false });
    void read(operation);
  }, [owner, capture, lane, laneCurrent, read]);

  useEffect(() => {
    lane.active = true;
    const retire = () => {
      lane.active = false;
      lane.ready = null;
      lane.operation?.retire();
      lane.operation = null;
    };
    const stop = useBillingStore.subscribe((next, previous) => {
      if (
        next.subscription?.status !== previous.subscription?.status ||
        next.subscription?.tier !== previous.subscription?.tier
      ) {
        retire();
        setEligibilityRevision((revision) => revision + 1);
      }
    });
    load();
    return () => {
      stop();
      retire();
    };
  }, [lane, load]);

  const save = async (usOnly: boolean) => {
    const viewCurrent = capture();
    if (
      !owner ||
      !eligible ||
      !laneCurrent() ||
      !viewCurrent() ||
      !ready ||
      lane.ready !== ready ||
      lane.operation
    )
      return;
    const next = { ...ready, us_only: usOnly };
    const operation = createRequestAuthority(owner.session, () => laneCurrent() && viewCurrent());
    lane.operation = operation;
    lane.ready = null;
    setView({ lane, ready: null, checked: usOnly, busy: true, message: null, failed: false });
    let acknowledged: RoutingPreferences | null = null;
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      operation.assertCurrent();
      const response = await operation.fetch(ROUTING_PREFERENCES_PATH, {
        method: 'PUT',
        headers,
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error('Write not confirmed');
      const receipt = RoutingPreferencesSchema.parse(await response.json());
      operation.assertCurrent();
      if (receipt.us_only !== usOnly) throw new Error('Write not confirmed');
      acknowledged = receipt;
    } catch {
      if (!operation.isCurrent()) return;
    } finally {
      if (!operation.isCurrent()) {
        if (lane.operation === operation) lane.operation = null;
        operation.retire();
      }
    }
    if (lane.operation !== operation || !operation.isCurrent()) return;
    await read(
      operation,
      acknowledged
        ? `Your US-only provider setting was saved as ${usOnly ? 'on' : 'off'}.`
        : 'We could not confirm whether your change was saved.',
      acknowledged,
    );
  };

  return (
    <div
      aria-busy={displayed?.busy === true}
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
            ? 'Only US-based providers serve your chats. Models without one are unavailable.'
            : `Available on ${US_ONLY_PLAN_LABELS}.`}
        </span>
        {displayed?.busy ? (
          <span role="status" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Updating your latest setting…
          </span>
        ) : null}
        {displayed?.message ? (
          <SaveStatusLine failed={displayed.failed}>{displayed.message}</SaveStatusLine>
        ) : null}
        {displayed?.failed && !ready && !displayed.busy ? (
          <button
            type="button"
            onClick={load}
            className="mt-2 text-sm underline underline-offset-4"
          >
            Retry loading
          </button>
        ) : null}
      </div>
      <Switch
        checked={displayed?.checked === true}
        disabled={!eligible || !ready || !laneCurrent() || displayed?.busy === true}
        onCheckedChange={(checked) => void save(checked)}
        aria-label={LABEL}
      />
    </div>
  );
}
