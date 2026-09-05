'use client';

import { useState } from 'react';
import { Spinner, useConfirm } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import type { PublicContentTarget } from '@/app/api/admin/takedown/lib/public-target';
import { formatDateTime } from '../lib/operator-format';

const TAKEDOWN_ENDPOINT = '/api/admin/takedown';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50';
const DESTRUCTIVE_CLASS =
  'rounded-full border border-destructive/50 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50';

const KIND_LABEL: Record<PublicContentTarget['kind'], string> = {
  'conversation-share': 'Shared conversation',
  'published-artifact': 'Published artifact',
};

interface TakedownResult {
  kind: PublicContentTarget['kind'];
  token: string;
  ownerId: string;
  title: string;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export default function ContentTakedownPanel() {
  const [token, setToken] = useState('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<PublicContentTarget | null>(null);
  const [result, setResult] = useState<TakedownResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();

  async function lookUp() {
    const candidate = token.trim();
    if (!candidate) {
      setError('Paste the public link or its token.');
      return;
    }
    setLooking(true);
    setError(null);
    setTarget(null);
    setResult(null);
    try {
      const body = await readJson<{ target: PublicContentTarget }>(
        `${TAKEDOWN_ENDPOINT}?token=${encodeURIComponent(candidate)}`,
      );
      setTarget(body.target);
    } catch (lookupError) {
      setError(toUserMessage(lookupError, 'Nothing public is served from that token.'));
    } finally {
      setLooking(false);
    }
  }

  /**
   * The published row carries the copy that the public link serves, so removing
   * it is not a visibility flag: the confirmation says what stops resolving,
   * what the owner keeps, and that the console cannot put it back.
   */
  async function takeDown() {
    if (!target) return;
    const recordedReason = reason.trim();
    if (!recordedReason) {
      setError(
        'A reason is required; it is written to the audit log with your account and the time.',
      );
      return;
    }
    const confirmed = await confirmDestructive({
      title: `Unpublish this ${KIND_LABEL[target.kind].toLowerCase()}?`,
      description:
        `The public link stops resolving for everyone who holds it and the published copy is deleted rather than hidden, ` +
        `so nothing in this console can restore it; only the owner can publish again. Their own conversation and files are untouched. ` +
        `Your account, this reason and the time are written to the audit log.`,
      confirmText: 'Unpublish',
      variant: 'destructive',
    });
    if (!confirmed) return;

    setRemoving(true);
    setError(null);
    try {
      const body = await readJson<TakedownResult>(TAKEDOWN_ENDPOINT, {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token: target.token, reason: recordedReason }),
      });
      setResult(body);
      setTarget(null);
      setToken('');
      setReason('');
    } catch (takedownError) {
      setError(toUserMessage(takedownError, 'Could not unpublish that content.'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="content-takedown-title">
      <div>
        <h2 id="content-takedown-title" className="text-sm font-medium">
          Public content takedown
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Operator-side revocation for a rights-holder notice or a policy removal. A public
          copyright notice records an allegation and removes nothing; this is the only path that
          unpublishes, and every use is audited.
        </p>
      </div>

      {destructiveConfirmDialog}

      <div className={CARD_CLASS}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Public link or token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <button onClick={() => void lookUp()} disabled={looking} className={ACTION_CLASS}>
            {looking ? 'Looking up…' : 'Look up'}
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {looking ? (
          <div className="mt-4 flex items-center gap-3">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">Resolving the token…</span>
          </div>
        ) : null}

        {target ? (
          <div className="mt-4 border-t border-border pt-4">
            <dl className="grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Kind</dt>
                <dd className="mt-1 text-sm">{KIND_LABEL[target.kind]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Title</dt>
                <dd className="mt-1 truncate text-sm">{target.title}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Owner</dt>
                <dd className="mt-1 font-mono text-xs">{target.ownerId}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Published</dt>
                <dd className="mt-1 text-sm">{formatDateTime(target.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Reason, recorded on the audit entry
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <button
                onClick={() => void takeDown()}
                disabled={removing}
                className={DESTRUCTIVE_CLASS}
              >
                {removing ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </div>
          </div>
        ) : null}

        {result ? (
          <p role="status" className="mt-4 border-t border-border pt-4 text-sm">
            Unpublished {KIND_LABEL[result.kind].toLowerCase()}{' '}
            <span className="font-medium">{result.title}</span>, owned by{' '}
            <span className="font-mono text-xs">{result.ownerId}</span>. The removal, your account
            and the reason are in the audit log.
          </p>
        ) : null}
      </div>
    </section>
  );
}
