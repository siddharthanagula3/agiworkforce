'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Spinner, useConfirmAction } from '@agiworkforce/ui';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import { formatBytes, formatRelativeTime, siteName } from '../lib/site-format';
import {
  clearPublishedSiteSharedData,
  readPublishedSiteData,
  type PublishedSite,
  type SiteData,
} from '../services/sites-service';

type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SiteData };

function entriesLabel(count: number): string {
  return count === 1 ? '1 entry' : `${count.toLocaleString()} entries`;
}

export function clearSharedDataConsequence(
  site: Pick<PublishedSite, 'title'>,
  entryCount: number,
): string {
  return `Every visitor of “${siteName(site)}” loses the ${entriesLabel(entryCount)} it shares between them, such as a shared list or scoreboard. Each visitor's personal data is not touched. This cannot be undone.`;
}

export function SiteDataTab({ site }: { site: PublishedSite }) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ status: 'loading' });
      try {
        setState({ status: 'ready', data: await readPublishedSiteData(site.token, signal) });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setState({
          status: 'error',
          message: toUserMessage(caught, "This site's data could not be loaded."),
        });
      }
    },
    [site.token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const requestClear = (entryCount: number) =>
    confirm({
      title: 'Clear shared data?',
      description: clearSharedDataConsequence(site, entryCount),
      confirmLabel: 'Clear shared data',
      destructive: true,
      onConfirm: async () => {
        try {
          const cleared = await clearPublishedSiteSharedData(site.token);
          toast.success(`Cleared ${entriesLabel(cleared)} of shared data`);
        } catch (caught) {
          toast.error(toUserMessage(caught, "Failed to clear this site's shared data"));
        }
        await load();
      },
    });

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 py-8 text-sm text-[var(--chat-text-secondary)]"
      >
        <Spinner size="sm" aria-hidden="true" />
        Loading this site&rsquo;s data…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p role="alert" className="text-sm text-[var(--chat-text-secondary)]">
          {state.message}
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const { data } = state;
  if (!data.supported) {
    return (
      <p
        data-testid="site-data-unsupported"
        className="py-8 text-sm text-[var(--chat-text-secondary)]"
      >
        This site does not save data. Only apps built as HTML or React can keep data between visits.
      </p>
    );
  }

  const { shared } = data;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-[var(--chat-text-primary)]">Shared data</h2>
            <p className="text-sm text-[var(--chat-text-secondary)]">
              Saved by the app for every visitor to see.{' '}
              <span data-testid="site-data-summary">
                {entriesLabel(shared.entryCount)} · {formatBytes(shared.totalBytes)} of{' '}
                {formatBytes(shared.limitBytes)}
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={shared.entryCount === 0}
            onClick={() => requestClear(shared.entryCount)}
          >
            Clear shared data
          </Button>
        </div>

        {shared.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--chat-border)] px-4 py-6 text-center text-sm text-[var(--chat-text-secondary)]">
            Nothing shared yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--chat-border)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="sr-only">Shared data entries</caption>
              <thead className="text-xs text-[var(--chat-text-muted)]">
                <tr className="border-b border-[var(--chat-border-subtle)]">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Key
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Value
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Size
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {shared.entries.map((entry) => (
                  <tr
                    key={entry.key}
                    data-testid="site-data-entry"
                    className="border-b border-[var(--chat-border-subtle)] last:border-b-0 align-top"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-[var(--chat-text-primary)]">
                      {entry.key}
                    </td>
                    <td className="max-w-[320px] px-3 py-2">
                      <code className="block truncate font-mono text-xs text-[var(--chat-text-secondary)]">
                        {entry.preview}
                        {entry.truncated ? '…' : ''}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--chat-text-secondary)]">
                      {formatBytes(entry.bytes)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--chat-text-secondary)]">
                      {formatRelativeTime(entry.updatedAt) ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shared.entryCount > shared.entries.length ? (
          <p className="text-sm text-[var(--chat-text-muted)]">
            Showing the first {shared.entries.length.toLocaleString()} of{' '}
            {shared.entryCount.toLocaleString()} entries.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-1 border-t border-[var(--chat-border-subtle)] pt-6">
        <h2 className="text-base font-medium text-[var(--chat-text-primary)]">Personal data</h2>
        <p data-testid="site-data-personal" className="text-sm text-[var(--chat-text-secondary)]">
          Each signed-in visitor&rsquo;s own data stays private to them and is not shown here. You
          have {entriesLabel(data.ownPersonalEntryCount)} of your own in this site.
        </p>
      </section>
      {dialog}
    </div>
  );
}
