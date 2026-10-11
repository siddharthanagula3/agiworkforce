'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useConfirmAction } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { siteName } from '../lib/site-format';
import {
  unpublishArtifact,
  updatePublishedSite,
  type PublishedSite,
  type SiteVisibility,
} from '../services/sites-service';
import { usePublishedSitesStore } from '../stores/published-sites-store';

export function unpublishConsequence(site: Pick<PublishedSite, 'title'>): string {
  return `The link to “${siteName(site)}” stops working for everyone who has it, and any data the site saved for its visitors is deleted. This cannot be undone.`;
}

export function useSiteActions({
  onUpdated,
  onUnpublished,
}: {
  onUpdated: (site: PublishedSite) => void;
  onUnpublished: (site: PublishedSite) => void;
}) {
  const { confirm, dialog } = useConfirmAction();
  const recordPublishedSite = usePublishedSitesStore((state) => state.record);
  const forgetPublishedSite = usePublishedSitesStore((state) => state.forget);

  const copyLink = useCallback(async (site: PublishedSite) => {
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard access is unavailable. Open the site and copy the address instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(site.shareUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link. Open the site and copy the address instead.');
    }
  }, []);

  const rename = useCallback(
    async (site: PublishedSite, title: string) => {
      const updated = await updatePublishedSite(site.token, { title });
      onUpdated({ ...site, title: updated.title, updatedAt: updated.updatedAt });
    },
    [onUpdated],
  );

  const setVisibility = useCallback(
    async (site: PublishedSite, visibility: SiteVisibility) => {
      const updated = await updatePublishedSite(site.token, { visibility });
      recordPublishedSite(site.artifactId, {
        shareUrl: updated.shareUrl,
        visibility: updated.visibility,
      });
      onUpdated({
        ...site,
        visibility: updated.visibility,
        shareUrl: updated.shareUrl,
        updatedAt: updated.updatedAt,
      });
    },
    [onUpdated, recordPublishedSite],
  );

  const requestUnpublish = useCallback(
    (site: PublishedSite) =>
      confirm({
        title: `Unpublish “${siteName(site)}”?`,
        description: unpublishConsequence(site),
        confirmLabel: 'Unpublish',
        destructive: true,
        onConfirm: async () => {
          try {
            await unpublishArtifact(site.token);
          } catch (error) {
            toast.error(toUserMessage(error, 'Failed to unpublish this site'));
            return;
          }
          forgetPublishedSite(site.artifactId);
          toast.success(`Unpublished “${siteName(site)}”. The link no longer works.`);
          onUnpublished(site);
        },
      }),
    [confirm, forgetPublishedSite, onUnpublished],
  );

  return { dialog, copyLink, rename, setVisibility, requestUnpublish };
}
