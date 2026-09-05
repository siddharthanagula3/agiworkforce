'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner, useConfirm } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import type {
  DataRightsRequestType,
  OpenDataRightsRequest,
} from '@/lib/server/data-rights-requests';
import type { AnonymousTableErasure } from '@/lib/server/anonymous-erasure';
import { formatCount, formatDateTime } from '../lib/operator-format';

const REQUESTS_ENDPOINT = '/api/admin/privacy/requests';
const ERASURES_ENDPOINT = '/api/admin/privacy/erasures';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const DESTRUCTIVE_CLASS =
  'rounded-full border border-destructive/50 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50';

const REQUEST_TYPE_LABEL: Record<DataRightsRequestType, string> = {
  access: 'Access',
  correction: 'Correction',
  erasure: 'Erasure',
  withdrawal: 'Withdraw consent',
  nomination: 'Nomination',
  grievance: 'Grievance',
};

interface ErasureReport {
  complete: boolean;
  deleted: number;
  accountBound: number;
  tables: Record<string, AnonymousTableErasure>;
}

export default function PrivacyRequestsPanel() {
  const [requests, setRequests] = useState<OpenDataRightsRequest[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [erasing, setErasing] = useState(false);
  const [report, setReport] = useState<ErasureReport | null>(null);
  const [erasureError, setErasureError] = useState<string | null>(null);
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setListError(null);
    try {
      const response = await fetch(REQUESTS_ENDPOINT, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      setRequests((body as { requests: OpenDataRightsRequest[] }).requests);
    } catch (error) {
      setListError(toUserMessage(error, 'Could not load data rights requests.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * A partial erasure answers with an error status and a report body, and the
   * report is the useful half: it names which tables were cleared and which
   * refused, so the operator can finish the request rather than being told
   * only that something failed.
   */
  async function eraseSubject() {
    const contactEmail = email.trim();
    const recordedReason = reason.trim();
    if (!contactEmail || !recordedReason) {
      setErasureError('An email address and a reason are both required.');
      return;
    }
    const confirmed = await confirmDestructive({
      title: 'Erase every record held against this address?',
      description:
        `Rows the waitlist, the consent ledger and the data rights log hold against this address are deleted outright, ` +
        `so any consent history and request trail for it is gone and cannot be restored from this console. ` +
        `Rows bound to a signed-up account are not touched here and are reported back for account deletion instead. ` +
        `Your account, this reason and the time are written to the audit log.`,
      confirmText: 'Erase subject',
      variant: 'destructive',
    });
    if (!confirmed) return;

    setErasing(true);
    setErasureError(null);
    setReport(null);
    try {
      const response = await fetch(ERASURES_ENDPOINT, {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: contactEmail, reason: recordedReason }),
      });
      const body = await response.json().catch(() => null);
      const candidate = body as ErasureReport | null;
      if (candidate && typeof candidate.complete === 'boolean' && candidate.tables) {
        setReport(candidate);
        if (candidate.complete) {
          setEmail('');
          setReason('');
        }
        await load();
        return;
      }
      throw new Error(
        (body as { error?: { message?: string } })?.error?.message ??
          `Request failed (${response.status})`,
      );
    } catch (error) {
      setErasureError(toUserMessage(error, 'Could not erase that subject.'));
    } finally {
      setErasing(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="privacy-requests-title">
      <div>
        <h2 id="privacy-requests-title" className="text-sm font-medium">
          Data rights requests
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every request still open, oldest first. A signed-in subject deletes their own account data
          from settings; this queue is what someone with no account, or a request that needs a
          human, arrives through.
        </p>
      </div>

      {destructiveConfirmDialog}

      {listError ? (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      ) : requests === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading the request queue…</span>
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No request is open. Rows appear here when someone submits an access, correction, erasure,
          consent withdrawal, nomination or grievance request, and leave once it is resolved or
          rejected.
        </p>
      ) : (
        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-card text-left">
              <tr>
                <th className="p-3 font-medium">Reference</th>
                <th className="p-3 font-medium">Kind</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Contact</th>
                <th className="p-3 font-medium">Account</th>
                <th className="p-3 font-medium">Received</th>
                <th className="p-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.reference} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{request.reference}</td>
                  <td className="p-3">{REQUEST_TYPE_LABEL[request.requestType]}</td>
                  <td className="p-3 text-xs">{request.status.replace('_', ' ')}</td>
                  <td className="max-w-xs truncate p-3 text-xs">{request.contactEmail}</td>
                  <td className="p-3 font-mono text-xs">{request.userId ?? 'no account'}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {formatDateTime(request.createdAt)}
                  </td>
                  <td className="max-w-sm p-3 text-xs text-muted-foreground">
                    {request.details ?? 'none given'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={CARD_CLASS}>
        <h3 className="text-sm font-medium">Erase a subject with no account</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Clears the waitlist, consent ledger and data rights rows held against one address. Rows
          that belong to a signed-up account are reported rather than deleted, because those belong
          to account deletion where the account owner is authenticated.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Subject email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Reason, recorded on the audit entry
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <button
            onClick={() => void eraseSubject()}
            disabled={erasing}
            className={DESTRUCTIVE_CLASS}
          >
            {erasing ? 'Erasing…' : 'Erase subject'}
          </button>
        </div>

        {erasureError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {erasureError}
          </p>
        ) : null}

        {report ? (
          <div className="mt-4 border-t border-border pt-4">
            <p role="status" className="text-sm">
              {report.complete
                ? `Erased ${formatCount(report.deleted)} row(s). ${formatCount(report.accountBound)} row(s) belong to an account and were left for account deletion.`
                : `Partly erased: ${formatCount(report.deleted)} row(s) removed, and at least one table refused. The request is not finished; see the table below.`}
            </p>
            <div className={`mt-3 ${TABLE_WRAP_CLASS}`}>
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-card text-left">
                  <tr>
                    <th className="p-3 font-medium">Table</th>
                    <th className="p-3 font-medium">Deleted</th>
                    <th className="p-3 font-medium">Left for account deletion</th>
                    <th className="p-3 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.tables).map(([table, outcome]) => (
                    <tr key={table} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{table}</td>
                      <td className="p-3 tabular-nums">{formatCount(outcome.deleted)}</td>
                      <td className="p-3 tabular-nums">{formatCount(outcome.accountBound)}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {outcome.error ?? (outcome.skipped ? 'not present in this schema' : 'done')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
