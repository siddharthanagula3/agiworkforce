'use client';

import Link from 'next/link';
import { Copy, ExternalLink, MessageSquare, MoreHorizontal } from '@agiworkforce/icons';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import {
  SITE_VISIBILITY_LABELS,
  displaySiteUrl,
  formatSiteUpdated,
  siteName,
} from '../lib/site-format';
import {
  siteEditPath,
  sitePath,
  siteVisitPath,
  type PublishedSite,
} from '../services/sites-service';
import { SiteThumbnail } from './SiteThumbnail';

export function SiteVisibilityBadge({ site }: { site: Pick<PublishedSite, 'visibility'> }) {
  return (
    <span
      data-testid="site-visibility"
      className="inline-flex items-center rounded-full border border-[var(--chat-border)] px-2 py-0.5 text-xs font-medium text-[var(--chat-text-secondary)]"
    >
      {SITE_VISIBILITY_LABELS[site.visibility]}
    </span>
  );
}

export function SiteCard({
  site,
  onCopyLink,
  onRename,
  onSharing,
  onUnpublish,
}: {
  site: PublishedSite;
  onCopyLink: (site: PublishedSite) => void;
  onRename: (site: PublishedSite) => void;
  onSharing: (site: PublishedSite) => void;
  onUnpublish: (site: PublishedSite) => void;
}) {
  const name = siteName(site);
  const editPath = siteEditPath(site);

  return (
    <li
      data-testid="site-card"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]"
    >
      <Link
        href={sitePath(site.token)}
        tabIndex={-1}
        aria-hidden="true"
        className="block border-b border-[var(--chat-border-subtle)]"
      >
        <SiteThumbnail site={site} className="aspect-[16/10] w-full" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-medium text-[var(--chat-text-primary)]">
            <Link
              href={sitePath(site.token)}
              className="block truncate rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
            >
              {name}
            </Link>
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-me-2 -mt-1 h-8 w-8 shrink-0 pointer-coarse:h-11 pointer-coarse:w-11"
                aria-label={`More actions for ${name}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem onSelect={() => onRename(site)}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSharing(site)}>Sharing</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onUnpublish(site)}
                className="text-[var(--chat-destructive-text)] focus:text-[var(--chat-destructive-text)]"
              >
                Unpublish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--chat-text-muted)]"
            title={site.shareUrl}
          >
            {displaySiteUrl(site.shareUrl)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label={`Copy link to ${name}`}
            onClick={() => onCopyLink(site)}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--chat-text-muted)]">
          <SiteVisibilityBadge site={site} />
          <span>{formatSiteUpdated(site.updatedAt)}</span>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <a href={siteVisitPath(site.token)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Visit
            </a>
          </Button>
          {editPath ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={editPath}>
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Open in chat
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
