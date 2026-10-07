'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import {
  OPERATOR_WAITLIST_EXPORT_PATH,
  OPERATOR_WAITLIST_PATH,
  OperatorPublicWaitlistResponseSchema,
  OperatorUpgradeWaitlistResponseSchema,
  type OperatorPublicWaitlistResponse,
  type OperatorUpgradeWaitlistResponse,
  type OperatorWaitlistCount,
  type OperatorWaitlistList,
} from '@agiworkforce/cloud-contracts/waitlist';
import { toUserMessage } from '@/lib/user-error-message';
import { formatCount, formatDateTime, NOT_RECORDED } from '../lib/operator-format';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const QUIET_BUTTON_CLASS =
  'rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-foreground/30 disabled:opacity-50';
const LOAD_FAILED_MESSAGE = 'Could not load the waitlist.';

async function requestWaitlist(
  list: OperatorWaitlistList,
  cursor: string | null,
): Promise<unknown> {
  const query = new URLSearchParams({ list });
  if (cursor) query.set('cursor', cursor);
  const response = await fetch(`${OPERATOR_WAITLIST_PATH}?${query.toString()}`, {
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return body;
}

function describeCounts(counts: readonly OperatorWaitlistCount[]): string {
  return counts.map((row) => `${row.key || NOT_RECORDED}: ${formatCount(row.count)}`).join(' · ');
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className={`${CARD_CLASS} flex items-center gap-3`}>
      <Spinner size="sm" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export default function WaitlistPanel() {
  const [publicList, setPublicList] = useState<OperatorPublicWaitlistResponse | null>(null);
  const [upgradeList, setUpgradeList] = useState<OperatorUpgradeWaitlistResponse | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<OperatorWaitlistList | null>(null);

  const loadPublic = useCallback(async (cursor: string | null) => {
    setPublicError(null);
    try {
      const page = OperatorPublicWaitlistResponseSchema.parse(
        await requestWaitlist('public', cursor),
      );
      setPublicList((current) =>
        current && cursor ? { ...page, entries: [...current.entries, ...page.entries] } : page,
      );
    } catch (error) {
      setPublicError(toUserMessage(error, LOAD_FAILED_MESSAGE));
    }
  }, []);

  const loadUpgrade = useCallback(async (cursor: string | null) => {
    setUpgradeError(null);
    try {
      const page = OperatorUpgradeWaitlistResponseSchema.parse(
        await requestWaitlist('upgrade', cursor),
      );
      setUpgradeList((current) =>
        current && cursor ? { ...page, entries: [...current.entries, ...page.entries] } : page,
      );
    } catch (error) {
      setUpgradeError(toUserMessage(error, LOAD_FAILED_MESSAGE));
    }
  }, []);

  useEffect(() => {
    void loadPublic(null);
    void loadUpgrade(null);
  }, [loadPublic, loadUpgrade]);

  async function loadMore(list: OperatorWaitlistList, cursor: string) {
    setLoadingMore(list);
    await (list === 'public' ? loadPublic(cursor) : loadUpgrade(cursor));
    setLoadingMore(null);
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="operator-waitlist-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="operator-waitlist-title" className="text-h5">
            Waitlist
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every address a waitlist form recorded, newest first. Each row shows the latest decision
            on record for the purposes its own list asks for. A purpose that is missing has no
            decision on record for that list, so do not mail for it. Nothing in the product mails
            this list. Each time this view loads and each export is written to the audit log with
            your account and the number of rows, never the addresses. If that entry cannot be
            written, nothing is served.
          </p>
        </div>
        <a href={OPERATOR_WAITLIST_EXPORT_PATH} download className={QUIET_BUTTON_CLASS}>
          Export CSV
        </a>
      </div>

      {publicError ? (
        <p role="alert" className="text-sm text-danger">
          {publicError}
        </p>
      ) : null}

      {publicList === null ? (
        publicError ? null : (
          <LoadingCard label="Reading the waitlist…" />
        )
      ) : (
        <>
          <p className="text-sm">
            {formatCount(publicList.total)} recorded
            {publicList.bySource.length > 0 ? (
              <span className="text-muted-foreground">
                {' '}
                by source, {describeCounts(publicList.bySource)}
              </span>
            ) : null}
          </p>
          {publicList.total > publicList.exportRowLimit ? (
            <p className="text-sm text-muted-foreground">
              The export holds the newest {formatCount(publicList.exportRowLimit)} of{' '}
              {formatCount(publicList.total)} entries.
            </p>
          ) : null}
          {publicList.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody has joined yet. A row appears here once a visitor submits a waitlist form and
              the server confirms it stored the address.
            </p>
          ) : (
            <div className={TABLE_WRAP_CLASS}>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-card text-start">
                  <tr>
                    <th scope="col" className="p-3 font-medium">
                      Email
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Source
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Joined
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Consent on record
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {publicList.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border align-top">
                      <td className="break-all p-3">{entry.email ?? NOT_RECORDED}</td>
                      <td className="p-3 font-mono">{entry.source}</td>
                      <td className="p-3 text-muted-foreground">
                        {formatDateTime(entry.joinedAt)}
                      </td>
                      <td className="p-3">
                        {entry.consent.length === 0 ? (
                          <span className="text-muted-foreground">
                            no decision on record for this list
                          </span>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {entry.consent.map((decision) => (
                              <li key={decision.purpose}>
                                <span className="font-mono">{decision.purpose}</span>{' '}
                                {decision.granted ? 'granted' : 'not granted'}
                                <span className="text-muted-foreground">
                                  {' '}
                                  on {formatDateTime(decision.recordedAt)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {publicList.hasMore && publicList.nextCursor ? (
            <div>
              <button
                type="button"
                onClick={() => void loadMore('public', publicList.nextCursor ?? '')}
                disabled={loadingMore !== null}
                className={QUIET_BUTTON_CLASS}
              >
                {loadingMore === 'public' ? 'Loading…' : 'Load more entries'}
              </button>
            </div>
          ) : null}
        </>
      )}

      <div>
        <h3 className="text-h5">Paid plan upgrade waitlist</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed-in accounts that joined the waitlist for a paid plan. This list stores the account,
          not a mailable address, so reach each one through its account in the users tab.
        </p>
      </div>

      {upgradeError ? (
        <p role="alert" className="text-sm text-danger">
          {upgradeError}
        </p>
      ) : null}

      {upgradeList === null ? (
        upgradeError ? null : (
          <LoadingCard label="Reading the upgrade waitlist…" />
        )
      ) : (
        <>
          <p className="text-sm">
            {formatCount(upgradeList.total)} recorded
            {upgradeList.byPlan.length > 0 ? (
              <span className="text-muted-foreground">
                {' '}
                by plan, {describeCounts(upgradeList.byPlan)}
              </span>
            ) : null}
          </p>
          {upgradeList.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No account has joined a paid plan waitlist. A row appears here when a signed-in
              account asks for one from the upgrade dialog.
            </p>
          ) : (
            <div className={TABLE_WRAP_CLASS}>
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-card text-start">
                  <tr>
                    <th scope="col" className="p-3 font-medium">
                      Account
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Plan
                    </th>
                    <th scope="col" className="p-3 font-medium">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {upgradeList.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="break-all p-3 font-mono">{entry.userId ?? NOT_RECORDED}</td>
                      <td className="p-3">{entry.plan ?? NOT_RECORDED}</td>
                      <td className="p-3 text-muted-foreground">
                        {formatDateTime(entry.joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {upgradeList.hasMore && upgradeList.nextCursor ? (
            <div>
              <button
                type="button"
                onClick={() => void loadMore('upgrade', upgradeList.nextCursor ?? '')}
                disabled={loadingMore !== null}
                className={QUIET_BUTTON_CLASS}
              >
                {loadingMore === 'upgrade' ? 'Loading…' : 'Load more accounts'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
