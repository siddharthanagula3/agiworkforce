'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Globe, RefreshCw } from '@agiworkforce/icons';
import { Button, SearchInput, Spinner } from '@agiworkforce/ui';
import { NEW_CHAT_PATH } from '@features/chat/lib/new-chat-entry';
import { toUserMessage } from '@/lib/user-error-message';
import { mergeSiteUpdate, useSiteActions, type SiteUpdate } from '../hooks/useSiteActions';
import { sortSitesByUpdated } from '../lib/site-format';
import { listPublishedSitesPage, type PublishedSite } from '../services/sites-service';
import {
  isPublicationLeaseCurrent,
  usePublishedSitesStore,
  type PublicationLease,
} from '../stores/published-sites-store';
import { SiteCard } from './SiteCard';
import { RenameSiteDialog, SiteSharingDialog } from './SiteDialogs';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; failedCursor: string | null }
  | {
      status: 'ready';
      sites: PublishedSite[];
      workspace: { memberCount: number } | null;
      cursor: string | null;
      nextCursor: string | null;
      loading?: boolean;
      pageError?: string;
      failedCursor?: string | null;
    };

type SitesView = {
  active: boolean;
  sites: PublishedSite[] | null;
  request: AbortController | null;
};

function interruptRead(view: SitesView) {
  const request = view.request;
  view.request = null;
  request?.abort();
}

export function SitesEmptyState() {
  return (
    <div
      data-testid="sites-empty"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--chat-border)] px-6 py-16 text-center"
    >
      <Globe className="h-6 w-6 text-[var(--chat-text-muted)]" aria-hidden="true" />
      <h2 className="text-base font-medium text-[var(--chat-text-primary)]">No sites yet</h2>
      <p className="max-w-md text-sm text-[var(--chat-text-secondary)]">
        Ask AGI to build an app, then Publish it from the artifact panel.
      </p>
      <Button asChild size="sm" className="mt-1 pointer-coarse:min-h-11">
        <Link href={NEW_CHAT_PATH}>Start a chat</Link>
      </Button>
    </div>
  );
}

export function SitesPage() {
  const lease = usePublishedSitesStore((store) => store.lease);
  return <SitesPageView key={lease?.epoch ?? 'closed'} lease={lease} />;
}

