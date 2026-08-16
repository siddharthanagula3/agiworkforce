
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listCloudSharedLinks,
  revokeCloudSharedLink,
  type CloudSharedLink,
} from '../../../api/cloudAccountSettings';
import { openExternalUrl } from '../../../utils/navigation';
import {
  SMALL_BUTTON,
  SectionEmpty,
  SectionError,
  SectionHeading,
  SectionLoading,
  formatSettingsDate,
} from './sectionChrome';

export function CloudSharedLinksSection() {
  const [shares, setShares] = useState<CloudSharedLink[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await listCloudSharedLinks();
      if (generation.current === current) setShares(next);
    } catch (caught) {
      if (generation.current === current) {
        setError(caught instanceof Error ? caught.message : 'Could not load your shared links.');
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const handleRevoke = async (share: CloudSharedLink) => {
    setRevoking(share.token);
    setError(null);
    setNotice(null);
    try {
      await revokeCloudSharedLink(share.token);
      setShares((current) => (current ?? []).filter((entry) => entry.token !== share.token));
      setNotice(`Revoked the link for “${share.title}”.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke this shared link.');
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = async (share: CloudSharedLink) => {
    setError(null);
    setNotice(null);
    if (!navigator.clipboard?.writeText) {
      setError('Clipboard access is unavailable. Open the link and copy it from the address bar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setNotice(`Copied the link for “${share.title}”.`);
    } catch {
      setError('Could not copy the link. Open it and copy it from the address bar.');
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="cloud-shared-links">
      <SectionHeading
        title="Shared links"
        description="Conversations you have published as read-only links. Revoking a link takes it offline immediately; the conversation itself is untouched."
      />

      {loading ? <SectionLoading label="Loading shared links…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {!loading && shares !== null && shares.length === 0 ? (
        <SectionEmpty>
          You have not shared any Cloud conversations yet. Use Share on a conversation to publish a
          read-only link.
        </SectionEmpty>
      ) : null}

      {!loading && shares !== null && shares.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-card/40">
          {shares.map((share, index) => (
            <li
              key={share.token}
              className={`flex items-center justify-between gap-4 p-5 ${
                index > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{share.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {share.messageCount} {share.messageCount === 1 ? 'message' : 'messages'} · Shared{' '}
                  {formatSettingsDate(share.createdAt)} ·{' '}
                  {share.expired ? 'Expired' : `Expires ${formatSettingsDate(share.expiresAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => void openExternalUrl(share.shareUrl)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => void handleCopy(share)}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className={`${SMALL_BUTTON} text-destructive`}
                  disabled={revoking === share.token}
                  aria-busy={revoking === share.token || undefined}
                  onClick={() => void handleRevoke(share)}
                >
                  {revoking === share.token ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
