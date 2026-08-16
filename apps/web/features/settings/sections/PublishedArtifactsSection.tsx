'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listPublishedArtifacts,
  unpublishArtifact,
  type PublishedArtifactSummary,
} from '../services/conversation-data-service';
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

/**
 * Published artifacts management (CAP-015 slice 4).
 *
 * Mirrors {@link SharedLinksSection} deliberately — same list/copy/revoke
 * shape, same styling tokens — because it solves the same problem for the other
 * publish surface. It is rendered inside the Shared links settings screen so a
 * user has ONE place to answer "what of mine is public right now?".
 *
 * This screen is load-bearing, not decorative: published artifacts have no
 * expiry (migration 0095 ships no TTL, since none has been approved), so
 * "Unpublish" here is the only way a page ever comes down.
 */

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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatSize(characters: number): string {
  if (characters < 1000) return `${characters} characters`;
  return `${Math.round(characters / 1000).toLocaleString()}k characters`;
}

export function PublishedArtifactsSection() {
  const [artifacts, setArtifacts] = useState<PublishedArtifactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [artifactToUnpublish, setArtifactToUnpublish] = useState<PublishedArtifactSummary | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setArtifacts(await listPublishedArtifacts(signal));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Failed to load published artifacts');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleCopy = async (artifact: PublishedArtifactSummary) => {
    setError(null);
    setNotice(null);
    if (!navigator.clipboard?.writeText) {
      setError('Clipboard access is unavailable. Open the link and copy it from the address bar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(artifact.shareUrl);
      setNotice(`Copied the link for “${artifact.title || artifact.artifactId}”.`);
    } catch {
      setError('Could not copy the link. Open it and copy from the address bar.');
    }
  };

  const handleUnpublish = async (artifact: PublishedArtifactSummary) => {
    const label = artifact.title || artifact.artifactId;
    setActionToken(artifact.token);
    setError(null);
    setNotice(null);
    try {
      await unpublishArtifact(artifact.token);
      setArtifacts((current) => current.filter(({ token }) => token !== artifact.token));
      setNotice(`Unpublished “${label}”. The link no longer works.`);
      setArtifactToUnpublish(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to unpublish artifact');
    } finally {
      setActionToken(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Published artifacts
        </h2>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Artifacts you published to a public page. Anyone with the link can open one, and there is
          no automatic expiry — unpublishing is the only way to take a page down.
        </p>
      </div>

      {notice ? (
        <div role="status" style={{ color: 'var(--text-2)', fontSize: 13 }}>
          {notice}
        </div>
      ) : null}

      <section
        aria-label="Published artifacts"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <p style={{ margin: 0, padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Loading published artifacts…
          </p>
        ) : error ? (
          <div role="alert" style={{ padding: 20, color: 'var(--text-2)', fontSize: 13 }}>
            {error}{' '}
            <button type="button" onClick={() => void load()} style={actionButtonStyle}>
              Retry
            </button>
          </div>
        ) : artifacts.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              No published artifacts
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Publish an artifact from the artifacts panel and it will appear here.
            </p>
          </div>
        ) : (
          artifacts.map((artifact, index) => {
            const busy = actionToken === artifact.token;
            return (
              <div
                key={artifact.token}
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
                    {artifact.title || artifact.artifactId}
                  </div>
                  <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>
                    {artifact.kind} · {formatSize(artifact.contentChars)} · Published{' '}
                    {formatDate(artifact.createdAt)}
                    {/* State the serving mode, because it is the security
                        property a publisher should be able to verify. */}
                    {artifact.sandboxed ? ' · runs in a sandboxed frame' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a
                    href={artifact.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...actionButtonStyle, textDecoration: 'none' }}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopy(artifact)}
                    disabled={busy}
                    style={actionButtonStyle}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => setArtifactToUnpublish(artifact)}
                    disabled={busy}
                    style={{
                      ...actionButtonStyle,
                      color: 'var(--chat-accent-primary, #c8892a)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {busy ? 'Unpublishing…' : 'Unpublish'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <AlertDialog
        open={artifactToUnpublish !== null}
        onOpenChange={(open) => {
          if (!open && actionToken === null) setArtifactToUnpublish(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this artifact?</AlertDialogTitle>
            <AlertDialogDescription>
              {artifactToUnpublish
                ? `Anyone using the link for “${artifactToUnpublish.title || artifactToUnpublish.artifactId}” will immediately lose access. This cannot be undone.`
                : 'Anyone using this link will immediately lose access.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionToken !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!artifactToUnpublish || actionToken !== null}
              onClick={(event) => {
                event.preventDefault();
                if (artifactToUnpublish) void handleUnpublish(artifactToUnpublish);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionToken ? 'Unpublishing…' : 'Unpublish artifact'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