function SitesPageView({ lease }: { lease: PublicationLease | null }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [renaming, setRenaming] = useState<PublishedSite | null>(null);
  const [sharing, setSharing] = useState<PublishedSite | null>(null);
  const [query, setQuery] = useState('');
  const viewRef = useRef<SitesView | null>(null);
  const recordSite = usePublishedSitesStore((store) => store.record);

  const load = useCallback(
    async (cursor: string | null = null) => {
      const view = viewRef.current;
      if (!isPublicationLeaseCurrent(lease) || !view?.active) return;
      interruptRead(view);
      const request = new AbortController();
      view.request = request;
      setRenaming(null);
      setSharing(null);
      setState((current) =>
        current.status === 'ready'
          ? { ...current, loading: true, pageError: undefined, failedCursor: undefined }
          : { status: 'loading' },
      );
      if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
      try {
        const { sites, workspace, nextCursor } = await listPublishedSitesPage(
          cursor,
          request.signal,
        );
        if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
        for (const site of sites) {
          const recorded = recordSite(site.artifactId, site, lease);
          if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
          if (!recorded) throw new Error('A publication link could not be confirmed.');
        }
        if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
        view.request = null;
        view.sites = sites;
        setState({ status: 'ready', sites, workspace, cursor, nextCursor });
      } catch (error) {
        if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
        view.request = null;
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                loading: false,
                failedCursor: cursor,
                pageError: toUserMessage(error, 'Your sites could not be loaded.'),
              }
            : {
                status: 'error',
                failedCursor: cursor,
                message: toUserMessage(error, 'Your sites could not be loaded.'),
              },
        );
      }
    },
    [recordSite, lease],
  );

  useLayoutEffect(() => {
    const view: SitesView = { active: true, sites: null, request: null };
    viewRef.current = view;
    const unsubscribe = usePublishedSitesStore.subscribe(() => {
      if (!isPublicationLeaseCurrent(lease)) {
        view.active = false;
        interruptRead(view);
      }
    });
    void load();
    return () => {
      unsubscribe();
      view.active = false;
      interruptRead(view);
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [load, lease]);

  const updateSite = useCallback(
    (update: SiteUpdate) => {
      const view = viewRef.current;
      if (
        !isPublicationLeaseCurrent(lease) ||
        !view?.active ||
        !view.sites?.some(
          (site) => site.token === update.token && site.artifactId === update.artifactId,
        )
      )
        return;
      interruptRead(view);
      view.sites = view.sites.map((site) => mergeSiteUpdate(site, update));
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              loading: false,
              pageError: undefined,
              sites: current.sites.map((site) => mergeSiteUpdate(site, update)),
            }
          : current,
      );
    },
    [lease],
  );

  const removeSite = useCallback(
    (removed: PublishedSite) => {
      const view = viewRef.current;
      if (
        !isPublicationLeaseCurrent(lease) ||
        !view?.active ||
        !view.sites?.some(
          (site) => site.token === removed.token && site.artifactId === removed.artifactId,
        )
      )
        return;
      interruptRead(view);
      view.sites = view.sites.filter(
        (site) => site.token !== removed.token || site.artifactId !== removed.artifactId,
      );
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              loading: false,
              pageError: undefined,
              sites: current.sites.filter(
                (site) => site.token !== removed.token || site.artifactId !== removed.artifactId,
              ),
            }
          : current,
      );
    },
    [lease],
  );

  const actions = useSiteActions({ onUpdated: updateSite, onUnpublished: removeSite, lease });
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
      className="min-h-full bg-background px-gutter-compact pt-6 pb-8 text-foreground sm:px-gutter-regular sm:py-12 lg:px-gutter-wide"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4 max-md:flex-wrap max-md:items-center max-md:gap-y-2">
          <div className="flex min-w-0 flex-col gap-2 max-md:contents">
            <h1 className="text-h2 text-[var(--chat-text-primary)] max-md:text-[28px] max-md:font-medium max-md:leading-[1.2]">
              Sites
            </h1>
            <p className="max-w-2xl text-sm text-[var(--chat-text-secondary)] max-md:order-last max-md:basis-full">
              Your published apps. Search and sorting apply to this page only.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh sites"
              disabled={state.status === 'loading' || (state.status === 'ready' && state.loading)}
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
            placeholder="Search this page"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            containerClassName="w-full"
            className="h-11 rounded-full bg-[var(--chat-input-bg)] placeholder:text-[var(--chat-text-placeholder)]"
          />
        )}

        {state.status === 'ready' && (
          <div className="flex flex-col gap-3">
            {state.loading && (
              <div role="status" className="flex items-center gap-2 text-sm">
                <Spinner size="sm" aria-hidden="true" /> Loading your sites… The previous page is
                still shown.
              </div>
            )}
            {state.pageError && (
              <div className="flex items-center gap-3">
                <p role="alert" className="text-sm">
                  {state.pageError} The previous page is still shown and may be out of date.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={state.loading}
                  onClick={() => void load(state.failedCursor ?? null)}
                >
                  Try again
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={state.loading || state.cursor === null}
                onClick={() => void load()}
              >
                Back to newest
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={state.loading || state.nextCursor === null}
                onClick={() => {
                  if (state.nextCursor !== null) void load(state.nextCursor);
                }}
              >
                Older
              </Button>
            </div>
          </div>
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
            <Button variant="outline" size="sm" onClick={() => void load(state.failedCursor)}>
              Try again
            </Button>
          </div>
        ) : sites.length === 0 ? (
          state.cursor === null && state.nextCursor === null ? (
            <SitesEmptyState />
          ) : (
            <p className="text-sm text-[var(--chat-text-secondary)]">No sites on this page.</p>
          )
        ) : visibleSites.length === 0 ? (
          <p
            data-testid="sites-no-match"
            className="py-16 text-center text-sm text-[var(--chat-text-secondary)]"
          >
            No sites on this page match your search.
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
