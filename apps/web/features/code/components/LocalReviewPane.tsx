'use client';

import { useId, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  X,
} from '@agiworkforce/icons';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import {
  DEVELOPER_FILE_CHANGE_LABELS,
  type DeveloperWorktree,
} from '@agiworkforce/local-runtime-contract';
import type { CheckpointFileDiff, CheckpointFileStatus } from '@agiworkforce/types/protocol';
import {
  LOCAL_REVIEW_COPY,
  localReviewComment,
  localReviewCommentsMessage,
  localReviewLines,
  localSkippedFilesLine,
  type LocalReviewComment,
  type LocalReviewLine,
} from '../local-code';
import type { LocalReviewState } from '../hooks/use-local-review';
import { DiffBody } from './CodeDiffFile';
import { LocalListNotice } from './LocalListNotice';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

function sameLine(comment: LocalReviewComment, path: string, line: LocalReviewLine): boolean {
  return comment.path === path && comment.line === line.line && comment.side === line.side;
}

function CommentDraft({
  label,
  onAdd,
  onCancel,
}: {
  label: string;
  onAdd: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <span className={styles['reviewCommentDraft']}>
      <textarea
        aria-label={label}
        placeholder={LOCAL_REVIEW_COPY.commentPlaceholder}
        className={styles['reviewCommentInput']}
        value={text}
        rows={2}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && text.trim() !== '') {
            event.preventDefault();
            onAdd(text);
          }
        }}
      />
      <span className={styles['reviewActions']}>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={text.trim() === ''}
          onClick={() => onAdd(text)}
        >
          {LOCAL_REVIEW_COPY.addComment}
        </button>
        <button type="button" className={styles['secondaryButton']} onClick={onCancel}>
          {LOCAL_REVIEW_COPY.cancelComment}
        </button>
      </span>
    </span>
  );
}

