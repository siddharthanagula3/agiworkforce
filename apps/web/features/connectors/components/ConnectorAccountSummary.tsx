'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Spinner } from '@agiworkforce/ui';

import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';

const AccountSchema = z.object({
  accountKey: z.string(),
  accountLabel: z.string().nullable(),
  needsReauthorization: z.boolean(),
});

const AccountsSchema = z.object({
  accounts: z.array(AccountSchema),
});

type ConnectedAccount = z.infer<typeof AccountSchema>;

const HEADING = 'Connected account';
const LOADING_COPY = 'Reading the connected account';
const FAILED_COPY = 'The connected account could not be read.';
const UNNAMED_COPY = 'The provider did not share the account name.';
const RECONNECT_NEEDED = 'Needs reconnecting';

function accountsPath(connectorId: string): string {
  return `/api/connectors/${encodeURIComponent(connectorId)}/accounts`;
}

async function fetchAccounts(
  connectorId: string,
  signal: AbortSignal,
): Promise<ConnectedAccount[]> {
  const response = await fetch(accountsPath(connectorId), {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  const parsed = AccountsSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('The connected account came back in a shape this page cannot read.');
  }
  return parsed.data.accounts;
}

export function ConnectorAccountSummary({
  connectorId,
  className,
}: {
  connectorId: string;
  className?: string;
}) {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!connectorId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchAccounts(connectorId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setAccounts(next);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setAccounts(null);
        setError(toUserMessage(reason, FAILED_COPY));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, connectorId]);

  if (!loading && !error && (accounts === null || accounts.length === 0)) return null;

  return (
    <section className={cn('space-y-2', className)} aria-labelledby="connector-account-heading">
      <h3 id="connector-account-heading" className="text-sm font-medium text-foreground">
        {HEADING}
      </h3>

      {loading && accounts === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
          <Spinner size="sm" aria-label={LOADING_COPY} />
          {LOADING_COPY}
        </div>
      ) : error ? (
        <div role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-4">
          <p className="text-xs text-danger-text">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 inline-flex min-h-6 items-center px-1 text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {(accounts ?? []).map((account) => (
            <li
              key={account.accountKey}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/50 px-3 py-2"
            >
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  account.accountLabel ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {account.accountLabel ?? UNNAMED_COPY}
              </span>
              {account.needsReauthorization ? (
                <span className="text-xs font-medium text-danger-text">{RECONNECT_NEEDED}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
