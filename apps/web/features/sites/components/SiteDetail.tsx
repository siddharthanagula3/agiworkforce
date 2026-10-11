'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Copy, ExternalLink, Pencil } from '@agiworkforce/icons';
import { Button, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useSiteActions } from '../hooks/useSiteActions';
import { displaySiteUrl, formatSiteUpdated, siteName } from '../lib/site-format';
import {
  SITES_PATH,
  listPublishedSites,
  siteEditPath,
  siteVisitPath,
  type PublishedSite,
} from '../services/sites-service';
import { usePublishedSitesStore } from '../stores/published-sites-store';
import { SiteVisibilityBadge } from './SiteCard';
import { SiteDataTab } from './SiteDataTab';
import { SiteSettingsTab } from './SiteSettingsTab';
import { SiteThumbnail } from './SiteThumbnail';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | { status: 'ready'; site: PublishedSite; workspace: { memberCount: number } | null };

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
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const hydrateStore = usePublishedSitesStore((store) => store.hydrate);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const { sites, workspace } = await listPublishedSites(signal);
        hydrateStore(sites);
        const site = sites.find((candidate) => candidate.token === token);
        setState(site ? { status: 'ready', site, workspace } : { status: 'missing' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: 'error',
          message: toUserMessage(error, 'This site could not be loaded.'),
        });
      }
    },
    [token, hydrateStore],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onUpdated = useCallback((site: PublishedSite) => {
    setState((current) => (current.status === 'ready' ? { ...current, site } : current));
  }, []);
  const onUnpublished = useCallback(() => router.push(SITES_PATH), [router]);
  const actions = useSiteActions({ onUpdated, onUnpublished });

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
            <Button variant="outline" size="sm" onClick={() => void load()}>
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
