/**
 * ConversationHeader — the bar above an active conversation.
 *
 * This was a title and nothing else (DCL-08), so Desktop's chat had no rename,
 * no share and no way to reach artifacts, while web's own 409-line ChatHeader
 * offered all three. Rather than fork a second rich header, the
 * conversation-scoped actions live here and the host supplies the handlers it
 * can honour — an action with no handler is not rendered, so no surface shows a
 * control it cannot perform.
 *
 * Page chrome that web keeps in its ChatHeader (avatar, plan badge, theme
 * toggle) is deliberately not here: that belongs to the app shell, not to a
 * conversation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Package, Pencil, Share2, X } from 'lucide-react';
import { useUiTranslation } from '@agiworkforce/ui';
import { useChatStore } from '../stores/chatStore';

export interface ConversationHeaderProps {
  /** Persist a renamed title. Omit to hide the rename affordance. */
  onRename?: (conversationId: string, title: string) => void | Promise<void>;
  /** Publish a share link. Omit to hide the share action. */
  onShare?: (conversationId: string) => void | Promise<void>;
  /** Toggle the artifacts panel. Omit to hide the artifacts action. */
  onToggleArtifacts?: () => void;
  /** Whether the artifacts panel is currently open, for aria-pressed. */
  artifactsOpen?: boolean;
  /**
   * How many artifacts this conversation currently has. Rendered as a badge on
   * the artifacts toggle and folded into its accessible name, so the control
   * says what it will open instead of being an unlabelled box.
   */
  artifactCount?: number;
}

export function ConversationHeader({
  onRename,
  onShare,
  onToggleArtifacts,
  artifactsOpen = false,
  artifactCount = 0,
}: ConversationHeaderProps = {}) {
  const { t } = useUiTranslation('chat');
  const currentId = useChatStore((s) => s.activeConversationId);
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === currentId));
  const updateConversation = useChatStore((s) => s.updateConversation);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Abandon an in-progress rename when the conversation changes underneath it,
  // so a draft cannot be committed onto a different conversation.
  useEffect(() => {
    setEditing(false);
  }, [currentId]);

  const beginRename = useCallback(() => {
    setDraft(conversation?.title ?? '');
    setEditing(true);
  }, [conversation?.title]);

  const commitRename = useCallback(() => {
    const next = draft.trim();
    setEditing(false);
    if (!conversation || !next || next === conversation.title) return;
    // Update locally first so the title does not flicker back while the host
    // persists. The host owns durability.
    updateConversation(conversation.id, { title: next });
    void onRename?.(conversation.id, next);
  }, [conversation, draft, onRename, updateConversation]);

  if (!conversation) return null;

  const title = conversation.title || t('header.newConversation', 'New Conversation');

  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--chat-border)] px-4 py-2">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label={t('header.conversationTitle', 'Conversation title')}
          className="min-w-0 flex-1 rounded border border-[var(--chat-border)] bg-[var(--chat-input-bg)] px-2 py-1 text-sm text-[var(--chat-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-primary)]"
        />
      ) : (
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--chat-fg)]">
          {title}
        </h2>
      )}

      <div className="flex flex-shrink-0 items-center gap-1">
        {editing ? (
          <>
            <HeaderAction
              label={t('header.saveTitle', 'Save title')}
              onClick={commitRename}
              icon={Check}
            />
            <HeaderAction
              label={t('header.cancelRename', 'Cancel rename')}
              onClick={() => setEditing(false)}
              icon={X}
            />
          </>
        ) : (
          <>
            {onRename ? (
              <HeaderAction
                label={t('header.renameConversation', 'Rename conversation')}
                onClick={beginRename}
                icon={Pencil}
              />
            ) : null}
            {onToggleArtifacts ? (
              <HeaderAction
                label={
                  artifactCount > 0
                    ? t('header.toggleArtifactsCount', 'Toggle artifacts panel ({{count}})', {
                        count: artifactCount,
                      })
                    : t('header.toggleArtifacts', 'Toggle artifacts panel')
                }
                onClick={onToggleArtifacts}
                icon={Package}
                pressed={artifactsOpen}
                badge={artifactCount > 0 ? artifactCount : undefined}
              />
            ) : null}
            {onShare ? (
              <HeaderAction
                label={t('header.shareConversation', 'Share conversation')}
                onClick={() => void onShare(conversation.id)}
                icon={Share2}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function HeaderAction({
  label,
  onClick,
  icon: Icon,
  pressed,
  badge,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Pencil;
  pressed?: boolean;
  /** Numeric count rendered beside the icon (e.g. the artifact count). */
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      className="inline-flex items-center gap-1 rounded p-1.5 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-primary)]"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {badge === undefined ? null : (
        <span className="text-[11px] font-medium leading-none" aria-hidden>
          {badge}
        </span>
      )}
    </button>
  );
}
