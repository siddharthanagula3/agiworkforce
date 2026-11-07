'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Copy, ExternalLink, Pencil } from '@agiworkforce/icons';
import { Button, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { mergeSiteUpdate, useSiteActions, type SiteUpdate } from '../hooks/useSiteActions';
import { displaySiteUrl, formatSiteUpdated, siteName } from '../lib/site-format';
import {
  SITES_PATH,
  listPublishedSites,
  siteEditPath,
  siteVisitPath,
  type PublishedSite,
} from '../services/sites-service';
import {
  isPublicationLeaseCurrent,
  usePublishedSitesStore,
  type PublicationLease,
} from '../stores/published-sites-store';
import { SiteVisibilityBadge } from './SiteCard';
import { SiteDataTab } from './SiteDataTab';
import { SiteSettingsTab } from './SiteSettingsTab';
import { SiteThumbnail } from './SiteThumbnail';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | {
      status: 'ready';
      site: PublishedSite;
      workspace: { memberCount: number } | null;
      refreshError?: string;
    };

type DetailView = {
  active: boolean;
  artifactId: string | null;
  request: AbortController | null;
};

function interruptRead(view: DetailView): boolean {
  const request = view.request;
  view.request = null;
  request?.abort();
  return request !== null;
}

function BackLink() {
  return (
    <Link
      href={SITES_PATH}
      className="inline-flex items-center gap-1 self-start rounded-sm text-sm text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Sites
    </Link>
  );
}

function SiteHeader({
  site,
  onCopyLink,
}: {
  site: PublishedSite;
  onCopyLink: (site: PublishedSite) => void;
}) {
  const editPath = siteEditPath(site);
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <SiteThumbnail
        site={site}
        className="aspect-[16/10] w-full shrink-0 rounded-lg border border-[var(--chat-border)] sm:w-56"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="break-words text-h3 text-[var(--chat-text-primary)]">{siteName(site)}</h1>
        <div className="flex min-w-0 items-center gap-1">
          <span
            className="min-w-0 truncate font-mono text-xs text-[var(--chat-text-muted)]"
            title={site.shareUrl}
          >
            {displaySiteUrl(site.shareUrl)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label="Copy link"
            onClick={() => onCopyLink(site)}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--chat-text-muted)]">
          <SiteVisibilityBadge site={site} />
          <span>{formatSiteUpdated(site.updatedAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm">
            <a href={siteVisitPath(site.token)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Visit
            </a>
          </Button>
          {editPath ? (
            <Button asChild variant="outline" size="sm">
              <Link href={editPath}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit in chat
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function SiteDetail({ token }: { token: string }) {
  const lease = usePublishedSitesStore((store) => store.lease);
  return <SiteDetailView key={`${token}:${lease?.epoch ?? 'closed'}`} token={token} lease={lease} />;
}

function SiteDetailView({ token, lease }: { token: string; lease: PublicationLease | null }) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const viewRef = useRef<DetailView | null>(null);
  const hydrateStore = usePublishedSitesStore((store) => store.hydrate);

  const load = useCallback(
    async (showLoading = false) => {
      const view = viewRef.current;
      if (!isPublicationLeaseCurrent(lease) || !view?.active) return;
      interruptRead(view);
      const request = new AbortController();
      view.request = request;
      setState((current) =>
        !showLoading && current.status === 'ready'
          ? { ...current, refreshError: undefined }
          : { status: 'loading' },
      );
      if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
      try {
        const { sites, workspace } = await listPublishedSites(request.signal);
        if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
        const site = sites.find((candidate) => candidate.token === token);
        view.artifactId = site?.artifactId ?? null;
        if (!hydrateStore(sites, lease)) return;
        if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
        view.request = null;
        setState(site ? { status: 'ready', site, workspace } : { status: 'missing' });
      } catch (error) {
        if (!isPublicationLeaseCurrent(lease) || !view.active || view.request !== request) return;
        view.request = null;
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                refreshError:
                  'Site details could not be refreshed and may be out of date. Try again to refresh them.',
              }
            : {
                status: 'error',
                message: toUserMessage(error, 'This site could not be loaded.'),
              },
        );
      }
    },
    [token, hydrateStore, lease],
  );

  useLayoutEffect(() => {
    const view: DetailView = { active: true, artifactId: null, request: null };
    viewRef.current = view;
    const unsubscribe = usePublishedSitesStore.subscribe(() => {
      if (!isPublicationLeaseCurrent(lease)) {
        view.active = false;
        interruptRead(view);
      }
    });
    void load(true);
    return () => {
      unsubscribe();
      view.active = false;
      interruptRead(view);
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [load, lease]);

  const onUpdated = useCallback(
    (update: SiteUpdate) => {
      const view = viewRef.current;
      if (
        !isPublicationLeaseCurrent(lease) || !view?.active ||
        update.token !== token || update.artifactId !== view.artifactId
      ) return;
      const interrupted = interruptRead(view);
      setState((current) =>
        current.status === 'ready'
          ? { ...current, site: mergeSiteUpdate(current.site, update) }
          : current,
      );
      if (interrupted) void load();
    },
    [load, token, lease],
  );
  const onUnpublished = useCallback(
    (site: PublishedSite) => {
      const view = viewRef.current;
      if (
        !isPublicationLeaseCurrent(lease) || !view?.active ||
        site.token !== token || site.artifactId !== view.artifactId
      ) return;
      view.active = false;
      interruptRead(view);
      setState({ status: 'missing' });
      router.push(SITES_PATH);
    },
    [router, token, lease],
  );
  const actions = useSiteActions({ onUpdated, onUnpublished, lease });

  return (
    <section
      data-design="agi"
      className="min-h-full bg-background px-gutter-compact py-8 text-foreground sm:px-gutter-regular sm:py-12 lg:px-gutter-wide"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <BackLink />
        {state.status === 'loading' ? (
          <div role="status" className="flex items-center gap-2 py-16">
            <Spinner size="sm" aria-hidden="true" />
            <span className="text-sm text-[var(--chat-text-secondary)]">Loading site…</span>
          </div>
        ) : state.status === 'error' ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p role="alert" className="text-sm text-[var(--chat-text-secondary)]">
              {state.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load(true)}>
              Try again
            </Button>
          </div>
        ) : state.status === 'missing' ? (
          <div data-testid="site-missing" className="flex flex-col items-start gap-2 py-8">
            <h1 className="text-h3 text-[var(--chat-text-primary)]">This site is not available</h1>
            <p className="text-sm text-[var(--chat-text-secondary)]">
              It may have been unpublished, or it belongs to a different account.
            </p>
          </div>
        ) : (
          <>
            {state.refreshError ? (
              <div className="flex flex-col items-start gap-3">
                <p role="alert" className="text-sm text-[var(--chat-text-secondary)]">
                  {state.refreshError}
                </p>
                <Button variant="outline" size="sm" onClick={() => void load(true)}>
                  Try again
                </Button>
              </div>
            ) : null}
            <SiteHeader site={state.site} onCopyLink={(site) => void actions.copyLink(site)} />

            <Tabs defaultValue="settings" className="flex flex-col gap-6">
              <TabsList className="self-start">
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>
              <TabsContent value="settings">
                <SiteSettingsTab
                  site={state.site}
                  workspace={state.workspace}
                  onCopyLink={(site) => void actions.copyLink(site)}
                  onRename={actions.rename}
                  onSetVisibility={actions.setVisibility}
                  onUnpublish={actions.requestUnpublish}
                  onRestored={() => void load()}
                />
              </TabsContent>
              <TabsContent value="data">
                <SiteDataTab site={state.site} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      {actions.dialog}
    </section>
  );
}
