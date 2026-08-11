'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listSharedLinks,
  revokeSharedLink,
  type SharedLinkSummary,
} from '../services/conversation-data-service';
import { PublishedArtifactsSection } from './PublishedArtifactsSection';
import { SettingsSectionLink } from '../components/SettingsSectionLink';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@agiworkforce/ui';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const actionButtonStyle = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
} as const;

export function SharedLinksSection() {
  const [shares, setShares] = useState<SharedLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [shareToRevoke, setShareToRevoke] = useState<SharedLinkSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setShares(await listSharedLinks(signal));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Failed to load shared links');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleCopy = async (share: SharedLinkSummary) => {
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
      setError('Could not copy the link. Open it and copy from the address bar.');
    }
  };

  const handleRevoke = async (share: SharedLinkSummary) => {
    setActionToken(share.token);
    setError(null);
    setNotice(null);
    try {
      await revokeSharedLink(share.token);
      setShares((current) => current.filter(({ token }) => token !== share.token));
      setNotice(`Revoked the link for “${share.title}”.`);
      setShareToRevoke(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to revoke shared link');
    } finally {
      setActionToken(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SettingsSectionLink
          section="privacy"
          style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}
        >
          ← Privacy
        </SettingsSectionLink>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '10px 0 4px',
          }}
        >
          Shared links
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Review and revoke conversation links and published artifact pages created from Web chat.
        </p>
      </div>

      {error ? (
        <div role="alert" style={{ color: 'var(--chat-accent-primary, #c8892a)', fontSize: 13 }}>
          {error}{' '}
          <button type="button" onClick={() => void load()} style={actionButtonStyle}>
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <div role="status" style={{ color: 'var(--text-2)', fontSize: 13 }}>
          {notice}
        </div>
      ) : null}

      <section
        aria-label="Shared conversation links"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <p style={{ margin: 0, padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Loading shared links…
          </p>
        ) : shares.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              No shared links
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Links you create from a conversation will appear here.
            </p>
          </div>
        ) : (
          shares.map((share, index) => {
            const busy = actionToken === share.token;
            return (
              <div
                key={share.token}
                style={{
                  padding: '16px 20px',
                  borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--text-1)',
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {share.title}
                  </div>
                  <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>
                    {share.messageCount} {share.messageCount === 1 ? 'message' : 'messages'} ·{' '}
                    {share.expired ? 'Expired' : `Expires ${formatDate(share.expiresAt)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a
                    href={share.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...actionButtonStyle, textDecoration: 'none' }}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopy(share)}
                    disabled={busy}
                    style={actionButtonStyle}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareToRevoke(share)}
                    disabled={busy}
                    style={{
                      ...actionButtonStyle,
                      color: 'var(--chat-accent-primary, #c8892a)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {busy ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <AlertDialog
        open={shareToRevoke !== null}
        onOpenChange={(open) => {
          if (!open && actionToken === null) setShareToRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this public link?</AlertDialogTitle>
            <AlertDialogDescription>
              {shareToRevoke
                ? `Anyone using the link for “${shareToRevoke.title}” will immediately lose access. This cannot be undone.`
                : 'Anyone using this link will immediately lose access.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionToken !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!shareToRevoke || actionToken !== null}
              onClick={(event) => {
                event.preventDefault();
                if (shareToRevoke) void handleRevoke(shareToRevoke);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionToken ? 'Revoking…' : 'Revoke link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CAP-015 slice 4: the other thing a user can make public from chat.
          Kept on this screen so "what of mine is public?" has one answer
          instead of two screens that each tell half of it. */}
      <PublishedArtifactsSection />
    </div>
  );
}
