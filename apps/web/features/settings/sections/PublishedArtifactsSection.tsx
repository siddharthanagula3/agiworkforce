'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ManagedCloudPublishedArtifactVersion } from '@agiworkforce/cloud-contracts';
import { useConfirmAction } from '@agiworkforce/ui';
import {
  listPublishedArtifactVersions,
  listPublishedSitesPage,
  republishArtifactVersion,
  unpublishArtifact,
  type PublishedSite as PublishedArtifactSummary,
} from '@features/sites/services/sites-service';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { toUserMessage } from '@/lib/user-error-message';

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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const AUDIENCE_LABELS: Record<PublishedArtifactSummary['visibility'], string> = {
  public: 'Anyone with the link',
  organization: 'Everyone in this workspace',
  invited: 'Only people you invite',
};

function formatSize(characters: number): string {
  if (characters < 1000) return `${characters} characters`;
  return `${Math.round(characters / 1000).toLocaleString()}k characters`;
}

type ArtifactInventory = PublishedArtifactSummary[];
type ArtifactHistory = {
  artifact: PublishedArtifactSummary;
  inventory: ArtifactInventory;
  versions: ManagedCloudPublishedArtifactVersion[] | null;
};
type UnpublishIntent = {
  lane: ArtifactLane;
  artifact: PublishedArtifactSummary;
  inventory: ArtifactInventory;
  phase: 'confirming' | 'writing' | 'consumed';
};
type ArtifactLane = {
  session: SessionAuthority;
  active: boolean;
  operation: RequestAuthority | null;
  view: ArtifactView | null;
};
type ArtifactView = {
  lane: ArtifactLane;
  inventory: ArtifactInventory | null;
  cursor: string | null;
  nextCursor: string | null;
  failedCursor: string | null;
  history: ArtifactHistory | null;
  confirmation: UnpublishIntent | null;
  loading: boolean;
  busy: boolean;
  actionToken: string | null;
  error: string | null;
  notice: string | null;
};

function UnpublishConfirmation({
  intent,
  run,
  cancel,
}: {
  intent: UnpublishIntent;
  run: (intent: UnpublishIntent) => Promise<void>;
  cancel: (intent: UnpublishIntent) => void;
}) {
  const { confirm, dialog } = useConfirmAction();
  useLayoutEffect(() => {
    confirm({
      title: 'Unpublish this artifact?',
      description: `Anyone using the link for “${intent.artifact.title || intent.artifact.artifactId}” will immediately lose access, and any data the site saved for its visitors is deleted. This cannot be undone.`,
      confirmLabel: 'Unpublish artifact',
      destructive: true,
      onConfirm: () => run(intent),
      onCancel: () => cancel(intent),
    });
  }, [intent, confirm, run, cancel]);
  return dialog;
}

