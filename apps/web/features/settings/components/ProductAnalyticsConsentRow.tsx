'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner, Switch } from '@agiworkforce/ui';
import {
  PRODUCT_ANALYTICS_CONSENT_PATH,
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  readProductAnalyticsConsent,
} from '@agiworkforce/types';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { applyAnalyticsConsentLocally } from '@shared/lib/cookie-consent';

const LABEL = 'Product analytics';

type ConsentState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; granted: boolean; noticeVersion: string };

export function ProductAnalyticsConsentRow() {
  const [state, setState] = useState<ConsentState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(PRODUCT_ANALYTICS_CONSENT_PATH, { credentials: 'same-origin' });
      if (!response.ok) {
        setState({ kind: 'unavailable' });
        return;
      }
      const body = (await response.json()) as { noticeVersion?: unknown };
      setState({
        kind: 'ready',
        granted: readProductAnalyticsConsent(body),
        noticeVersion: typeof body.noticeVersion === 'string' ? body.noticeVersion : '',
      });
    } catch {
      setState({ kind: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(granted: boolean) {
    if (state.kind !== 'ready') return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(PRODUCT_ANALYTICS_CONSENT_PATH, {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify({
          decisions: [{ purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE, granted }],
          surface: 'web-settings',
          noticeVersion: state.noticeVersion,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'The privacy notice changed. Review it and choose again.'
            : 'That change was not saved. Try again.',
        );
      } else {
        applyAnalyticsConsentLocally(granted);
      }
      await load();
    } catch {
      setError('That change was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
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
          Page views on this site and product usage events from every AGI app, such as a stopped
          response or an accepted edit, recorded against your account. Never your messages, code or
          files. A workspace administrator can turn this off for every member.
        </span>
        {state.kind === 'unavailable' ? (
          <span role="alert" style={{ fontSize: 12, color: 'var(--chat-accent-primary-text)' }}>
            Your product analytics choice could not be loaded.
          </span>
        ) : null}
        {state.kind === 'loading' ? (
          <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner size="sm" aria-hidden="true" />
            Loading your product analytics choice
          </span>
        ) : null}
        {error ? (
          <span role="alert" style={{ fontSize: 12, color: 'var(--chat-accent-primary-text)' }}>
            {error}
          </span>
        ) : null}
      </div>
      <Switch
        checked={state.kind === 'ready' && state.granted}
        disabled={state.kind !== 'ready' || saving}
        onCheckedChange={(next) => void decide(next)}
        aria-label={LABEL}
      />
    </div>
  );
}
