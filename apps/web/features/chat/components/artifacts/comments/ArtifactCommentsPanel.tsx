'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, MessageSquare, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';
import {
  groupThreads,
  type ArtifactCommentAnchor,
  type ArtifactCommentThread,
  useArtifactComments,
} from './artifact-comments-client';
import { buildCommentsEditRequest, describeAnchor } from './comment-request';

export const COMMENTS_LABEL = 'Comments';
const MAX_COMMENT_CHARS = 4_000;

function AnchorQuote({
  anchor,
  onLocate,
}: {
  anchor: ArtifactCommentAnchor;
  onLocate?: () => void;
}) {
  const label =
    anchor.kind === 'text'
      ? `"${anchor.quote}"`
      : anchor.kind === 'slide'
        ? `Slide ${anchor.slide + 1}`
        : anchor.kind === 'element'
          ? anchor.text || anchor.selector
          : 'Whole artifact';
  const slideNote =
    anchor.kind === 'text' && anchor.slide !== undefined ? `Slide ${anchor.slide + 1} · ` : '';
  const content = (
    <span className="line-clamp-2 text-start text-xs text-muted-foreground">
      {slideNote}
      {label}
    </span>
  );
  if (!onLocate)
    return <div className="border-s-2 border-[var(--chat-warning-border)] ps-2">{content}</div>;
  return (
    <button
      type="button"
      onClick={onLocate}
      className="block w-full border-s-2 border-[var(--chat-warning-border)] ps-2 hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Show in the artifact"
    >
      {content}
    </button>
  );
}

