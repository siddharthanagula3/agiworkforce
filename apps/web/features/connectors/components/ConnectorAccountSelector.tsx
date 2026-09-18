'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';
import { getCsrfToken } from '@/lib/client/csrf';
import {
  connectorAccountDisplayName,
  CONNECTOR_ACCOUNT_SCOPES,
  type ConnectorAccount,
} from '@/lib/connectors/accounts';

const AccountSchema = z.object({
  connectorId: z.string(),
  accountKey: z.string(),
  accountLabel: z.string().nullable(),
  scope: z.enum(CONNECTOR_ACCOUNT_SCOPES),
  isDefault: z.boolean(),
  grantedScopes: z.array(z.string()),
  connectedAt: z.string(),
  updatedAt: z.string(),
  needsReauthorization: z.boolean(),
});

const AccountsSchema = z.object({
  connectorId: z.string(),
  accounts: z.array(AccountSchema),
  supportsMultipleAccounts: z.boolean(),
  supportsServiceAccount: z.boolean(),
});

type AccountsResponse = z.infer<typeof AccountsSchema>;

const HEADING = 'Connected accounts';
const LOADING_COPY = 'Reading connected accounts';
const FAILED_COPY = 'The connected accounts could not be read.';
const SINGLE_ACCOUNT_COPY = 'This connector runs on your own machine, so it has one account.';
const EMPTY_COPY = 'No account is connected for this connector yet.';
const DEFAULT_BADGE = 'Used by default';
const SERVICE_HINT =
  'This connector authenticates with a credential rather than a personal sign-in, so it can hold a shared service account beside your own.';
const MAKE_DEFAULT_LABEL = 'Use by default';
const DISCONNECT_LABEL = 'Disconnect';
const RECONNECT_NEEDED = 'Needs reconnecting';
const SCOPE_LABEL = { personal: 'Personal', work: 'Work', service: 'Service account' } as const;

function accountsPath(connectorId: string): string {
  return `/api/connectors/${encodeURIComponent(connectorId)}/accounts`;
}

async function fetchAccounts(connectorId: string, signal: AbortSignal): Promise<AccountsResponse> {
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
    throw new Error('The connected accounts came back in a shape this page cannot read.');
  }
  return parsed.data;
}

interface AccountMutation {
  method: 'PATCH' | 'DELETE';
  accountKey: string;
}

async function mutateAccount(connectorId: string, request: AccountMutation): Promise<void> {
  const csrfToken = await getCsrfToken();
  const url =
    request.method === 'DELETE'
      ? `${accountsPath(connectorId)}?accountKey=${encodeURIComponent(request.accountKey)}`
      : accountsPath(connectorId);
  const response = await fetch(url, {
    method: request.method,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    ...(request.method === 'PATCH'
      ? { body: JSON.stringify({ accountKey: request.accountKey }) }
      : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
}

export function ConnectorAccountSelector({
  connectorId,
  connectorName,
  className,
}: {
  connectorId: string;
  connectorName: string;
  className?: string;
}) {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { confirm, dialog } = useConfirmAction();

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!connectorId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchAccounts(connectorId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setData(next);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(toUserMessage(reason, FAILED_COPY));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, connectorId]);

  const run = useCallback(
    async (request: AccountMutation) => {
      try {
        await mutateAccount(connectorId, request);
        refresh();
      } catch (reason: unknown) {
        setError(toUserMessage(reason, FAILED_COPY));
      }
    },
    [connectorId, refresh],
  );

  const disconnect = useCallback(
    (account: ConnectorAccount) =>
      confirm({
        title: `Disconnect ${connectorAccountDisplayName(account)}?`,
        description: `${connectorName} loses access to this account immediately and the stored authorization is destroyed. Reconnecting means signing in to it again. Your other ${connectorName} accounts are untouched.`,
        confirmLabel: DISCONNECT_LABEL,
        onConfirm: () => run({ method: 'DELETE', accountKey: account.accountKey }),
      }),
    [confirm, connectorName, run],
  );

  return (
    <section className={cn('space-y-2', className)} aria-labelledby="connector-accounts-heading">
      <h3 id="connector-accounts-heading" className="text-sm font-medium text-foreground">
        {HEADING}
      </h3>

      {loading && data === null ? (
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
      ) : data === null ? null : !data.supportsMultipleAccounts ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-4 text-xs text-muted-foreground">
          {SINGLE_ACCOUNT_COPY}
        </p>
      ) : data.accounts.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-4 text-xs text-muted-foreground">
          {EMPTY_COPY}
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {data.accounts.map((account) => (
              <li
                key={account.accountKey}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {connectorAccountDisplayName(account)}
                </span>
                <span className="text-xs text-muted-foreground">{SCOPE_LABEL[account.scope]}</span>
                {account.needsReauthorization ? (
                  <span className="text-xs font-medium text-danger-text">{RECONNECT_NEEDED}</span>
                ) : null}
                {account.isDefault ? (
                  <span className="text-xs font-medium text-success-text">{DEFAULT_BADGE}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void run({ method: 'PATCH', accountKey: account.accountKey })}
                    className="min-h-6 px-1 text-xs font-medium underline"
                  >
                    {MAKE_DEFAULT_LABEL}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => disconnect(account)}
                  className="min-h-6 px-1 text-xs font-medium text-danger-text underline"
                >
                  {DISCONNECT_LABEL}
                </button>
              </li>
            ))}
          </ul>
          {data.supportsServiceAccount ? (
            <p className="text-xs text-muted-foreground">{SERVICE_HINT}</p>
          ) : null}
        </>
      )}
      {dialog}
    </section>
  );
}
