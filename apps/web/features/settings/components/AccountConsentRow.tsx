'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner, Switch } from '@agiworkforce/ui';
import { PRODUCT_ANALYTICS_CONSENT_PATH } from '@agiworkforce/types';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE } from '@/lib/consent-signals';

type ConsentState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; granted: boolean; noticeVersion: string };

export interface AccountConsentRowProps {
  purpose: string;
  label: string;
  description: string;
  loadingLabel: string;
  unavailableLabel: string;
  readGranted: (body: unknown) => boolean;
  onSaved?: (granted: boolean) => void;
  grantBlockedBySignal?: boolean;
}

function readStoredDecision(body: unknown, purpose: string): boolean | null {
  if (typeof body !== 'object' || body === null) return null;
  const recorded = (body as { recorded?: unknown }).recorded;
  if (!Array.isArray(recorded)) return null;
  for (const record of recorded as unknown[]) {
    if (typeof record !== 'object' || record === null) continue;
    const { purpose: storedPurpose, granted } = record as { purpose?: unknown; granted?: unknown };
    if (storedPurpose === purpose && typeof granted === 'boolean') return granted;
  }
  return null;
}

export function AccountConsentRow({
  purpose,
  label,
  description,
  loadingLabel,
  unavailableLabel,
  readGranted,
  onSaved,
  grantBlockedBySignal = false,
}: AccountConsentRowProps) {
  const [state, setState] = useState<ConsentState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantRefusedByServer, setGrantRefusedByServer] = useState(false);

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
        granted: readGranted(body),
        noticeVersion: typeof body.noticeVersion === 'string' ? body.noticeVersion : '',
      });
    } catch {
      setState({ kind: 'unavailable' });
    }
  }, [readGranted]);

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
          decisions: [{ purpose, granted }],
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
        const stored =
          readStoredDecision(await response.json().catch(() => null), purpose) ?? granted;
        if (granted && !stored) setGrantRefusedByServer(true);
        onSaved?.(stored);
      }
      await load();
    } catch {
      setError('That change was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const granted = state.kind === 'ready' && state.granted;
  const grantBlocked = grantBlockedBySignal || grantRefusedByServer;

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
        <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{description}</span>
        {grantBlocked ? (
          <span
            role={grantRefusedByServer ? 'status' : undefined}
            style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}
          >
            {GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE}
          </span>
        ) : null}
        {state.kind === 'unavailable' ? (
          <span role="alert" style={{ fontSize: 12, color: 'var(--chat-accent-primary-text)' }}>
            {unavailableLabel}
          </span>
        ) : null}
        {state.kind === 'loading' ? (
          <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner size="sm" aria-hidden="true" />
            {loadingLabel}
          </span>
        ) : null}
        {error ? (
          <span role="alert" style={{ fontSize: 12, color: 'var(--chat-accent-primary-text)' }}>
            {error}
          </span>
        ) : null}
      </div>
      <Switch
        checked={granted}
        disabled={state.kind !== 'ready' || saving || (grantBlocked && !granted)}
        onCheckedChange={(next) => void decide(next)}
        aria-label={label}
      />
    </div>
  );
}
