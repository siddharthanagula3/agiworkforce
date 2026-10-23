'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe, RefreshCw } from '@agiworkforce/icons';
import { Button, SearchInput, Spinner } from '@agiworkforce/ui';
import { NEW_CHAT_PATH } from '@features/chat/lib/new-chat-entry';
import { toUserMessage } from '@/lib/user-error-message';
import { useSiteActions } from '../hooks/useSiteActions';
import { sortSitesByUpdated } from '../lib/site-format';
import { listPublishedSites, type PublishedSite } from '../services/sites-service';
import { usePublishedSitesStore } from '../stores/published-sites-store';
import { SiteCard } from './SiteCard';
import { RenameSiteDialog, SiteSharingDialog } from './SiteDialogs';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sites: PublishedSite[]; workspace: { memberCount: number } | null };

export function SitesEmptyState() {
  return (
    <div
      data-testid="sites-empty"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--chat-border)] px-6 py-16 text-center"
    >
      <Globe className="h-6 w-6 text-[var(--chat-text-muted)]" aria-hidden="true" />
      <h2 className="text-base font-medium text-[var(--chat-text-primary)]">No sites yet</h2>
      <p className="max-w-md text-sm text-[var(--chat-text-secondary)]">
        Ask AGI to build an app, then Publish it from the artifact panel. Every app you publish
        shows up here with its link, who can open it, and the data it keeps.
      </p>
      <Button asChild size="sm" className="mt-1 pointer-coarse:min-h-11">
        <Link href={NEW_CHAT_PATH}>Start a chat</Link>
      </Button>
    </div>
  );
}

export function SitesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [renaming, setRenaming] = useState<PublishedSite | null>(null);
  const [sharing, setSharing] = useState<PublishedSite | null>(null);
  const [query, setQuery] = useState('');
  const hydrateStore = usePublishedSitesStore((store) => store.hydrate);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ status: 'loading' });
      try {
        const { sites, workspace } = await listPublishedSites(signal);
        hydrateStore(sites);
        setState({ status: 'ready', sites, workspace });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: 'error',
          message: toUserMessage(error, 'Your sites could not be loaded.'),
        });
      }
    },
    [hydrateStore],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const replaceSite = useCallback((next: PublishedSite) => {
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            sites: current.sites.map((site) => (site.token === next.token ? next : site)),
          }
        : current,
    );
  }, []);

  const removeSite = useCallback((removed: PublishedSite) => {
    setState((current) =>
      current.status === 'ready'
        ? { ...current, sites: current.sites.filter((site) => site.token !== removed.token) }
        : current,
    );
  }, []);

  const actions = useSiteActions({ onUpdated: replaceSite, onUnpublished: removeSite });
  const sites = useMemo(
    () => (state.status === 'ready' ? sortSitesByUpdated(state.sites) : []),
    [state],
  );

  const needle = query.trim().toLowerCase();
  const visibleSites = useMemo(
    () => (needle ? sites.filter((site) => site.title.toLowerCase().includes(needle)) : sites),
    [sites, needle],
  );

  return (
    <section
      data-design="agi"
      className="min-h-full bg-background px-gutter-compact py-8 text-foreground sm:px-gutter-regular sm:py-12 lg:px-gutter-wide"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-h2 text-[var(--chat-text-primary)]">Sites</h1>
            <p className="max-w-2xl text-sm text-[var(--chat-text-secondary)]">
              Everything you have published from chat.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh sites"
              disabled={state.status === 'loading'}
              onClick={() => void load()}
              className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button asChild size="sm" className="rounded-full pointer-coarse:min-h-11">
              <Link href={NEW_CHAT_PATH}>Create</Link>
            </Button>
          </div>
        </header>

        {state.status === 'ready' && sites.length > 0 && (
          <SearchInput
            aria-label="Search sites"
            placeholder="Search sites"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            containerClassName="w-full"
            className="h-11 rounded-full bg-[var(--chat-input-bg)] placeholder:text-[var(--chat-text-placeholder)]"
          />
        )}

        {state.status === 'loading' ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16">
            <Spinner size="sm" aria-hidden="true" />
            <span className="text-sm text-[var(--chat-text-secondary)]">Loading your sites…</span>
          </div>
        ) : state.status === 'error' ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p role="alert" className="text-sm text-[var(--chat-text-secondary)]">
              {state.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : sites.length === 0 ? (
          <SitesEmptyState />
        ) : visibleSites.length === 0 ? (
          <p
            data-testid="sites-no-match"
            className="py-16 text-center text-sm text-[var(--chat-text-secondary)]"
          >
            No sites match your search.
          </p>
        ) : (
          <ul aria-label="Your sites" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSites.map((site) => (
              <SiteCard
                key={site.token}
                site={site}
                onCopyLink={(target) => void actions.copyLink(target)}
                onRename={setRenaming}
                onSharing={setSharing}
                onUnpublish={actions.requestUnpublish}
              />
            ))}
          </ul>
        )}
      </div>

      <RenameSiteDialog
        site={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        onRename={actions.rename}
      />
      <SiteSharingDialog
        site={sharing}
        workspace={state.status === 'ready' ? state.workspace : null}
        onOpenChange={(open) => !open && setSharing(null)}
        onChange={actions.setVisibility}
      />
      {actions.dialog}
    </section>
  );
}
