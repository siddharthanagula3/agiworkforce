import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Paperclip,
  FolderPlus,
  FolderGit2,
  Zap,
  Link2,
  Puzzle,
  BookOpen,
  Globe,
  PenLine,
  ChevronRight,
  Check,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@agiworkforce/unified-chat';

// Static placeholder catalogs — real data comes from store/Tauri IPC at runtime
const INSTALLED_PLUGINS = [
  { id: 'legal', name: 'Legal Assistant', icon: 'L', color: '#7c3aed' },
  { id: 'finance', name: 'Finance Pro', icon: 'F', color: '#0369a1' },
];

const PLUGIN_COMMANDS: Record<string, { cmd: string }[]> = {
  legal: [{ cmd: '/summarize' }, { cmd: '/redline' }, { cmd: '/compare' }],
  finance: [{ cmd: '/analyze' }, { cmd: '/forecast' }, { cmd: '/chart' }],
};

const SKILLS_LIST = [
  { id: 'translate', name: 'Translate', icon: '🌐', tone: '#0891b2' },
  { id: 'summarize', name: 'Summarize', icon: '📋', tone: '#7c3aed' },
  { id: 'proofread', name: 'Proofread', icon: '✏️', tone: '#059669' },
  { id: 'explain', name: 'Explain', icon: '💡', tone: '#d97706' },
];

const CONNECTORS = {
  connected: [
    { id: 'gdrive', name: 'Google Drive', abbr: 'GD', color: '#4285f4' },
    { id: 'github', name: 'GitHub', abbr: 'GH', color: '#1a1a2e' },
    { id: 'notion', name: 'Notion', abbr: 'N', color: '#000' },
  ],
};

export type SubMenu = 'plugins' | 'skills' | 'connectors' | null;

export interface PlusMenuProps {
  onClose: () => void;
  webSearchOn: boolean;
  onWebSearchToggle: () => void;
  onInsertCommand?: (cmd: string) => void;
}