function CommentableHunk({
  path,
  body,
  comments,
  onComment,
  onRemove,
}: {
  path: string;
  body: string;
  comments: readonly LocalReviewComment[];
  onComment: (comment: LocalReviewComment) => void;
  onRemove: (comment: LocalReviewComment) => void;
}) {
  const [drafting, setDrafting] = useState<number | null>(null);
  const lines = localReviewLines(body);

  return (
    <pre className={styles['diff']}>
      {lines.map((line, index) => {
        const label =
          line.line === null ? null : LOCAL_REVIEW_COPY.commentOnLine(path, line.line, line.side);
        const here = comments.filter((comment) => sameLine(comment, path, line));
        return (
          <span key={`${index}:${line.text}`} className={styles['reviewLine']}>
            <span
              className={`${styles['diffLine']} ${styles[`diffLine-${line.kind}`]} ${styles['reviewLineText']}`}
            >
              {line.text}
            </span>
            {label !== null && (
              <button
                type="button"
                className={styles['reviewLineComment']}
                aria-label={label}
                title={label}
                onClick={() => setDrafting(index)}
              >
                <MessageSquare size={12} aria-hidden="true" />
              </button>
            )}
            {here.map((comment) => (
              <span key={comment.text} className={styles['reviewComment']}>
                <span>{comment.text}</span>
                <button
                  type="button"
                  className={styles['headerButton']}
                  aria-label={LOCAL_REVIEW_COPY.removeComment}
                  onClick={() => onRemove(comment)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            {drafting === index && label !== null && (
              <CommentDraft
                label={label}
                onCancel={() => setDrafting(null)}
                onAdd={(text) => {
                  const comment = localReviewComment(path, line, text);
                  if (comment) onComment(comment);
                  setDrafting(null);
                }}
              />
            )}
          </span>
        );
      })}
    </pre>
  );
}

const STATUS_CHANGE = {
  added: 'created',
  modified: 'modified',
  deleted: 'deleted',
} as const satisfies Record<CheckpointFileStatus, keyof typeof DEVELOPER_FILE_CHANGE_LABELS>;

function ReviewFile({
  file,
  busy,
  onStage,
  onRevert,
  comments,
  onComment,
  onRemoveComment,
}: {
  file: CheckpointFileDiff;
  busy: boolean;
  onStage: (hunks: number[]) => void;
  onRevert: (hunks: number[]) => void;
  comments: readonly LocalReviewComment[] | null;
  onComment: (comment: LocalReviewComment) => void;
  onRemoveComment: (comment: LocalReviewComment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();

  return (
    <div className={styles['fileBlock']}>
      <div className={styles['reviewFileHeader']}>
        <button
          type="button"
          className={styles['fileRow']}
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className={styles['activityChevron']}>
            {expanded ? (
              <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
            ) : (
              <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
            )}
          </span>
          <span className={styles['fileStatus']}>
            {DEVELOPER_FILE_CHANGE_LABELS[STATUS_CHANGE[file.status]]}
          </span>
          <span className={styles['fileName']}>{file.path}</span>
        </button>
        <span className={styles['reviewActions']}>
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={busy}
            onClick={() => onStage([])}
          >
            {LOCAL_REVIEW_COPY.stageFile}
          </button>
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={busy}
            onClick={() => onRevert([])}
          >
            {LOCAL_REVIEW_COPY.revertFile}
          </button>
        </span>
      </div>
      {expanded && (
        <div id={regionId} className={styles['reviewHunks']}>
          {file.binary || file.hunks.length === 0 ? (
            <p className={styles['statusLine']}>{LOCAL_REVIEW_COPY.binary}</p>
          ) : (
            file.hunks.map((hunk) => (
              <div key={hunk.index} className={styles['reviewHunk']}>
                {comments === null ? (
                  <DiffBody body={hunk.text.replace(/\n$/u, '')} />
                ) : (
                  <CommentableHunk
                    path={file.path}
                    body={hunk.text.replace(/\n$/u, '')}
                    comments={comments}
                    onComment={onComment}
                    onRemove={onRemoveComment}
                  />
                )}
                <span className={styles['reviewActions']}>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={busy}
                    onClick={() => onStage([hunk.index])}
                  >
                    {LOCAL_REVIEW_COPY.stageHunk}
                  </button>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    disabled={busy}
                    onClick={() => onRevert([hunk.index])}
                  >
                    {LOCAL_REVIEW_COPY.revertHunk}
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WorktreeSection({
  worktree,
  review,
}: {
  worktree: DeveloperWorktree;
  review: LocalReviewState;
}) {
  const script = worktree.setupScript;
  const startedFrom =
    worktree.start.kind === 'working_tree'
      ? LOCAL_REVIEW_COPY.worktreeFromChanges
      : LOCAL_REVIEW_COPY.worktreeFrom(worktree.start.name);
  const setupLine =
    review.setup === 'passed'
      ? LOCAL_REVIEW_COPY.setupPassed
      : review.setup === 'failed'
        ? LOCAL_REVIEW_COPY.setupFailed(review.setupExitCode)
        : null;

  return (
    <section className={styles['reviewSection']} aria-label={LOCAL_REVIEW_COPY.worktreeHeading}>
      <p className={styles['statusLine']}>{startedFrom}</p>
      <span className={styles['reviewActions']}>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={review.busy}
          onClick={review.apply}
        >
          {LOCAL_REVIEW_COPY.apply}
        </button>
        <button
          type="button"
          className={styles['secondaryButton']}
          aria-pressed={review.pinned}
          disabled={review.busy}
          onClick={review.togglePin}
        >
          {review.pinned ? LOCAL_REVIEW_COPY.unpin : LOCAL_REVIEW_COPY.pin}
        </button>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={review.busy}
          onClick={review.removeWorktree}
        >
          {LOCAL_REVIEW_COPY.remove}
        </button>
      </span>

      {script !== null && (
        <div className={styles['reviewSection']}>
          <p className={styles['statusLine']}>{LOCAL_REVIEW_COPY.setupBody(script.path)}</p>
          {script.approved && (
            <p className={styles['statusLine']}>{LOCAL_REVIEW_COPY.setupApproved}</p>
          )}
          <span className={styles['reviewActions']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={review.busy || review.setup === 'running'}
              onClick={() => review.runSetup(script)}
            >
              {review.setup === 'running' ? (
                <>
                  <Spinner size="sm" aria-hidden="true" />
                  {LOCAL_REVIEW_COPY.setupRunning}
                </>
              ) : (
                LOCAL_REVIEW_COPY.setupRun
              )}
            </button>
          </span>
          {setupLine !== null && (
            <p className={styles['statusLine']} role="status">
              {setupLine}
            </p>
          )}
          {review.setupLog.length > 0 && (
            <details>
              <summary>{LOCAL_REVIEW_COPY.setupOutput}</summary>
              <pre className={styles['activityOutput']}>{review.setupLog.join('\n')}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export interface LocalReviewPaneProps {
  review: LocalReviewState;
  worktree: DeveloperWorktree | null;
  onClose: () => void;
  /** Absent where the session cannot take a turn, which leaves the diff read-only. */
  onSendComments?: (message: string) => void;
}

/**
 * The Changes pane of a local session: each turn's checkpointed diff with
 * stage and revert per file or per hunk, rewinding to before a turn, and for
 * a worktree session, applying its changes to the folder it came from.
 */
export function LocalReviewPane({
  review,
  worktree,
  onClose,
  onSendComments,
}: LocalReviewPaneProps) {
  const turns = review.checkpoints?.turns ?? [];
  const turn = review.turn;
  const [comments, setComments] = useState<LocalReviewComment[]>([]);
  const { confirm, dialog: discardDialog } = useConfirmAction();

  const addComment = (comment: LocalReviewComment) =>
    setComments((current) => [...current, comment]);
  const removeComment = (comment: LocalReviewComment) =>
    setComments((current) => current.filter((candidate) => candidate !== comment));
  const sendComments = () => {
    if (!onSendComments || comments.length === 0) return;
    onSendComments(localReviewCommentsMessage(comments));
    setComments([]);
  };

  return (
    <aside
      className={styles['changes']}
      aria-label={LOCAL_REVIEW_COPY.heading}
      data-testid="local-review-pane"
    >
      <div className={styles['changesHeader']}>
        <span className={styles['changesBranch']}>
          <GitBranch size={GLYPH_SIZE} aria-hidden="true" />
          <span>{LOCAL_REVIEW_COPY.heading}</span>
        </span>
        <div className={styles['changesActions']}>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_REVIEW_COPY.refresh}
            disabled={review.loading}
            onClick={review.refresh}
          >
            <RefreshCw size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_REVIEW_COPY.close}
            onClick={onClose}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles['changesBody']}>
        {worktree !== null && <WorktreeSection worktree={worktree} review={review} />}

        {review.error !== null && (
          <div className={styles['notice']} role="alert">
            <span>{review.error}</span>
          </div>
        )}
        {review.notice && (
          <div className={styles['notice']} role="status">
            <span>{review.notice}</span>
          </div>
        )}
        {review.skipped.length > 0 && (
          <LocalListNotice
            line={localSkippedFilesLine(review.skipped.length)}
            summary={LOCAL_REVIEW_COPY.skippedFilesList}
            items={review.skipped}
          />
        )}

        {review.loading && review.checkpoints === null && (
          <div className={styles['changesEmpty']}>
            <Spinner size="sm" aria-label={LOCAL_REVIEW_COPY.loading} />
          </div>
        )}

        {review.checkpoints !== null && !review.checkpoints.available && (
          <p className={styles['changesEmpty']}>{review.checkpoints.unavailableReason}</p>
        )}

        {review.checkpoints?.available && turns.length === 0 && (
          <p className={styles['changesEmpty']}>{LOCAL_REVIEW_COPY.empty}</p>
        )}

        {turns.length > 0 && (
          <div
            className={styles['reviewTurns']}
            role="group"
            aria-label={LOCAL_REVIEW_COPY.heading}
          >
            {turns.map((candidate) => (
              <button
                key={candidate.turnId}
                type="button"
                className={`${styles['reviewTurn']} ${candidate.turnId === turn?.turnId ? styles['reviewTurnActive'] : ''}`}
                aria-pressed={candidate.turnId === turn?.turnId}
                onClick={() => review.selectTurn(candidate.turnId)}
              >
                {LOCAL_REVIEW_COPY.turnLabel(candidate.index)}
                <span className={styles['optionCopy']}>
                  {candidate.finishedAt === undefined
                    ? LOCAL_REVIEW_COPY.turnRunning
                    : [
                        LOCAL_REVIEW_COPY.turnFiles(candidate.files.length),
                        candidate.skippedFiles?.length
                          ? LOCAL_REVIEW_COPY.turnSkipped(candidate.skippedFiles.length)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </button>
            ))}
          </div>
        )}

        {turn !== null && (
          <section
            className={styles['reviewSection']}
            aria-label={LOCAL_REVIEW_COPY.turnLabel(turn.index)}
          >
            <span className={styles['reviewActions']}>
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={review.busy || turn.finishedAt === undefined}
                title={turn.rewindable ? undefined : LOCAL_REVIEW_COPY.notRewindable}
                onClick={() => review.rewind(turn)}
              >
                <RotateCcw size={GLYPH_SIZE} aria-hidden="true" />
                {LOCAL_REVIEW_COPY.rewind}
              </button>
            </span>
            {turn.skippedFiles?.length ? (
              <LocalListNotice
                line={localSkippedFilesLine(turn.skippedFiles.length)}
                summary={LOCAL_REVIEW_COPY.skippedFilesList}
                items={turn.skippedFiles}
                testId="local-review-skipped"
              />
            ) : null}
            {review.diff !== null && (
              <div className={styles['fileList']}>
                {review.diff.files.map((file) => (
                  <ReviewFile
                    key={file.path}
                    file={file}
                    busy={review.busy}
                    onStage={(hunks) => review.stage([{ path: file.path, hunks }])}
                    onRevert={(hunks) => review.revert([{ path: file.path, hunks }])}
                    comments={onSendComments ? comments : null}
                    onComment={addComment}
                    onRemoveComment={removeComment}
                  />
                ))}
              </div>
            )}
            {comments.length > 0 && (
              <div
                className={styles['reviewCommentBar']}
                role="group"
                aria-label={LOCAL_REVIEW_COPY.comments(comments.length)}
              >
                <span className={styles['statusLine']}>
                  {LOCAL_REVIEW_COPY.comments(comments.length)}
                </span>
                <span className={styles['reviewActions']}>
                  <button type="button" className={styles['primaryButton']} onClick={sendComments}>
                    {LOCAL_REVIEW_COPY.sendComments}
                  </button>
                  <button
                    type="button"
                    className={styles['secondaryButton']}
                    onClick={() =>
                      confirm({
                        title: LOCAL_REVIEW_COPY.clearCommentsTitle,
                        description: LOCAL_REVIEW_COPY.clearCommentsDescription(comments.length),
                        confirmLabel: LOCAL_REVIEW_COPY.clearComments,
                        onConfirm: () => setComments([]),
                      })
                    }
                  >
                    {LOCAL_REVIEW_COPY.clearComments}
                  </button>
                </span>
              </div>
            )}
            {review.diff !== null && review.diff.files.length > 0 && (
              <p className={styles['statusLine']}>{LOCAL_REVIEW_COPY.commitInTerminal}</p>
            )}
          </section>
        )}
      </div>
      {review.dialog}
      {discardDialog}
    </aside>
  );
}
