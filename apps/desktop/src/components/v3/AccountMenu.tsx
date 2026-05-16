import {
  Settings,
  Globe,
  Lock,
  Sparkles,
  Cpu,
  Box,
  Mail,
  LogOut,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';

type MenuItemDef =
  | { kind: 'header'; label: string }
  | { kind: 'divider' }
  | {
      kind: 'item';
      icon: React.ElementType;
      label: string;
      kbd?: string;
      chev?: boolean;
      go?: string;
      danger?: boolean;
    };

export interface AccountMenuProps {
  email?: string;
  onClose: () => void;
  onNavigate?: (dest: string) => void;
}

export function AccountMenu({ email = '', onClose, onNavigate }: AccountMenuProps) {
  const items: MenuItemDef[] = [
    { kind: 'header', label: email || 'Account' },
    { kind: 'item', icon: Settings, label: 'Settings', kbd: '⌘,', go: 'settings' },
    { kind: 'item', icon: Globe, label: 'Language', chev: true },
    { kind: 'item', icon: Lock, label: 'Privacy & security', go: 'privacy' },
    { kind: 'divider' },
    { kind: 'item', icon: Sparkles, label: 'View all plans', go: 'pricing' },
    { kind: 'item', icon: Cpu, label: 'BYOK & local models', go: 'byok' },
    { kind: 'item', icon: Box, label: 'Apps & extensions', chev: true },
    { kind: 'item', icon: Mail, label: 'Gift AGI', chev: true },
    { kind: 'item', icon: HelpCircle, label: 'Help & support', go: 'help' },
    { kind: 'divider' },
    { kind: 'item', icon: LogOut, label: 'Log out', danger: true },
  ];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: 60,
          left: 12,
          width: 240,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 50,
          overflow: 'hidden',
          padding: '4px 0',
        }}
      >
        {items.map((it, i) => {
          if (it.kind === 'header') {
            return (
              <div
                key={i}
                style={{
                  padding: '10px 14px 8px',
                  fontSize: 12,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--mono)',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.label}
              </div>
            );
          }
          if (it.kind === 'divider') {
            return (
              <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            );
          }
          const { icon: Icon, label, kbd, chev, go, danger } = it;
          return (
            <button
              key={i}
              onClick={() => {
                if (go && onNavigate) onNavigate(go);
                onClose();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 14px',
                border: 'none',
                background: 'transparent',
                color: danger ? '#e05c4a' : 'var(--text-2)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-soft)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <Icon size={14} style={{ flexShrink: 0, opacity: danger ? 1 : 0.7 }} />
              <span style={{ flex: 1 }}>{label}</span>
              {kbd && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    fontFamily: 'var(--mono)',
                    background: 'var(--bg-soft)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  {kbd}
                </span>
              )}
              {chev && <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />}
            </button>
          );
        })}
      </div>
    </>
  );
}
