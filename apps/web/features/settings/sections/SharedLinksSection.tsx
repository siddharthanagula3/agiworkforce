'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import {
  listSharedLinks,
  revokeSharedLink,
  type SharedLinkSummary,
  type SharedLinkList,
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
  translateUiPlural,
} from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const SHARE_SUMMARY_FLEX = '1 1 12rem';

const actionButtonStyle = {
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
} as const;

type RevokeIntent = {
  share: SharedLinkSummary;
  inventory: SharedLinkList;
  phase: 'confirming' | 'writing';
};
type ShareLane = {
  session: SessionAuthority;
  active: boolean;
  operation: RequestAuthority | null;
  view: ShareView | null;
};
type ShareView = {
  lane: ShareLane;
  inventory: SharedLinkList | null;
  loading: boolean;
  busy: boolean;
  actionToken: string | null;
  confirmation: RevokeIntent | null;
  error: string | null;
  loadFailed: boolean;
  notice: string | null;
};

export function SharedLinksSection() {
  const capture = useSessionSnapshot();
  const sessionSlot = useRef<SessionAuthority | null>(null);
  if (!sessionSlot.current?.isCurrent()) sessionSlot.current = capture();
  const session = sessionSlot.current;
  const activation = useRef<ShareLane | null>(null);
  const [state, setState] = useState<ShareView | null>(null);
  const current = useCallback(
    (lane: ShareLane) =>
      lane.active &&
      activation.current === lane &&
      sessionSlot.current === lane.session &&
      lane.session.isCurrent(),
    [],
  );
  const publish = useCallback(
    (lane: ShareLane, patch: Partial<ShareView>) => {
      if (!current(lane)) return;
      const next: ShareView = {
        lane,
        inventory: null,
        loading: false,
        busy: false,
        actionToken: null,
        confirmation: null,
        error: null,
        loadFailed: false,
        notice: null,
        ...lane.view,
        ...patch,
      };
      lane.view = next;
      setState((previous) => (current(lane) && lane.view === next ? next : previous));
    },
    [current],
  );
  const load = useCallback(
    async (lane: ShareLane) => {
      if (!current(lane) || lane.operation) return;
      const request = createRequestAuthority(
        lane.session,
        () => current(lane) && lane.operation === request,
      );
      lane.operation = request;
      publish(lane, {
        inventory: null,
        loading: true,
        busy: true,
        confirmation: null,
        error: null,
        notice: null,
        loadFailed: false,
      });
      try {
        const inventory = await listSharedLinks(request);
        request.assertCurrent();
        lane.operation = null;
        publish(lane, { inventory, loading: false, busy: false });
      } catch (caught) {
        if (request.isCurrent()) {
          lane.operation = null;
          publish(lane, {
            loading: false,
            busy: false,
            loadFailed: true,
            error: toUserMessage(caught, 'Failed to load shared links'),
          });
        }
      } finally {
        if (lane.operation === request) lane.operation = null;
        request.retire();
      }
    },
    [current, publish],
  );

  useLayoutEffect(() => {
    if (!session) return;
    const lane: ShareLane = { session, active: true, operation: null, view: null };
    activation.current = lane;
    const retire = () => {
      lane.active = false;
      lane.operation?.retire();
      lane.operation = null;
      lane.view = null;
      if (activation.current === lane) activation.current = null;
    };
    const stop = session.subscribe?.(() => {
      if (!session.isCurrent()) {
        retire();
        setState((previous) => (previous?.lane === lane ? null : previous));
      }
    });
    if (current(lane)) void load(lane);
    else retire();
    return () => {
      stop?.();
      retire();
    };
  }, [session, current, load]);

  const view = state && current(state.lane) && state.lane.view === state ? state : null;
  const { shares, complete } = view?.inventory ?? { shares: [], complete: false };
  const loading = view?.loading ?? true;
  const actionToken = view?.actionToken ?? null;
  const shareToRevoke = view?.confirmation?.share ?? null;
  const error = view?.error ?? null;
  const loadFailed = view?.loadFailed ?? false;
  const notice = view?.notice ?? null;
  const viewCurrent = () => !!view && current(view.lane) && view.lane.view === view;
  const rowCurrent = (share: SharedLinkSummary) =>
    viewCurrent() &&
    !view!.lane.operation &&
    !view!.confirmation &&
    view!.inventory?.shares.includes(share) === true;

  const handleCopy = async (share: SharedLinkSummary) => {
    if (!rowCurrent(share)) return;
    const lane = view!.lane;
    if (!navigator.clipboard?.writeText) {
      publish(lane, {
        notice: null,
        error: 'Clipboard access is unavailable. Open the link and copy it from the address bar.',
      });
      return;
    }
    const request = createRequestAuthority(
      lane.session,
      () => current(lane) && lane.operation === request,
    );
    lane.operation = request;
    publish(lane, { error: null, notice: null, busy: true });
    try {
      request.assertCurrent();
      await navigator.clipboard.writeText(share.shareUrl);
      request.assertCurrent();
      lane.operation = null;
      publish(lane, { busy: false, notice: `Copied the link for “${share.title}”.` });
    } catch {
      if (request.isCurrent()) {
        lane.operation = null;
        publish(lane, {
          busy: false,
          error: 'Could not copy the link. Open it and copy from the address bar.',
        });
      }
    } finally {
      if (lane.operation === request) lane.operation = null;
      request.retire();
    }
  };

  const handleRevoke = async () => {
    if (!viewCurrent() || view!.lane.operation) return;
    const lane = view!.lane;
    const intent = view!.confirmation;
    if (
      !intent ||
      intent.phase !== 'confirming' ||
      intent.inventory !== view!.inventory ||
      !intent.inventory.shares.includes(intent.share)
    )
      return;
    intent.phase = 'writing';
    const { share } = intent;
    let dispatched = false;
    const request = createRequestAuthority(
      lane.session,
      () => current(lane) && lane.operation === request,
      () => {
        dispatched = true;
      },
    );
    lane.operation = request;
    publish(lane, { actionToken: share.token, busy: true, error: null, notice: null });
    try {
      await revokeSharedLink(share.token, request);
      request.assertCurrent();
      lane.operation = null;
      publish(lane, {
        inventory: {
          ...intent.inventory,
          shares: intent.inventory.shares.filter(({ token }) => token !== share.token),
        },
        busy: false,
        actionToken: null,
        confirmation: null,
        notice: `Revoked the link for “${share.title}”.`,
      });
    } catch (caught) {
      if (request.isCurrent()) {
        lane.operation = null;
        publish(lane, {
          busy: false,
          actionToken: null,
          confirmation: null,
          error: dispatched
            ? 'Could not confirm whether the link was revoked. Reload the list to check.'
            : toUserMessage(caught, 'Could not start revoking the link. Please try again.'),
        });
      }
    } finally {
      if (lane.operation === request) lane.operation = null;
      request.retire();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <SettingsSectionLink
          section="privacy"
          style={{
            color: 'var(--text-3)',
            fontSize: 12,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 24,
          }}
        >
          ← Privacy
        </SettingsSectionLink>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: 'var(--space-3) 0 var(--space-1)',
          }}
        >
          Shared links
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
          Links and pages you have shared.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="sharing-conversations" label="How sharing works" />
        </div>
      </div>

      {error ? (
        <div role="alert" style={{ color: 'var(--chat-accent-primary-text)', fontSize: 13 }}>
          {error}{' '}
          <button
            type="button"
            disabled={view?.busy}
            onClick={() => {
              if (viewCurrent()) void load(view!.lane);
            }}
            style={actionButtonStyle}
          >
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
        {!loading && !loadFailed && !complete ? (
          <p
            role="status"
            style={{ margin: 0, padding: 'var(--space-5)', color: 'var(--text-2)', fontSize: 13 }}
          >
            This list may be incomplete. Links not shown may still work.
          </p>
        ) : null}
        {loading ? (
          <p style={{ margin: 0, padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}>
            {session ? 'Loading shared links…' : 'Sign in to manage shared conversation links.'}
          </p>
        ) : loadFailed ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              Shared links could not be loaded
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              This is not the same as having no shared links. Retry above to load them.
            </p>
          </div>
        ) : shares.length === 0 ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              {complete ? 'No shared links' : 'No shared links shown'}
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              {complete
                ? 'Links you create from a conversation will appear here.'
                : 'An empty list does not confirm that all shared links have been revoked.'}
            </p>
          </div>
        ) : (
          shares.map((share, index) => {
            const busy = view?.busy === true || view?.confirmation !== null;
            return (
              <div
                key={share.token}
                style={{
                  padding: 'var(--space-4) var(--space-5)',
                  borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3) var(--space-4)',
                }}
              >
                <div
                  className="max-md:basis-full!"
                  style={{ minWidth: 0, flex: SHARE_SUMMARY_FLEX }}
                >
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
                  <div
                    style={{ marginTop: 'var(--space-1)', color: 'var(--text-3)', fontSize: 12 }}
                  >
                    {translateUiPlural('common', 'counts.messages', share.messageCount, {
                      one: '{{count}} message',
                      other: '{{count}} messages',
                    })}{' '}
                    ·{' '}
                    {share.visibility === 'organization'
                      ? 'Workspace only'
                      : 'Anyone with the link'}{' '}
                    · {share.expired ? 'Expired' : `Expires ${formatDate(share.expiresAt)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (rowCurrent(share))
                        window.open(share.shareUrl, '_blank', 'noopener,noreferrer');
                    }}
                    style={actionButtonStyle}
                  >
                    Open
                  </button>
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
                    onClick={() => {
                      if (rowCurrent(share))
                        publish(view!.lane, {
                          confirmation: { share, inventory: view!.inventory!, phase: 'confirming' },
                          error: null,
                          notice: null,
                        });
                    }}
                    disabled={busy}
                    style={{
                      ...actionButtonStyle,
                      color: 'var(--chat-accent-primary-text)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionToken === share.token ? 'Revoking…' : 'Revoke'}
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
          if (!open && viewCurrent() && !view!.lane.operation)
            publish(view!.lane, { confirmation: null });
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
                void handleRevoke();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionToken ? 'Revoking…' : 'Revoke link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PublishedArtifactsSection />
    </div>
  );
}
