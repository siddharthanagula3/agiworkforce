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
import {
  isPublicationLeaseCurrent,
  usePublishedSitesStore,
  type PublicationLease,
} from '../stores/published-sites-store';

export type SiteUpdate = Pick<PublishedSite, 'token' | 'artifactId'> & {
  changes:
    | Pick<PublishedSite, 'title' | 'updatedAt'>
    | Pick<PublishedSite, 'visibility' | 'shareUrl' | 'updatedAt'>;
};

export function mergeSiteUpdate(current: PublishedSite, update: SiteUpdate): PublishedSite {
  if (current.token !== update.token || current.artifactId !== update.artifactId) return current;
  const currentTime = Date.parse(current.updatedAt);
  const updatedTime = Date.parse(update.changes.updatedAt);
  const updatedAt =
    Number.isFinite(currentTime) && (!Number.isFinite(updatedTime) || currentTime > updatedTime)
      ? current.updatedAt
      : update.changes.updatedAt;
  return { ...current, ...update.changes, updatedAt };
}

export function unpublishConsequence(site: Pick<PublishedSite, 'title'>): string {
  return `The link to “${siteName(site)}” stops working for everyone who has it, and any data the site saved for its visitors is deleted. This cannot be undone.`;
}

export function useSiteActions({
  onUpdated,
  onUnpublished,
  lease,
}: {
  lease: PublicationLease | null;
  onUpdated: (update: SiteUpdate) => void;
  onUnpublished: (site: PublishedSite) => void;
}) {
  const { confirm, dialog } = useConfirmAction();
  const recordPublishedSite = usePublishedSitesStore((state) => state.record);
  const forgetPublishedSite = usePublishedSitesStore((state) => state.forget);

  const copyLink = useCallback(async (site: PublishedSite) => {
    if (!isPublicationLeaseCurrent(lease)) return;
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard access is unavailable. Open the site and copy the address instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(site.shareUrl);
      if (isPublicationLeaseCurrent(lease)) toast.success('Link copied');
    } catch {
      if (!isPublicationLeaseCurrent(lease)) return;
      toast.error('Could not copy the link. Open the site and copy the address instead.');
    }
  }, [lease]);

  const rename = useCallback(
    async (site: PublishedSite, title: string) => {
      if (!isPublicationLeaseCurrent(lease)) {
        throw new Error('This publication action is no longer available.');
      }
      const { token, artifactId } = site;
      const updated = await updatePublishedSite(token, { title });
      if (!isPublicationLeaseCurrent(lease)) {
        throw new Error('This publication action is no longer available.');
      }
      onUpdated({
        token,
        artifactId,
        changes: { title: updated.title, updatedAt: updated.updatedAt },
      });
    },
    [onUpdated, lease],
  );

  const setVisibility = useCallback(
    async (site: PublishedSite, visibility: SiteVisibility) => {
      if (!isPublicationLeaseCurrent(lease)) {
        throw new Error('This publication action is no longer available.');
      }
      const { token, artifactId } = site;
      const updated = await updatePublishedSite(token, { visibility });
      if (!recordPublishedSite(artifactId, {
        shareUrl: updated.shareUrl,
        visibility: updated.visibility,
      }, lease)) {
        throw new Error('This publication action is no longer available.');
      }
      if (!isPublicationLeaseCurrent(lease)) {
        throw new Error('This publication action is no longer available.');
      }
      onUpdated({
        token,
        artifactId,
        changes: {
          visibility: updated.visibility,
          shareUrl: updated.shareUrl,
          updatedAt: updated.updatedAt,
        },
      });
    },
    [onUpdated, recordPublishedSite, lease],
  );

  const requestUnpublish = useCallback(
    (site: PublishedSite) => {
      if (!isPublicationLeaseCurrent(lease)) return;
      return confirm({
        title: `Unpublish “${siteName(site)}”?`,
        description: unpublishConsequence(site),
        confirmLabel: 'Unpublish',
        destructive: true,
        onConfirm: async () => {
          if (!isPublicationLeaseCurrent(lease)) return;
          try {
            await unpublishArtifact(site.token);
          } catch (error) {
            if (!isPublicationLeaseCurrent(lease)) return;
            toast.error(toUserMessage(error, 'Failed to unpublish this site'));
            return;
          }
          if (!forgetPublishedSite(site.artifactId, lease)) return;
          toast.success(`Unpublished “${siteName(site)}”. The link no longer works.`);
          onUnpublished(site);
        },
      });
    },
    [confirm, forgetPublishedSite, onUnpublished, lease],
  );

  return { dialog, copyLink, rename, setVisibility, requestUnpublish };
}
