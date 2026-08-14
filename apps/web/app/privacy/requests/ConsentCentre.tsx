'use client';

import { useCallback, useEffect, useId, useState } from 'react';

import { addCsrfHeaders } from '@/lib/client/csrf';
import type { ConsentPurpose } from '@/lib/consent-purposes';

/**
 * The withdrawal surface. DPDP s.6(6) requires withdrawing consent to be as
 * easy as giving it, which rules out a support ticket, an email, and a form
 * that opens a mail client: giving it is one click, so withdrawing it is one
 * click, on this page, against the same ledger.
 *
 * Three states are deliberately distinguished and never collapsed:
 *
 *   granted   — a row exists and the newest one says true
 *   withdrawn — a row exists and the newest one says false
 *   not asked — no row at all
 *
 * "Not asked" is not "declined". Rendering it as an unticked box that claims to
 * be a recorded refusal would be a false statement about what the product
 * holds, so it is labelled as what it is.
 *
 * The purpose catalogue comes from the server response rather than from a
 * client import, so this component can never offer a purpose the API would
 * reject.
 */

interface ConsentRecord {
  purpose: string;
  granted: boolean;
  noticeVersion: string;
  surface: string;
  recordedAt: string;
}

interface ConsentState {
  noticeVersion: string;
  purposes: ConsentPurpose[];
  consents: ConsentRecord[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ConsentState };

function formatInstant(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().slice(0, 10);
}

export function ConsentCentre() {
  const headingId = useId();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [pendingPurpose, setPendingPurpose] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/consent', { credentials: 'same-origin' });
      if (res.status === 401) {
        setState({ kind: 'signed-out' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: 'Could not read your consent record.' });
        return;
      }
      const data = (await res.json()) as ConsentState;
      setState({ kind: 'ready', data });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (purpose: string, granted: boolean, noticeVersion: string) => {
      setPendingPurpose(purpose);
      setNotice(null);
      try {
        const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch('/api/consent', {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({
            decisions: [{ purpose, granted }],
            surface: 'web-consent-centre',
            noticeVersion,
          }),
        });

        if (res.status === 409) {
          // The notice changed under this tab. Reload rather than record a
          // decision against text the person was not shown.
          setNotice('The privacy notice changed. Reloaded it — please choose again.');
          await load();
          return;
        }
        if (!res.ok) {
          setNotice('That change was not recorded. Nothing was altered.');
          return;
        }

        setNotice(granted ? 'Consent recorded.' : 'Withdrawal recorded.');
        await load();
      } catch {
        setNotice('That change was not recorded. Nothing was altered.');
      } finally {
        setPendingPurpose(null);
      }
    },
    [load],
  );

  if (state.kind === 'loading') {
    return (
      <p className="agi-page-lede" role="status">
        Reading your consent record…
      </p>
    );
  }

  if (state.kind === 'signed-out') {
    return (
      <div className="agi-callout">
        <h3 className="agi-callout-h">Sign in to manage consent held against an account.</h3>
        <p className="agi-callout-p">
          Consent recorded against an email address rather than an account &mdash; for example an
          early-access signup made without signing in &mdash; cannot be shown here, because we
          cannot prove the address is yours from this page. Use the request form below and we will
          act on it.
        </p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <p className="agi-page-lede" role="alert">
        {state.message} Nothing was changed. If this persists, use the request form below.
      </p>
    );
  }

  const { data } = state;
  const byPurpose = new Map(data.consents.map((record) => [record.purpose, record]));

  return (
    <div aria-labelledby={headingId}>
      <h3 id={headingId} className="sr-only">
        Consent recorded against your account
      </h3>
      <table className="agi-ledger">
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Current state</th>
            <th>Change it</th>
          </tr>
        </thead>
        <tbody>
          {data.purposes.map((purpose) => {
            const record = byPurpose.get(purpose.id);
            const isPending = pendingPurpose === purpose.id;
            return (
              <tr key={purpose.id}>
                <td style={{ width: '38%', verticalAlign: 'top' }}>
                  <strong>{purpose.label}</strong>
                  <br />
                  <span style={{ color: 'var(--agi-ink-quiet)', fontSize: 13 }}>
                    {purpose.description}
                  </span>
                </td>
                <td style={{ width: '26%', verticalAlign: 'top' }}>
                  {record === undefined ? (
                    <>
                      Never asked.
                      <br />
                      <span style={{ color: 'var(--agi-ink-quiet)', fontSize: 13 }}>
                        No decision is on record — which is not the same as a refusal.
                      </span>
                    </>
                  ) : (
                    <>
                      {record.granted ? 'Consent given' : 'Withdrawn'} on{' '}
                      {formatInstant(record.recordedAt)}.
                      <br />
                      <span style={{ color: 'var(--agi-ink-quiet)', fontSize: 13 }}>
                        Against notice revision {record.noticeVersion}.
                      </span>
                    </>
                  )}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  <button
                    type="button"
                    className="agi-cta-ghost"
                    disabled={isPending}
                    onClick={() => void decide(purpose.id, !record?.granted, data.noticeVersion)}
                  >
                    {isPending
                      ? 'Recording…'
                      : record?.granted
                        ? 'Withdraw consent'
                        : 'Give consent'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {notice ? (
        <p className="agi-page-lede" role="status" aria-live="polite" style={{ fontSize: 14 }}>
          {notice}
        </p>
      ) : null}
      <p className="agi-page-lede" style={{ fontSize: 14 }}>
        Withdrawal stops the future processing that depended on that consent. It does not undo
        processing that already happened lawfully, and it does not delete your account &mdash; that
        is a separate request below. Every change here, in both directions, is appended to your
        consent record rather than overwriting it.
      </p>
    </div>
  );
}
