'use client';

import { useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  Folder,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  TerminalSquare,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import type {
  DeveloperMcpServerAwaitingApproval,
  LocalDeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import { formatRelativeTime } from '@shared/utils/format';
import {
  LOCAL_CODE_COPY,
  LOCAL_SESSION_MARKER_LABELS,
  localMcpServerKey,
  localModelLabel,
  localSessionMarker,
  localSessionOriginLabel,
  localSessionStatusLabel,
  newSessionLabel,
  type LocalSessionMarker,
} from '../local-code';
import styles from '../CloudCodePage.module.css';

const RAIL_GLYPH_SIZE = 16;
const GROUP_GLYPH_SIZE = 13;

export interface LocalSessionsSectionProps {
  groups: DeveloperSessionGroup[];
  loading: boolean;
  adding: boolean;
  error: string | null;
  unavailable: string | null;
  selectedId: string | null;
  activity: Record<string, LocalSessionMarker | null>;
  onSelect: (session: LocalDeveloperSession) => void;
  onNewSession: (rootId: string) => void;
  onAddFolder: () => void;
  onAddRepository: () => void;
  /** The folder whose permission prompt is up, by root id. */
  allowing: string | null;
  /** Why a folder still lists no sessions after the user was asked, by root id. */
  allowRefusals: Record<string, string>;
  onAllowSessions: (rootId: string) => void;
  /** The server whose review dialog is up, by `localMcpServerKey`. */
  reviewingMcp: string | null;
  /** Why a server is still waiting after a review, by `localMcpServerKey`. */
  mcpRefusals: Record<string, string>;
  onReviewMcpServer: (rootId: string, server: DeveloperMcpServerAwaitingApproval) => void;
  showArchived?: boolean;
  onToggleArchived?: () => void;
  sessionActions?: { rename: boolean; unarchive: boolean; pin: boolean };
  actionError?: string | null;
  onRename?: (session: LocalDeveloperSession, title: string) => Promise<boolean>;
  onSetArchived?: (session: LocalDeveloperSession, archived: boolean) => void;
  onSetPinned?: (session: LocalDeveloperSession, pinned: boolean) => void;
}

const MENU_GLYPH_SIZE = 14;
const NO_ACTIONS = { rename: false, unarchive: false, pin: false };

function pinnedFirst(sessions: LocalDeveloperSession[]): LocalDeveloperSession[] {
  return [...sessions].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true));
}

