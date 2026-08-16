import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Archive,
  ArchiveRestore,
  FolderInput,
  FolderMinus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { ConversationSummary } from '../../stores/chat';

const MENU_WIDTH = 220;
const MENU_EST_HEIGHT = 340;

export interface ConversationRowProps {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  projects: Array<{ id: string; name: string }>;
  onMoveToProject: (conversationId: string, projectId: string | null) => void;
}

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon: Icon, label, onClick, danger }: MenuItemProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '7px 9px',
        borderRadius: 6,
        border: 'none',
        background: hover ? 'var(--chat-surface-hover)' : 'transparent',
        cursor: 'pointer',
        color: danger ? 'var(--chat-destructive)' : 'var(--chat-text-secondary)',
        fontSize: 13,
        textAlign: 'left',
      }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

export function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onArchive,
  onRestore,
  projects,
  onMoveToProject,
}: ConversationRowProps) {
  const { t } = useTranslation('v3');
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(conversation.title);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = conversation.title || t('common.untitled');
  const showActions = hovered || menuOpen || active;

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const openUp = rect.bottom + MENU_EST_HEIGHT > window.innerHeight;
    const preferredTop = openUp ? rect.top - MENU_EST_HEIGHT - 4 : rect.bottom + 4;
    const top = Math.max(8, Math.min(preferredTop, window.innerHeight - MENU_EST_HEIGHT - 8));
    setMenuPos({ top, left });
    setConfirmDelete(false);
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!editing) return;
    setDraft(conversation.title);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [editing, conversation.title]);

  const commitRename = useCallback(() => {
    const next = draft.trim();
    if (next && next !== conversation.title) onRename(conversation.id, next);
    setEditing(false);
  }, [draft, conversation.id, conversation.title, onRename]);

  const cancelRename = useCallback(() => {
    setEditing(false);
    setDraft(conversation.title);
  }, [conversation.title]);

  return (
    <div
      data-testid="conversation-row"
      data-conversation-id={conversation.id}
      data-conversation-active={active}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelRename();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '5px 9px',
            borderRadius: 6,
            border: '1px solid var(--chat-accent-primary)',
            background: 'var(--chat-surface-elevated)',
            color: 'var(--chat-text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
      ) : (
        <button
          type="button"
          title={title}
          onClick={() => onSelect(conversation.id)}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            paddingRight: showActions ? 30 : 10,
            borderRadius: 6,
            border: 'none',
            background: active ? 'var(--chat-surface-hover)' : 'transparent',
            cursor: 'pointer',
            color: active ? 'var(--chat-text-primary)' : 'var(--chat-text-secondary)',
            fontSize: 13,
            textAlign: 'left',
          }}
        >
          {conversation.pinned && (
            <Pin size={11} style={{ flexShrink: 0, color: 'var(--chat-text-muted)' }} />
          )}
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
        </button>
      )}

      {!editing && showActions && (
        <button
          ref={triggerRef}
          type="button"
          aria-label={t('sidebar.actions.more')}
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) setMenuOpen(false);
            else openMenu();
          }}
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 5,
            border: 'none',
            background: menuOpen ? 'var(--chat-border)' : 'transparent',
            cursor: 'pointer',
            color: 'var(--chat-text-muted)',
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      )}

      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: MENU_WIDTH,
              zIndex: 1000,
              background: 'var(--chat-surface-elevated)',
              border: '1px solid var(--chat-border)',
              borderRadius: 10,
              boxShadow: 'var(--chat-shadow-lg)',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {conversation.archived ? (
              <MenuItem
                icon={ArchiveRestore}
                label={t('sidebar.actions.restore')}
                onClick={() => {
                  onRestore(conversation.id);
                  setMenuOpen(false);
                }}
              />
            ) : (
              <>
                <MenuItem
                  icon={conversation.pinned ? PinOff : Pin}
                  label={
                    conversation.pinned ? t('sidebar.actions.unpin') : t('sidebar.actions.pin')
                  }
                  onClick={() => {
                    onTogglePin(conversation.id);
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={Pencil}
                  label={t('sidebar.actions.rename')}
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                />
                <MenuItem
                  icon={Archive}
                  label={t('sidebar.actions.archive')}
                  onClick={() => {
                    onArchive(conversation.id);
                    setMenuOpen(false);
                  }}
                />
                {projects.length > 0 && (
                  <>
                    <div
                      role="separator"
                      style={{ height: 1, background: 'var(--chat-border)', margin: '3px 4px' }}
                    />
                    <div
                      style={{
                        padding: '4px 9px 2px',
                        color: 'var(--chat-text-muted)',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Move to project
                    </div>
                    <div style={{ maxHeight: 132, overflowY: 'auto' }}>
                      {projects.map((project) => (
                        <MenuItem
                          key={project.id}
                          icon={FolderInput}
                          label={
                            conversation.projectId === project.id
                              ? `${project.name} · Current`
                              : project.name
                          }
                          onClick={() => {
                            if (conversation.projectId !== project.id) {
                              onMoveToProject(conversation.id, project.id);
                            }
                            setMenuOpen(false);
                          }}
                        />
                      ))}
                    </div>
                    {conversation.projectId && (
                      <MenuItem
                        icon={FolderMinus}
                        label="Remove from project"
                        onClick={() => {
                          onMoveToProject(conversation.id, null);
                          setMenuOpen(false);
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
            <MenuItem
              icon={Trash2}
              danger
              label={
                confirmDelete
                  ? t(
                      conversation.archived
                        ? 'sidebar.actions.confirmDeletePermanently'
                        : 'sidebar.actions.confirmDelete',
                    )
                  : t(
                      conversation.archived
                        ? 'sidebar.actions.deletePermanently'
                        : 'sidebar.actions.delete',
                    )
              }
              onClick={() => {
                if (confirmDelete) {
                  onDelete(conversation.id);
                  setMenuOpen(false);
                } else {
                  setConfirmDelete(true);
                }
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
