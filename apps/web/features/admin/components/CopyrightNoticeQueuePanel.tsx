'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import type { CopyrightNoticeRecord, CopyrightNoticeStatus } from '@/lib/server/copyright-notices';

import { formatDateTime } from '../lib/operator-format';

const NOTICES_ENDPOINT = '/api/admin/copyright-notices';
const NOTICES_UNREADABLE = 'Notices could not be loaded.';
const TAKEDOWN_ENDPOINT = '/api/admin/takedown';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50';
const DESTRUCTIVE_CLASS =
  'rounded-full border border-destructive/50 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50';

const STATUS_LABEL: Record<CopyrightNoticeStatus, string> = {
  received: 'Waiting for a decision',
  actioned: 'Unpublished',
  rejected: 'Rejected',
  counter_notified: 'Counter-notice received',
};

const TYPE_LABEL: Record<CopyrightNoticeRecord['noticeType'], string> = {
  copyright: 'Copyright',
  trademark: 'Trademark',
  impersonation: 'Impersonation',
};

const TARGET_LABEL: Record<CopyrightNoticeRecord['targetKind'], string> = {
  'conversation-share': 'Shared conversation',
  'published-artifact': 'Published artifact',
};

type View = 'received' | 'decided';

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  return readJson<T>(url, {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export default function CopyrightNoticeQueuePanel() {
  const [view, setView] = useState<View>('received');
  const [notices, setNotices] = useState<CopyrightNoticeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const query = view === 'received' ? '?status=received' : '';
      const body = await readJson<{ notices?: CopyrightNoticeRecord[] } | null>(
        `${NOTICES_ENDPOINT}${query}`,
      );
      const listed = body?.notices;
      if (!Array.isArray(listed)) throw new Error(NOTICES_UNREADABLE);
      setNotices(
        view === 'received' ? listed : listed.filter((notice) => notice.status !== 'received'),
      );
    } catch (error) {
      setLoadError(toUserMessage(error, NOTICES_UNREADABLE));
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  async function record(
    notice: CopyrightNoticeRecord,
    status: Exclude<CopyrightNoticeStatus, 'received'>,
    note: string,
  ) {
    setPendingReference(notice.reference);
    setMessage(null);
    try {
      if (status === 'actioned') {
        await postJson(TAKEDOWN_ENDPOINT, {
          token: notice.targetToken,
          reason: `${notice.reference}: ${note}`,
        });
      }
      await postJson(NOTICES_ENDPOINT, { reference: notice.reference, status, note });
      setMessage(`${notice.reference} is marked ${STATUS_LABEL[status].toLowerCase()}.`);
      await load();
    } catch (error) {
      setMessage(toUserMessage(error, `${notice.reference} could not be updated.`));
    } finally {
      setPendingReference(null);
    }
  }

  function decide(
    notice: CopyrightNoticeRecord,
    status: Exclude<CopyrightNoticeStatus, 'received'>,
  ) {
    const note = (notes[notice.reference] ?? '').trim();
    if (!note) {
      setMessage('Write a note first; it is recorded with the decision and the audit entry.');
      return;
    }
    if (status !== 'actioned') {
      void record(notice, status, note);
      return;
    }
    confirm({
      title: `Unpublish the ${TARGET_LABEL[notice.targetKind].toLowerCase()} named in ${notice.reference}?`,
      description:
        'The public link stops resolving for everyone who holds it and the published copy is deleted rather than hidden, so nothing here can restore it; only the owner can publish again. Their own conversation and files are untouched. Your account, the note and the time are written to the audit log.',
      confirmLabel: 'Unpublish',
      onConfirm: () => record(notice, status, note),
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="content-notices-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="content-notices-title" className="text-h5">
            Rights notices
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Copyright, trademark and impersonation notices filed from public share pages. Unpublish
            removes the named public link; reject and counter-notice record the decision without
            removing anything.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Notices to show">
          <button
            type="button"
            className={ACTION_CLASS}
            aria-pressed={view === 'received'}
            onClick={() => setView('received')}
          >
            Waiting
          </button>
          <button
            type="button"
            className={ACTION_CLASS}
            aria-pressed={view === 'decided'}
            onClick={() => setView('decided')}
          >
            Decided
          </button>
        </div>
      </div>

      {confirmDialog}

      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}

      {loading ? (
        <div className={`${CARD_CLASS} flex items-center gap-2 text-sm text-muted-foreground`}>
          <Spinner size="sm" aria-hidden="true" />
          Loading notices
        </div>
      ) : loadError ? (
        <div className={`${CARD_CLASS} flex flex-wrap items-center gap-3`}>
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
          <button type="button" className={ACTION_CLASS} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : notices.length === 0 ? (
        <div className={`${CARD_CLASS} text-sm text-muted-foreground`}>
          {view === 'received'
            ? 'No notice is waiting for a decision.'
            : 'No notice is decided yet.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Rights notices">
          {notices.map((notice) => (
            <li key={notice.id} className={`${CARD_CLASS} flex flex-col gap-3`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-foreground">{notice.reference}</span>
                <span className="text-xs text-muted-foreground">
                  {TYPE_LABEL[notice.noticeType]}, {STATUS_LABEL[notice.status]}, received{' '}
                  {formatDateTime(notice.createdAt)}
                </span>
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">From</dt>
                <dd className="text-foreground">
                  {notice.reporterName} ({notice.reporterEmail})
                  {notice.reporterOrganization ? `, ${notice.reporterOrganization}` : ''}
                </dd>
                <dt className="text-muted-foreground">Content</dt>
                <dd className="break-all font-mono text-foreground">
                  {TARGET_LABEL[notice.targetKind]} {notice.targetToken}
                </dd>
                <dt className="text-muted-foreground">Work</dt>
                <dd className="whitespace-pre-wrap text-foreground">{notice.workDescription}</dd>
                <dt className="text-muted-foreground">Statement</dt>
                <dd className="whitespace-pre-wrap text-foreground">{notice.statement}</dd>
                {notice.dispositionNote ? (
                  <>
                    <dt className="text-muted-foreground">Decision</dt>
                    <dd className="whitespace-pre-wrap text-foreground">
                      {notice.dispositionNote}
                    </dd>
                  </>
                ) : null}
              </dl>
              {notice.status === 'received' || notice.status === 'counter_notified' ? (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Decision note
                    <textarea
                      rows={2}
                      value={notes[notice.reference] ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [notice.reference]: event.target.value,
                        }))
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={DESTRUCTIVE_CLASS}
                      disabled={pendingReference !== null}
                      onClick={() => decide(notice, 'actioned')}
                    >
                      {pendingReference === notice.reference ? (
                        <Spinner size="sm" className="me-2 inline-block" aria-hidden="true" />
                      ) : null}
                      Unpublish
                    </button>
                    <button
                      type="button"
                      className={ACTION_CLASS}
                      disabled={pendingReference !== null}
                      onClick={() => decide(notice, 'rejected')}
                    >
                      Reject
                    </button>
                    {notice.status === 'received' ? (
                      <button
                        type="button"
                        className={ACTION_CLASS}
                        disabled={pendingReference !== null}
                        onClick={() => decide(notice, 'counter_notified')}
                      >
                        Counter-notice received
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