export function PublishedArtifactsSection() {
  const capture = useSessionSnapshot();
  const sessionSlot = useRef<SessionAuthority | null>(null);
  if (!sessionSlot.current?.isCurrent()) sessionSlot.current = capture();
  const session = sessionSlot.current;
  const activation = useRef<ArtifactLane | null>(null);
  const [state, setState] = useState<ArtifactView | null>(null);

  const current = useCallback(
    (lane: ArtifactLane) =>
      lane.active &&
      activation.current === lane &&
      sessionSlot.current === lane.session &&
      lane.session.isCurrent(),
    [],
  );
  const publish = useCallback(
    (lane: ArtifactLane, patch: Partial<ArtifactView>) => {
      if (!current(lane)) return;
      const next: ArtifactView = {
        lane,
        inventory: null,
        cursor: null,
        nextCursor: null,
        failedCursor: null,
        history: null,
        confirmation: null,
        loading: false,
        busy: false,
        actionToken: null,
        error: null,
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
    async (lane: ArtifactLane, notice: string | null = null, cursor: string | null = null) => {
      if (!current(lane) || lane.operation || lane.view?.confirmation) return;
      const request = createRequestAuthority(
        lane.session,
        () => current(lane) && lane.operation === request,
      );
      lane.operation = request;
      publish(lane, {
        history: null,
        confirmation: null,
        loading: true,
        failedCursor: cursor,
        busy: true,
        actionToken: null,
        error: null,
        notice,
        ...(notice ? { inventory: null } : {}),
      });
      try {
        const { sites, nextCursor } = await listPublishedSitesPage(cursor, undefined, request);
        request.assertCurrent();
        lane.operation = null;
        publish(lane, {
          inventory: sites,
          cursor,
          nextCursor,
          failedCursor: null,
          loading: false,
          busy: false,
        });
      } catch (caught) {
        if (request.isCurrent()) {
          lane.operation = null;
          publish(lane, {
            loading: false,
            busy: false,
            error: toUserMessage(caught, 'Failed to load published artifacts'),
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
    const lane: ArtifactLane = { session, active: true, operation: null, view: null };
    activation.current = lane;
    const retire = () => {
      lane.active = false;
      lane.operation?.retire();
      lane.operation = null;
      if (lane.view?.confirmation) lane.view.confirmation.phase = 'consumed';
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

  const cancel = useCallback(
    (intent: UnpublishIntent) => {
      const { lane } = intent;
      if (
        !current(lane) ||
        lane.operation ||
        lane.view?.confirmation !== intent ||
        intent.phase !== 'confirming'
      )
        return;
      intent.phase = 'consumed';
      publish(lane, { confirmation: null });
    },
    [current, publish],
  );

  const unpublish = useCallback(
    async (intent: UnpublishIntent) => {
      const { lane, artifact, inventory } = intent;
      if (
        !current(lane) ||
        lane.operation ||
        lane.view?.confirmation !== intent ||
        lane.view.inventory !== inventory ||
        !inventory.includes(artifact) ||
        intent.phase !== 'confirming'
      )
        return;
      intent.phase = 'writing';
      let dispatched = false;
      const request = createRequestAuthority(
        lane.session,
        () => current(lane) && lane.operation === request,
        () => {
          dispatched = true;
        },
      );
      lane.operation = request;
      publish(lane, {
        busy: true,
        actionToken: artifact.token,
        error: null,
        notice: null,
        failedCursor: null,
      });
      try {
        await unpublishArtifact(artifact.token, request);
        request.assertCurrent();
        lane.operation = null;
        intent.phase = 'consumed';
        publish(lane, {
          inventory: inventory.filter((entry) => entry !== artifact),
          history: null,
          confirmation: null,
          busy: false,
          actionToken: null,
          notice: `Unpublished “${artifact.title || artifact.artifactId}”. The link no longer works.`,
        });
      } catch (caught) {
        if (request.isCurrent()) {
          lane.operation = null;
          intent.phase = 'consumed';
          publish(lane, {
            confirmation: null,
            busy: false,
            actionToken: null,
            ...(dispatched ? { inventory: null, history: null } : {}),
            error: dispatched
              ? 'Could not confirm whether the artifact was unpublished. Reload the list to check.'
              : toUserMessage(
                  caught,
                  'Could not start unpublishing the artifact. Please try again.',
                ),
          });
        }
      } finally {
        if (lane.operation === request) lane.operation = null;
        request.retire();
      }
    },
    [current, publish],
  );

  const view = state && current(state.lane) && state.lane.view === state ? state : null;
  const viewCurrent = () => !!view && current(view.lane) && view.lane.view === view;
  const rowCurrent = (artifact: PublishedArtifactSummary) =>
    viewCurrent() &&
    !view!.lane.operation &&
    !view!.confirmation &&
    view!.inventory?.includes(artifact) === true;

  const copy = async (artifact: PublishedArtifactSummary) => {
    if (!rowCurrent(artifact)) return;
    const lane = view!.lane;
    if (!navigator.clipboard?.writeText) {
      publish(lane, {
        notice: null,
        failedCursor: null,
        error: 'Clipboard access is unavailable. Open the link and copy it from the address bar.',
      });
      return;
    }
    const request = createRequestAuthority(
      lane.session,
      () => current(lane) && lane.operation === request,
    );
    lane.operation = request;
    publish(lane, { busy: true, error: null, notice: null, failedCursor: null });
    try {
      request.assertCurrent();
      await navigator.clipboard.writeText(artifact.shareUrl);
      request.assertCurrent();
      lane.operation = null;
      publish(lane, {
        busy: false,
        notice: `Copied the link for “${artifact.title || artifact.artifactId}”.`,
      });
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

  const toggleHistory = async (artifact: PublishedArtifactSummary) => {
    if (!rowCurrent(artifact)) return;
    const lane = view!.lane;
    if (view!.history?.artifact === artifact) {
      publish(lane, { history: null });
      return;
    }
    const history: ArtifactHistory = { artifact, inventory: view!.inventory!, versions: null };
    const request = createRequestAuthority(
      lane.session,
      () => current(lane) && lane.operation === request && lane.view?.history === history,
    );
    lane.operation = request;
    publish(lane, { history, busy: true, error: null, notice: null, failedCursor: null });
    try {
      const versions = await listPublishedArtifactVersions(artifact.token, undefined, request);
      request.assertCurrent();
      lane.operation = null;
      publish(lane, { history: { ...history, versions }, busy: false });
    } catch (caught) {
      if (request.isCurrent()) {
        lane.operation = null;
        publish(lane, {
          history: null,
          busy: false,
          error: toUserMessage(caught, 'Failed to load the publish history'),
        });
      }
    } finally {
      if (lane.operation === request) lane.operation = null;
      request.retire();
    }
  };

  const putLive = async (history: ArtifactHistory, entry: ManagedCloudPublishedArtifactVersion) => {
    if (
      !rowCurrent(history.artifact) ||
      view!.history !== history ||
      view!.inventory !== history.inventory ||
      !history.versions?.includes(entry) ||
      entry.live
    )
      return;
    const lane = view!.lane;
    let dispatched = false;
    const request = createRequestAuthority(
      lane.session,
      () => current(lane) && lane.operation === request && lane.view?.history === history,
      () => {
        dispatched = true;
      },
    );
    lane.operation = request;
    publish(lane, {
      busy: true,
      actionToken: history.artifact.token,
      error: null,
      notice: null,
      failedCursor: null,
    });
    try {
      await republishArtifactVersion(history.artifact, entry.version, request);
      request.assertCurrent();
      lane.operation = null;
      request.retire();
      await load(
        lane,
        `Version ${entry.version} of “${history.artifact.title || history.artifact.artifactId}” is live again.`,
      );
    } catch (caught) {
      if (request.isCurrent()) {
        lane.operation = null;
        publish(lane, {
          busy: false,
          actionToken: null,
          ...(dispatched ? { inventory: null, history: null } : {}),
          error: dispatched
            ? 'Could not confirm whether that version was put live. Reload the list and history to check.'
            : toUserMessage(caught, 'Could not start putting that version live. Please try again.'),
        });
      }
    } finally {
      if (lane.operation === request) lane.operation = null;
      request.retire();
    }
  };

  const busy = view?.busy === true || !!view?.confirmation;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <h2
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Published artifacts
        </h2>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
          Public pages open for anyone with the link, workspace pages for members. They stay up
          until unpublished.
        </p>
      </div>
      <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
        One page at a time, newest publications first.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          disabled={!view || busy}
          style={actionButtonStyle}
          onClick={() => {
            if (viewCurrent()) void load(view!.lane);
          }}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={!view || busy || view.cursor === null}
          style={actionButtonStyle}
          onClick={() => {
            if (viewCurrent()) void load(view!.lane);
          }}
        >
          Back to newest
        </button>
        <button
          type="button"
          disabled={!view || busy || !view.inventory || view.nextCursor === null}
          style={actionButtonStyle}
          onClick={() => {
            if (viewCurrent() && view!.inventory && view!.nextCursor !== null) {
              void load(view!.lane, null, view!.nextCursor);
            }
          }}
        >
          Older
        </button>
      </div>
      {view?.loading && view.inventory ? (
        <p role="status" style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
          Loading published artifacts… The previously loaded page may be out of date.
        </p>
      ) : null}
      {view?.error ? (
        <div role="alert" style={{ color: 'var(--chat-accent-primary-text)', fontSize: 13 }}>
          {view.error}{' '}
          {view.inventory
            ? 'The previously loaded page is still shown and may be out of date. '
            : null}
          <button
            type="button"
            disabled={busy}
            style={actionButtonStyle}
            onClick={() => {
              if (viewCurrent()) void load(view!.lane, null, view!.failedCursor);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {view?.notice ? (
        <div role="status" style={{ color: 'var(--text-2)', fontSize: 13 }}>
          {view.notice}
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
        {!view || (view.loading && !view.inventory) ? (
          <p style={{ margin: 0, padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}>
            {session ? 'Loading published artifacts…' : 'Sign in to manage published artifacts.'}
          </p>
        ) : !view.inventory ? (
          <p style={{ margin: 0, padding: 'var(--space-5)', color: 'var(--text-2)', fontSize: 13 }}>
            Published artifacts are not confirmed. Retry above to reload the list.
          </p>
        ) : view.inventory.length === 0 ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              {view.cursor === null && view.nextCursor === null
                ? 'No published artifacts'
                : 'No artifacts on this page'}
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Use Older or Back to newest to browse pages, or publish an artifact from chat.
            </p>
          </div>
        ) : (
          view.inventory.map((artifact, index) => {
            const history = view.history?.artifact === artifact ? view.history : null;
            return (
              <div
                key={artifact.token}
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)' }}
              >
                <div
                  style={{
                    padding: 'var(--space-4) var(--space-5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
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
                    <div
                      style={{ marginTop: 'var(--space-1)', color: 'var(--text-3)', fontSize: 12 }}
                    >
                      {AUDIENCE_LABELS[artifact.visibility]} · {artifact.kind} ·{' '}
                      {formatSize(artifact.contentChars)} · Published{' '}
                      {formatDate(artifact.createdAt)}
                      {artifact.sandboxed ? ' · runs in a sandboxed frame' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                    <button
                      type="button"
                      disabled={busy}
                      style={actionButtonStyle}
                      onClick={() => {
                        if (rowCurrent(artifact))
                          window.open(artifact.shareUrl, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={actionButtonStyle}
                      onClick={() => void copy(artifact)}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      aria-expanded={!!history}
                      disabled={busy}
                      style={actionButtonStyle}
                      onClick={() => void toggleHistory(artifact)}
                    >
                      History
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={{
                        ...actionButtonStyle,
                        color: 'var(--chat-accent-primary-text)',
                        cursor: busy ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => {
                        if (!rowCurrent(artifact)) return;
                        const lane = view.lane;
                        publish(lane, {
                          confirmation: {
                            lane,
                            artifact,
                            inventory: view.inventory!,
                            phase: 'confirming',
                          },
                          error: null,
                          notice: null,
                          failedCursor: null,
                        });
                      }}
                    >
                      {view.actionToken === artifact.token && view.confirmation
                        ? 'Unpublishing…'
                        : 'Unpublish'}
                    </button>
                  </div>
                </div>
                {history ? (
                  <div
                    aria-label={`Publish history for ${artifact.title || artifact.artifactId}`}
                    style={{
                      padding: '0 var(--space-5) var(--space-4)',
                      fontSize: 12,
                      color: 'var(--text-2)',
                    }}
                  >
                    {history.versions === null ? (
                      <p style={{ margin: 0 }}>Loading the publish history…</p>
                    ) : (
                      <ul
                        style={{
                          listStyle: 'none',
                          margin: 0,
                          padding: 0,
                          display: 'grid',
                          gap: 'var(--space-2)',
                        }}
                      >
                        {history.versions.map((entry) => (
                          <li
                            key={entry.version}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 'var(--space-3)',
                            }}
                          >
                            <span style={{ minWidth: 0 }}>
                              Version {entry.version} · {formatDate(entry.createdAt)}
                              {entry.title && entry.title !== artifact.title
                                ? ` · ${entry.title}`
                                : ''}
                            </span>
                            {entry.live ? (
                              <span style={{ color: 'var(--text-3)' }}>Live now</span>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                style={actionButtonStyle}
                                onClick={() => void putLive(history, entry)}
                              >
                                {view.actionToken === artifact.token ? 'Putting live…' : 'Put live'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
      {view?.confirmation ? (
        <UnpublishConfirmation intent={view.confirmation} run={unpublish} cancel={cancel} />
      ) : null}
    </div>
  );
}