export function PlusMenu({
  onClose,
  webSearchOn,
  onWebSearchToggle,
  onInsertCommand,
}: PlusMenuProps) {
  const { t } = useTranslation('v3');
  const [openSub, setOpenSub] = useState<SubMenu>(null);
  const [pluginHover, setPluginHover] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const toggleSub = (sub: SubMenu) => setOpenSub((prev) => (prev === sub ? null : sub));

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 z-50 mb-2 flex"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Main popover */}
      <div
        className="w-56 rounded-xl border py-1 shadow-lg"
        style={{
          background: 'var(--chat-surface-elevated)',
          borderColor: 'var(--chat-border)',
        }}
      >
        {/* Files */}
        <MenuItem
          icon={<Paperclip size={15} />}
          label={t('plusMenu.addFiles')}
          kbd="⌘O"
          onClick={onClose}
        />
        <MenuItem
          icon={<FolderPlus size={15} />}
          label={t('plusMenu.addProject')}
          hasArrow
          onClick={() => toggleSub('connectors')}
          active={openSub === 'connectors'}
        />
        <MenuItem
          icon={<FolderGit2 size={15} />}
          label={t('plusMenu.addGithub')}
          onClick={onClose}
        />

        <Divider />

        {/* Skills */}
        <MenuItem
          icon={<Zap size={15} />}
          label={t('plusMenu.skills')}
          hasArrow
          active={openSub === 'skills'}
          onClick={() => toggleSub('skills')}
        />
        {/* Connectors */}
        <MenuItem
          icon={<Link2 size={15} />}
          label={t('plusMenu.connectors')}
          hasArrow
          active={openSub === 'connectors'}
          onClick={() => toggleSub('connectors')}
        />
        {/* Plugins */}
        <MenuItem
          icon={<Puzzle size={15} />}
          label={t('plusMenu.plugins')}
          hasArrow
          active={openSub === 'plugins'}
          onMouseEnter={() => setOpenSub('plugins')}
          onClick={() => toggleSub('plugins')}
        />

        <Divider />

        {/* Research */}
        <MenuItem icon={<BookOpen size={15} />} label={t('plusMenu.research')} onClick={onClose} />
        {/* Web search toggle */}
        <MenuItem
          icon={<Globe size={15} />}
          label={t('plusMenu.webSearch')}
          trailing={
            webSearchOn ? (
              <Check size={14} style={{ color: 'var(--chat-accent-primary)' }} />
            ) : undefined
          }
          onClick={onWebSearchToggle}
        />
        {/* Use style */}
        <MenuItem
          icon={<PenLine size={15} />}
          label={t('plusMenu.useStyle')}
          hasArrow
          onClick={() => toggleSub('skills')}
        />
      </div>

      {/* Plugins flyout — categories */}
      {openSub === 'plugins' && (
        <div
          className="absolute left-full top-0 ml-1 w-48 rounded-xl border py-1 shadow-lg"
          style={{
            background: 'var(--chat-surface-elevated)',
            borderColor: 'var(--chat-border)',
          }}
          onMouseLeave={() => setPluginHover(null)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {INSTALLED_PLUGINS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                'hover:bg-[var(--chat-surface-hover)]',
                pluginHover === p.id && 'bg-[var(--chat-surface-hover)]',
              )}
              style={{ color: 'var(--chat-text-primary)' }}
              onMouseEnter={() => setPluginHover(p.id)}
            >
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                style={{ color: p.color, border: `1px solid ${p.color}66` }}
              >
                {p.icon}
              </div>
              <span className="flex-1 text-left">{p.name}</span>
              <ChevronRight size={13} style={{ color: 'var(--chat-text-muted)' }} />
            </button>
          ))}

          <Divider />

          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--chat-surface-hover)]"
            style={{ color: 'var(--chat-accent-primary)' }}
            onClick={onClose}
          >
            <Puzzle size={13} style={{ color: 'var(--chat-accent-primary)' }} />
            <span>{t('plusMenu.browseAll')}</span>
            <ArrowRight
              size={12}
              style={{ color: 'var(--chat-accent-primary)' }}
              className="ml-auto"
            />
          </button>
        </div>
      )}

      {/* Plugin → commands flyout */}
      {openSub === 'plugins' && pluginHover && (
        <div
          className="absolute left-[calc(100%+13rem)] top-0 ml-1 w-36 rounded-xl border py-1 shadow-lg"
          style={{
            background: 'var(--chat-surface-elevated)',
            borderColor: 'var(--chat-border)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(PLUGIN_COMMANDS[pluginHover] ?? PLUGIN_COMMANDS['legal'] ?? []).map((c) => (
            <button
              key={c.cmd}
              type="button"
              className="flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-[var(--chat-surface-hover)]"
              style={{ color: 'var(--chat-text-primary)' }}
              onClick={() => {
                onInsertCommand?.(c.cmd);
                onClose();
              }}
            >
              <code className="text-xs font-mono" style={{ color: 'var(--chat-accent-primary)' }}>
                {c.cmd}
              </code>
            </button>
          ))}
        </div>
      )}

      {/* Skills flyout */}
      {openSub === 'skills' && (
        <div
          className="absolute left-full top-0 ml-1 w-48 rounded-xl border py-1 shadow-lg"
          style={{
            background: 'var(--chat-surface-elevated)',
            borderColor: 'var(--chat-border)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {SKILLS_LIST.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-[var(--chat-surface-hover)]"
              style={{ color: 'var(--chat-text-primary)' }}
              onClick={onClose}
            >
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                style={{ color: s.tone }}
              >
                {s.icon}
              </div>
              <span>{s.name}</span>
            </button>
          ))}
          <Divider />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--chat-surface-hover)]"
            style={{ color: 'var(--chat-accent-primary)' }}
            onClick={onClose}
          >
            <Zap size={13} style={{ color: 'var(--chat-accent-primary)' }} />
            <span>{t('plusMenu.manageSkills')}</span>
          </button>
        </div>
      )}

      {/* Connectors flyout */}
      {openSub === 'connectors' && (
        <div
          className="absolute left-full top-0 ml-1 w-48 rounded-xl border py-1 shadow-lg"
          style={{
            background: 'var(--chat-surface-elevated)',
            borderColor: 'var(--chat-border)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {CONNECTORS.connected.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-[var(--chat-surface-hover)]"
              style={{ color: 'var(--chat-text-primary)' }}
              onClick={onClose}
            >
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                style={{ background: c.color }}
              >
                {c.abbr}
              </div>
              <span className="flex-1 text-left">{c.name}</span>
              <Check size={12} style={{ color: 'var(--chat-accent-primary)' }} />
            </button>
          ))}
          <Divider />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--chat-surface-hover)]"
            style={{ color: 'var(--chat-accent-primary)' }}
            onClick={onClose}
          >
            <Link2 size={13} style={{ color: 'var(--chat-accent-primary)' }} />
            <span>{t('plusMenu.addConnector')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  kbd?: string;
  trailing?: React.ReactNode;
  hasArrow?: boolean;
  active?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

function MenuItem({
  icon,
  label,
  kbd,
  trailing,
  hasArrow,
  active,
  onClick,
  onMouseEnter,
}: MenuItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
        'hover:bg-[var(--chat-surface-hover)]',
        active && 'bg-[var(--chat-surface-hover)]',
      )}
      style={{ color: 'var(--chat-text-primary)' }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span style={{ color: 'var(--chat-text-secondary)' }}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {kbd && (
        <span
          className="rounded px-1 py-0.5 font-mono text-[10px]"
          style={{
            background: 'var(--chat-surface-hover)',
            color: 'var(--chat-text-muted)',
          }}
        >
          {kbd}
        </span>
      )}
      {trailing}
      {hasArrow && <ChevronRight size={13} style={{ color: 'var(--chat-text-muted)' }} />}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px" style={{ background: 'var(--chat-border)' }} />;
}
