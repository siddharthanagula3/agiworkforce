import { useTranslation } from 'react-i18next';
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
import { useUnifiedAuthStore } from '../../stores/auth';
import { useSettingsDialogStore } from '../../stores/settingsStore';

type MenuItemDef =
  | { kind: 'header'; label: string; sub?: string }
  | { kind: 'divider' }
  | {
      kind: 'item';
      icon: React.ElementType;
      label: string;
      kbd?: string;
      chev?: boolean;
      action?: () => void;
      danger?: boolean;
    };

export interface AccountMenuProps {
  onClose: () => void;
}

export function AccountMenu({ onClose }: AccountMenuProps) {
  const { t } = useTranslation('v3');
  const user = useUnifiedAuthStore((s) => s.user);
  const planDisplayName = useUnifiedAuthStore((s) => s.planDisplayName);
  const signOut = useUnifiedAuthStore((s) => s.signOut);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  const displayLabel = user?.name || user?.email || t('accountMenu.accountFallback');
  const emailSub = user?.name && user?.email ? user.email : undefined;

  const items: MenuItemDef[] = [
    { kind: 'header', label: displayLabel, sub: emailSub },
    {
      kind: 'item',
      icon: Settings,
      label: t('accountMenu.settings'),
      kbd: '⌘,',
      action: () => {
        openSettings();
        onClose();
      },
    },
    { kind: 'item', icon: Globe, label: t('accountMenu.language'), chev: true },
    {
      kind: 'item',
      icon: Lock,
      label: t('accountMenu.privacySecurity'),
      action: () => {
        openSettings('account');
        onClose();
      },
    },
    { kind: 'divider' },
    {
      kind: 'item',
      icon: Sparkles,
      label: `${t('accountMenu.viewAllPlans')}${planDisplayName ? ` · ${planDisplayName}` : ''}`,
      action: () => {
        openSettings('billing');
        onClose();
      },
    },
    {
      kind: 'item',
      icon: Cpu,
      label: t('accountMenu.byokLocal'),
      action: () => {
        openSettings('models-keys');
        onClose();
      },
    },
    { kind: 'item', icon: Box, label: t('accountMenu.appsExtensions'), chev: true },
    { kind: 'item', icon: Mail, label: t('accountMenu.giftAGI'), chev: true },
    {
      kind: 'item',
      icon: HelpCircle,
      label: t('accountMenu.helpSupport'),
      action: () => {
        window.open('https://agiworkforce.com/docs', '_blank', 'noopener,noreferrer');
        onClose();
      },
    },
    { kind: 'divider' },
    {
      kind: 'item',
      icon: LogOut,
      label: t('accountMenu.logOut'),
      danger: true,
      action: () => {
        void signOut();
        onClose();
      },
    },
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
                  borderBottom: '1px solid var(--border)',
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-1)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.label}
                </div>
                {it.sub && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-3)',
                      fontFamily: 'var(--mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}
                  >
                    {it.sub}
                  </div>
                )}
              </div>
            );
          }
          if (it.kind === 'divider') {
            return (
              <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            );
          }
          const { icon: Icon, label, kbd, chev, action, danger } = it;
          return (
            <button
              key={i}
              onClick={action}
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