function SessionMenu({
  session,
  actions,
  onRename,
  onSetArchived,
  onSetPinned,
}: {
  session: LocalDeveloperSession;
  actions: { rename: boolean; unarchive: boolean; pin: boolean };
  onRename?: () => void;
  onSetArchived?: (session: LocalDeveloperSession, archived: boolean) => void;
  onSetPinned?: (session: LocalDeveloperSession, pinned: boolean) => void;
}) {
  const archived = session.archivedAt !== undefined;
  const canArchive = onSetArchived !== undefined && (!archived || actions.unarchive);
  const canPin = onSetPinned !== undefined && actions.pin && !archived;
  const canRename = onRename !== undefined && actions.rename;
  if (!canArchive && !canPin && !canRename) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${styles['headerButton']} ${styles['railRowMenu']}`}
          aria-label={LOCAL_CODE_COPY.sessionActions(session.title)}
        >
          <MoreHorizontal size={MENU_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canPin && (
          <DropdownMenuItem onSelect={() => onSetPinned?.(session, session.pinned !== true)}>
            {session.pinned ? (
              <PinOff size={MENU_GLYPH_SIZE} aria-hidden="true" />
            ) : (
              <Pin size={MENU_GLYPH_SIZE} aria-hidden="true" />
            )}
            {session.pinned ? LOCAL_CODE_COPY.unpinSession : LOCAL_CODE_COPY.pinSession}
          </DropdownMenuItem>
        )}
        {canRename && (
          <DropdownMenuItem onSelect={onRename}>
            <Pencil size={MENU_GLYPH_SIZE} aria-hidden="true" />
            {LOCAL_CODE_COPY.renameSession}
          </DropdownMenuItem>
        )}
        {canArchive && (
          <DropdownMenuItem onSelect={() => onSetArchived?.(session, !archived)}>
            {archived ? (
              <ArchiveRestore size={MENU_GLYPH_SIZE} aria-hidden="true" />
            ) : (
              <Archive size={MENU_GLYPH_SIZE} aria-hidden="true" />
            )}
            {archived ? LOCAL_CODE_COPY.restoreSession : LOCAL_CODE_COPY.archiveSession}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameField({
  session,
  onSave,
  onCancel,
}: {
  session: LocalDeveloperSession;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(session.title);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (title === '' || title === session.title) onCancel();
    else onSave(title);
  };
  return (
    <form className={`${styles['railRow']} ${styles['railLocalRow']}`} onSubmit={submit}>
      <input
        aria-label={LOCAL_CODE_COPY.sessionName}
        className={styles['textInput']}
        value={draft}
        autoFocus
        maxLength={200}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={submit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </form>
  );
}

export function LocalSessionsSection({
  groups,
  loading,
  adding,
  error,
  unavailable,
  selectedId,
  activity,
  onSelect,
  onNewSession,
  onAddFolder,
  onAddRepository,
  allowing,
  allowRefusals,
  onAllowSessions,
  reviewingMcp,
  mcpRefusals,
  onReviewMcpServer,
  showArchived = false,
  onToggleArchived,
  sessionActions = NO_ACTIONS,
  actionError = null,
  onRename,
  onSetArchived,
  onSetPinned,
}: LocalSessionsSectionProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const empty = groups.length === 0 ? LOCAL_CODE_COPY.emptyNoFolders : LOCAL_CODE_COPY.empty;
  const nothingToShow =
    !loading && unavailable === null && groups.every((group) => group.sessions.length === 0);

  return (
    <section aria-label={LOCAL_CODE_COPY.heading} data-testid="local-code-section">
      <div className={styles['railSectionHeader']}>
        <span className={styles['railSectionLabel']}>{LOCAL_CODE_COPY.heading}</span>
        {onToggleArchived && sessionActions.unarchive && (
          <button
            type="button"
            className={styles['railSectionAction']}
            aria-pressed={showArchived}
            onClick={onToggleArchived}
          >
            {showArchived ? LOCAL_CODE_COPY.hideArchived : LOCAL_CODE_COPY.showArchived}
          </button>
        )}
      </div>

      {actionError !== null && (
        <p className={styles['railEmpty']} role="alert">
          {actionError}
        </p>
      )}

      {loading && (
        <div className={styles['railEmpty']}>
          <Spinner size="sm" aria-label={LOCAL_CODE_COPY.loading} />
        </div>
      )}

      {error !== null && (
        <p className={styles['railEmpty']} role="alert">
          {error}
        </p>
      )}

      {unavailable !== null && <p className={styles['railEmpty']}>{unavailable}</p>}

      {unavailable === null &&
        groups.map((group) => (
          <div key={group.rootId}>
            <div className={styles['railGroup']}>
              {group.branch ? (
                <GitBranch size={GROUP_GLYPH_SIZE} aria-hidden="true" />
              ) : (
                <Folder size={GROUP_GLYPH_SIZE} aria-hidden="true" />
              )}
              <span className={styles['railGroupName']}>{group.name}</span>
              {group.branch && <span className={styles['railGroupBranch']}>{group.branch}</span>}
            </div>

            {group.gitUnavailableReason && (
              <p className={styles['railEmpty']}>
                {LOCAL_CODE_COPY.gitOff(group.gitUnavailableReason)}
              </p>
            )}
            {group.worktreesUnavailable && (
              <p className={styles['railEmpty']} role="alert">
                {group.worktreesUnavailable}
              </p>
            )}

            {group.unavailable && (
              <p className={styles['railEmpty']}>{group.unavailable.message}</p>
            )}

            {group.sessionsWithheld && (
              <>
                <p className={styles['railEmpty']}>{LOCAL_CODE_COPY.sessionsWithheld}</p>
                {allowRefusals[group.rootId] !== undefined && (
                  <p className={styles['railEmpty']} role="alert">
                    {allowRefusals[group.rootId]}
                  </p>
                )}
                <button
                  type="button"
                  className={`${styles['railRow']} ${styles['railSubRow']}`}
                  disabled={allowing !== null}
                  onClick={() => onAllowSessions(group.rootId)}
                >
                  <span className={styles['railRowLabel']}>
                    {allowing === group.rootId
                      ? LOCAL_CODE_COPY.allowingSessions
                      : LOCAL_CODE_COPY.allowSessions}
                  </span>
                </button>
              </>
            )}

            {group.mcpAwaitingApproval?.map((server) => {
              const key = localMcpServerKey(group.rootId, server);
              return (
                <div key={key}>
                  <p className={styles['railEmpty']}>
                    {LOCAL_CODE_COPY.mcpAwaitingApproval(server.name)}
                  </p>
                  {mcpRefusals[key] !== undefined && (
                    <p className={styles['railEmpty']} role="alert">
                      {mcpRefusals[key]}
                    </p>
                  )}
                  <button
                    type="button"
                    className={`${styles['railRow']} ${styles['railSubRow']}`}
                    disabled={reviewingMcp !== null}
                    onClick={() => onReviewMcpServer(group.rootId, server)}
                  >
                    <span className={styles['railRowLabel']}>
                      {reviewingMcp === key
                        ? LOCAL_CODE_COPY.reviewingMcpServer
                        : LOCAL_CODE_COPY.reviewMcpServer(server.name)}
                    </span>
                  </button>
                </div>
              );
            })}

            {pinnedFirst(group.sessions).map((session) => {
              const marker = localSessionMarker(session, activity[session.id]);
              const statusLabel = marker === null ? localSessionStatusLabel(session.status) : null;
              const archived = session.archivedAt !== undefined;
              if (renaming === session.id && onRename) {
                return (
                  <RenameField
                    key={session.id}
                    session={session}
                    onCancel={() => setRenaming(null)}
                    onSave={(title) => {
                      setRenaming(null);
                      void onRename(session, title);
                    }}
                  />
                );
              }
              return (
                <div key={session.id} className={styles['railLocalItem']}>
                  <button
                    type="button"
                    className={`${styles['railRow']} ${styles['railLocalRow']} ${
                      selectedId === session.id ? styles['railRowActive'] : ''
                    }`}
                    aria-current={selectedId === session.id ? 'true' : undefined}
                    data-marker={marker ?? undefined}
                    onClick={() => onSelect(session)}
                  >
                    <span className={styles['railRowGlyph']}>
                      {marker === 'running' ||
                      marker === 'needs-approval' ||
                      marker === 'needs-input' ? (
                        <span
                          className={
                            marker === 'running'
                              ? styles['railRunningDot']
                              : styles['railAttentionDot']
                          }
                          aria-hidden="true"
                        />
                      ) : (
                        <TerminalSquare size={RAIL_GLYPH_SIZE} aria-hidden="true" />
                      )}
                    </span>
                    <span className={styles['railLocalText']}>
                      <span className={styles['railRowLabel']}>{session.title}</span>
                      <span className={styles['railRowMeta']}>
                        {[
                          archived ? LOCAL_CODE_COPY.archivedLabel : null,
                          session.pinned && !archived ? LOCAL_CODE_COPY.pinnedLabel : null,
                          marker === 'failed'
                            ? null
                            : marker && LOCAL_SESSION_MARKER_LABELS[marker],
                          localSessionOriginLabel(session),
                          localModelLabel(session.model),
                          formatRelativeTime(session.updatedAt),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {marker === 'failed' && (
                      <span className={styles['railRowState']}>
                        {LOCAL_SESSION_MARKER_LABELS.failed}
                      </span>
                    )}
                    {statusLabel !== null && (
                      <span className={`${styles['railRowState']} ${styles['railRowStateQuiet']}`}>
                        {statusLabel}
                      </span>
                    )}
                  </button>
                  <SessionMenu
                    session={session}
                    actions={sessionActions}
                    {...(onRename ? { onRename: () => setRenaming(session.id) } : {})}
                    {...(onSetArchived ? { onSetArchived } : {})}
                    {...(onSetPinned ? { onSetPinned } : {})}
                  />
                </div>
              );
            })}

            {group.worktree === undefined && (
              <button
                type="button"
                className={`${styles['railRow']} ${styles['railSubRow']}`}
                onClick={() => onNewSession(group.rootId)}
              >
                <span className={styles['railRowLabel']}>{newSessionLabel(group.name)}</span>
              </button>
            )}
          </div>
        ))}

      {nothingToShow && groups.length === 0 && <p className={styles['railEmpty']}>{empty}</p>}

      <button
        type="button"
        className={styles['railRow']}
        disabled={adding}
        onClick={onAddRepository}
      >
        <span className={styles['railRowGlyph']}>
          <GitBranch size={RAIL_GLYPH_SIZE} aria-hidden="true" />
        </span>
        <span className={styles['railRowLabel']}>{LOCAL_CODE_COPY.addRepository}</span>
      </button>

      <button type="button" className={styles['railRow']} disabled={adding} onClick={onAddFolder}>
        <span className={styles['railRowGlyph']}>
          <Plus size={RAIL_GLYPH_SIZE} aria-hidden="true" />
        </span>
        <span className={styles['railRowLabel']}>
          {adding ? LOCAL_CODE_COPY.addingFolder : LOCAL_CODE_COPY.addFolder}
        </span>
      </button>
    </section>
  );
}
