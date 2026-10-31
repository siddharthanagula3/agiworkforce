import { useState, useRef, useEffect, useCallback } from 'react';
import { useConfirmAction, useMenuKeyboard } from '@agiworkforce/ui';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  MoreHorizontal,
  SquarePen,
  Pencil,
  FolderOpen,
  Archive,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Project } from '../../stores/projectStore';

const MENU_WIDTH = 176;
const MENU_EST_HEIGHT = 120;

export interface ProjectRowProps {
  project: Project;
  active: boolean;
  accentColor: string;
  onOpen: (id: string) => void;
  onNewChat: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
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
      data-v3-sidebar-menu-item
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
        color: danger ? 'var(--chat-destructive-text)' : 'var(--chat-text-secondary)',
        fontSize: 13,
        textAlign: 'left',
      }}
    >
      <Icon size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
    </button>
  );
}

export function ProjectRow({
  project,
  active,
  accentColor,
  onOpen,
  onNewChat,
  onRename,
  onDelete,
  onArchive,
}: ProjectRowProps) {
  const { t } = useTranslation('v3');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const name = project.name || t('common.untitled');
  const emoji = project.iconEmoji ?? null;

  const openMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const openUp = rect.bottom + MENU_EST_HEIGHT > window.innerHeight;
    const preferredTop = openUp ? rect.top - MENU_EST_HEIGHT - 4 : rect.bottom + 4;
    const top = Math.max(8, Math.min(preferredTop, window.innerHeight - MENU_EST_HEIGHT - 8));
    setMenuPos({ top, left });
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useMenuKeyboard({
    open: menuOpen,
    onClose: closeMenu,
    panelRef: menuRef,
    triggerRef: triggerRef,
  });

  useEffect(() => {
    if (!editing) return;
    setDraft(project.name);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [editing, project.name]);

  const commitRename = useCallback(() => {
    const next = draft.trim();
    if (next && next !== project.name) onRename(project.id, next);
    setEditing(false);
  }, [draft, project.id, project.name, onRename]);

  const cancelRename = useCallback(() => {
    setEditing(false);
    setDraft(project.name);
  }, [project.name]);

  return (
    <div
      data-testid="project-row"
      data-project-id={project.id}
      data-project-active={active}
      data-row-menu-open={menuOpen}
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
          title={name}
          onClick={() => onOpen(project.id)}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px',
            paddingRight: 'calc(var(--v3-row-action-size, 24px) * 2 + 14px)',
            minHeight: 'var(--v3-row-height, 34px)',
            borderRadius: 6,
            border: 'none',
            background: active ? 'var(--chat-surface-hover)' : 'transparent',
            cursor: 'pointer',
            color: active ? 'var(--chat-text-primary)' : 'var(--chat-text-secondary)',
            fontSize: 13,
            textAlign: 'left',
          }}
        >
          {emoji ? (
            <span style={{ flexShrink: 0, fontSize: 14, lineHeight: 1 }}>{emoji}</span>
          ) : (
            <Folder size={14} style={{ flexShrink: 0, color: accentColor }} />
          )}
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
        </button>
      )}

      {!editing && (
        <div
          data-v3-row-actions
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <button
            type="button"
            aria-label={t('sidebar.projects.newChat')}
            title={t('sidebar.projects.newChat')}
            onClick={(e) => {
              e.stopPropagation();
              onNewChat(project.id);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 'var(--v3-row-action-size, 24px)',
              height: 'var(--v3-row-action-size, 24px)',
              borderRadius: 5,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--chat-text-muted)',
            }}
          >
            <SquarePen size={14} />
          </button>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t('sidebar.actions.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) setMenuOpen(false);
              else openMenu();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 'var(--v3-row-action-size, 24px)',
              height: 'var(--v3-row-action-size, 24px)',
              borderRadius: 5,
              border: 'none',
              background: menuOpen ? 'var(--chat-border)' : 'transparent',
              cursor: 'pointer',
              color: 'var(--chat-text-muted)',
            }}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
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
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100dvh - 16px)',
              overflowY: 'auto',
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
            <MenuItem
              icon={FolderOpen}
              label={t('sidebar.projects.open')}
              onClick={() => {
                onOpen(project.id);
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
                onArchive(project.id);
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={Trash2}
              danger
              label={t('sidebar.actions.delete')}
              onClick={() => {
                setMenuOpen(false);
                confirm({
                  title: `Delete the project “${name}”?`,
                  description:
                    'The project and its instructions and settings are removed for good. Its chats are not deleted. A deleted project cannot be restored.',
                  confirmLabel: 'Delete project',
                  destructive: true,
                  onConfirm: () => onDelete(project.id),
                });
              }}
            />
          </div>,
          document.body,
        )}
      {confirmDialog}
    </div>
  );
}