function CommentComposer({
  placeholder,
  submitLabel,
  autoFocus,
  pending,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  pending: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    if (await onSubmit(text)) setBody('');
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-1.5">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value.slice(0, MAX_COMMENT_CHARS))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event);
          if (event.key === 'Escape' && onCancel) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        rows={2}
        className="min-h-11 w-full resize-y rounded-lg border border-border/60 bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex justify-end gap-1">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md px-3 text-sm text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-8"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!body.trim() || pending}
          className="inline-flex min-h-11 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-40 sm:min-h-8"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function ThreadCard({
  thread,
  pending,
  onReply,
  onToggleResolved,
  onDelete,
  onAskAi,
  onLocate,
}: {
  thread: ArtifactCommentThread;
  pending: boolean;
  onReply: (body: string) => Promise<boolean>;
  onToggleResolved: () => void;
  onDelete: () => void;
  onAskAi?: () => void;
  onLocate?: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const resolved = thread.root.resolvedAt !== null;
  const entries = [thread.root, ...thread.replies];
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border/50 bg-card p-3',
        resolved && 'opacity-70',
      )}
      data-testid="artifact-comment-thread"
    >
      <AnchorQuote anchor={thread.root.anchor} {...(onLocate ? { onLocate } : {})} />
      {entries.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">
            {entry.author === 'assistant' ? 'Assistant' : 'You'}
            <time dateTime={entry.createdAt} className="ms-2 font-normal text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </span>
          <p className="whitespace-pre-wrap text-sm text-foreground">{entry.body}</p>
        </div>
      ))}
      {replying ? (
        <CommentComposer
          placeholder="Reply"
          submitLabel="Reply"
          autoFocus
          pending={pending}
          onSubmit={async (body) => {
            const sent = await onReply(body);
            if (sent) setReplying(false);
            return sent;
          }}
          onCancel={() => setReplying(false)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-0.5">
        {!replying ? (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="min-h-11 rounded-md px-2 text-xs text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-7"
          >
            Reply
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleResolved}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-7"
        >
          {resolved ? (
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {resolved ? 'Reopen' : 'Resolve'}
        </button>
        {onAskAi && !resolved ? (
          <button
            type="button"
            onClick={onAskAi}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-7"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Ask AI to apply
          </button>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete comment"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:h-7 sm:w-7"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function ArtifactCommentsPanel({
  artifactId,
  title,
  artifactType,
  draftAnchor,
  onDraftDone,
  onClose,
  onRequestEdits,
  onLocate,
}: {
  artifactId: string;
  title: string;
  artifactType?: string;
  draftAnchor: ArtifactCommentAnchor | null;
  onDraftDone: () => void;
  onClose: () => void;
  onRequestEdits?: (prompt: string) => boolean;
  onLocate?: (anchor: ArtifactCommentAnchor) => void;
}) {
  const { state, comments, load, create, update, remove } = useArtifactComments(artifactId);
  const [showResolved, setShowResolved] = useState(false);
  const [posting, setPosting] = useState(false);
  const { confirm, dialog } = useConfirmAction();
  const threads = useMemo(() => groupThreads(comments), [comments]);

  useEffect(() => {
    if (state.status === 'idle') void load();
  }, [state.status, load]);
  const open = threads.filter((thread) => thread.root.resolvedAt === null);
  const resolvedCount = threads.length - open.length;
  const shown = showResolved ? threads : open;

  const post = async (input: {
    body: string;
    anchor?: ArtifactCommentAnchor;
    parentId?: string;
  }) => {
    setPosting(true);
    try {
      await create(input);
      return true;
    } catch (error) {
      toast.error(toUserMessage(error, 'The comment was not saved'));
      return false;
    } finally {
      setPosting(false);
    }
  };

  const ask = (selected: readonly ArtifactCommentThread[]) => {
    if (!onRequestEdits || selected.length === 0) return;
    if (onRequestEdits(buildCommentsEditRequest(title, selected, artifactType))) {
      toast.success(
        selected.length === 1
          ? 'Sent the comment to the assistant'
          : `Sent ${selected.length} comments to the assistant`,
      );
    } else {
      toast.error('The change request was not sent. Try again.');
    }
  };

  return (
    <aside
      className="absolute inset-y-0 end-0 z-[var(--z-content-raised)] flex w-full max-w-sm flex-col border-s border-border/40 bg-background shadow-e2"
      aria-label={COMMENTS_LABEL}
      data-testid="artifact-comments-panel"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/30 px-3 py-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="flex-1 text-sm font-semibold text-foreground">{COMMENTS_LABEL}</h3>
        {resolvedCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowResolved((value) => !value)}
            aria-pressed={showResolved}
            className="min-h-11 rounded-md px-2 text-xs text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-7"
          >
            {showResolved ? 'Hide resolved' : `Show resolved (${resolvedCount})`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:h-7 sm:w-7"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {draftAnchor ? (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--chat-border-strong)] p-3">
            <AnchorQuote anchor={draftAnchor} />
            <CommentComposer
              placeholder="Add a comment"
              submitLabel="Comment"
              autoFocus
              pending={posting}
              onSubmit={async (body) => {
                const sent = await post({ body, anchor: draftAnchor });
                if (sent) onDraftDone();
                return sent;
              }}
              onCancel={onDraftDone}
            />
          </div>
        ) : (
          <CommentComposer
            placeholder="Comment on the whole artifact"
            submitLabel="Comment"
            pending={posting}
            onSubmit={(body) => post({ body, anchor: { kind: 'artifact' } })}
          />
        )}

        {onRequestEdits && open.length > 1 ? (
          <button
            type="button"
            onClick={() => ask(open)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border-strong)] px-3 text-sm text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-9"
            data-testid="artifact-comments-send-all"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Ask AI to apply all {open.length} open comments
          </button>
        ) : null}

        {state.status === 'idle' || state.status === 'loading' ? (
          <div className="flex justify-center p-4">
            <Spinner size="sm" aria-label="Loading comments" />
          </div>
        ) : state.status === 'failed' ? (
          <div className="flex flex-col items-start gap-2" role="status">
            <p className="text-sm text-muted-foreground">
              {toUserMessage(state.error, 'Comments could not be loaded')}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-11 rounded-md px-2 text-sm text-foreground underline sm:min-h-8"
            >
              Try again
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Select text and choose Comment to note a passage.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {shown.map((thread) => (
              <ThreadCard
                key={thread.root.id}
                thread={thread}
                pending={posting}
                onReply={(body) => post({ body, parentId: thread.root.id })}
                onToggleResolved={() =>
                  void update({
                    id: thread.root.id,
                    resolved: thread.root.resolvedAt === null,
                  }).catch((error: unknown) =>
                    toast.error(toUserMessage(error, 'The comment was not changed')),
                  )
                }
                onDelete={() =>
                  confirm({
                    title: 'Delete this comment?',
                    description: `${describeAnchor(thread.root.anchor)}. The comment${
                      thread.replies.length > 0
                        ? ` and its ${thread.replies.length} replies are`
                        : ' is'
                    } removed for good and cannot be recovered.`,
                    confirmLabel: 'Delete',
                    destructive: true,
                    onConfirm: () =>
                      void remove(thread.root.id).catch((error: unknown) =>
                        toast.error(toUserMessage(error, 'The comment was not deleted')),
                      ),
                  })
                }
                {...(onRequestEdits ? { onAskAi: () => ask([thread]) } : {})}
                {...(onLocate ? { onLocate: () => onLocate(thread.root.anchor) } : {})}
              />
            ))}
          </ol>
        )}
      </div>
      {dialog}
    </aside>
  );
}
