'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ZodType } from 'zod';
import {
  BANK_ACCOUNTS_ITEMS_PATH,
  BankAccountsItemRemoveResponseSchema,
  BankAccountsItemUpdateResponseSchema,
  BankAccountsItemsResponseSchema,
  bankAccountsItemPath,
  type BankAccountsItem,
} from '@agiworkforce/cloud-contracts';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const LOAD_FAILED = 'Your linked banks could not be loaded.';
const SAVE_FAILED = 'That change was not saved. Try again.';

async function sendItemChange(
  itemId: string,
  init: RequestInit,
  responseSchema: ZodType,
): Promise<void> {
  const response = await fetch(bankAccountsItemPath(itemId), {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !responseSchema.safeParse(body).success) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? SAVE_FAILED);
  }
}

export function LinkedBanks({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<BankAccountsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(async () => {
    try {
      const response = await fetch(BANK_ACCOUNTS_ITEMS_PATH, { credentials: 'include' });
      const parsed = BankAccountsItemsResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) throw new Error(LOAD_FAILED);
      setItems(parsed.data.items);
      setError(null);
    } catch (loadError) {
      setError(toUserMessage(loadError, LOAD_FAILED));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAccount = async (item: BankAccountsItem, accountId: string, include: boolean) => {
    const excluded = item.accounts
      .filter((account) => (account.accountId === accountId ? !include : !account.included))
      .map((account) => account.accountId);
    setBusyItem(item.id);
    try {
      await sendItemChange(
        item.id,
        {
          method: 'PATCH',
          body: JSON.stringify({ excludedAccountIds: excluded }),
        },
        BankAccountsItemUpdateResponseSchema,
      );
      await load();
      onChanged();
    } catch (saveError) {
      setError(toUserMessage(saveError, SAVE_FAILED));
    } finally {
      setBusyItem(null);
    }
  };

  const removeBank = (item: BankAccountsItem) => {
    const name = item.institutionName ?? 'this bank';
    confirm({
      title: `Remove ${name}?`,
      description:
        'Its accounts stop appearing in chats and the finance view, and the link is removed at Plaid. Past chats are not changed.',
      confirmLabel: 'Remove bank',
      destructive: true,
      onConfirm: async () => {
        await sendItemChange(item.id, { method: 'DELETE' }, BankAccountsItemRemoveResponseSchema);
        await load();
        onChanged();
      },
    });
  };

  if (items === null && !error) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" aria-hidden="true" />
        Loading your linked banks
      </div>
    );
  }

  return (
    <section aria-labelledby="finance-linked-banks" className="space-y-2">
      <h2 id="finance-linked-banks" className="text-sm font-semibold text-foreground">
        Linked banks
      </h2>
      {error ? (
        <p role="status" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {(items ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {item.institutionName ?? 'Linked bank'}
              </p>
              <button
                type="button"
                onClick={() => removeBank(item)}
                disabled={busyItem === item.id}
                className="min-h-9 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Remove bank
              </button>
            </div>
            {item.status === 'reconnect' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                The bank asks you to sign in again before it shares its accounts.
              </p>
            ) : item.status === 'unavailable' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                The bank did not answer, so its accounts could not be listed.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {item.accounts.map((account) => (
                  <li key={account.accountId}>
                    <label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={account.included}
                        disabled={busyItem === item.id}
                        onChange={(event) =>
                          void toggleAccount(item, account.accountId, event.target.checked)
                        }
                      />
                      {account.mask ? `${account.name} ••${account.mask}` : account.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Unchecked accounts stay linked but are left out of chats and this view.
      </p>
      {dialog}
    </section>
  );
}
