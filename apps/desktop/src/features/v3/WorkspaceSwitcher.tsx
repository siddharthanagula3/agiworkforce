import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, UserRound, Users } from 'lucide-react';

import {
  getCloudOrganizationOverview,
  setActiveCloudWorkspace,
  type CloudWorkspaceMembership,
} from '../../api/cloudAccountSettings';
import { resolveDesktopChatOwnerId, useChatStore } from '../../stores/chat/chatStore';

export interface WorkspaceSwitcherProps {
  onManage: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; activeOrganizationId: string | null; workspaces: CloudWorkspaceMembership[] };

const ROW_STYLE: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '7px 14px',
  border: 'none',
  background: 'transparent',
  color: 'var(--chat-text-secondary)',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
};

export function WorkspaceSwitcher({ onManage }: WorkspaceSwitcherProps) {
  const { t } = useTranslation('v3');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [switching, setSwitching] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setState({ kind: 'loading' });
    try {
      const overview = await getCloudOrganizationOverview();
      if (generation.current !== current) return;
      setState({
        kind: 'ready',
        activeOrganizationId: overview.activeOrganizationId,
        workspaces: overview.workspaces,
      });
    } catch {
      if (generation.current === current) setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const select = useCallback(
    (organizationId: string | null) => {
      if (state.kind !== 'ready' || switching) return;
      if (state.activeOrganizationId === organizationId) return;
      setSwitching(true);
      void (async () => {
        try {
          await setActiveCloudWorkspace(organizationId);
          setState((previous) =>
            previous.kind === 'ready'
              ? { ...previous, activeOrganizationId: organizationId }
              : previous,
          );
          await useChatStore.getState().loadConversations(resolveDesktopChatOwnerId());
        } catch {
          await load();
        } finally {
          setSwitching(false);
        }
      })();
    },
    [load, state, switching],
  );

  const rows =
    state.kind === 'ready'
      ? [
          { id: null, name: t('accountMenu.workspacePersonal'), icon: UserRound },
          ...state.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            icon: Building2,
          })),
        ]
      : [];

  return (
    <div data-v3-workspace-switcher="">
      <div
        style={{
          padding: '8px 14px 4px',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--chat-text-muted)',
        }}
      >
        {t('accountMenu.workspace')}
      </div>

      {state.kind === 'loading' && (
        <div style={{ ...ROW_STYLE, cursor: 'default', color: 'var(--chat-text-muted)' }}>
          {t('accountMenu.workspaceLoading')}
        </div>
      )}

      {state.kind === 'error' && (
        <button type="button" onClick={() => void load()} style={ROW_STYLE}>
          {t('accountMenu.workspaceRetry')}
        </button>
      )}

      {rows.map((row) => {
        const Icon = row.icon;
        const selected = state.kind === 'ready' && state.activeOrganizationId === row.id;
        return (
          <button
            key={row.id ?? 'personal'}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            disabled={switching}
            onClick={() => select(row.id)}
            style={{ ...ROW_STYLE, opacity: switching && !selected ? 0.6 : 1 }}
          >
            <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.name}
            </span>
            {selected && <Check size={13} aria-label={t('accountMenu.workspaceSelected')} />}
          </button>
        );
      })}

      <button type="button" onClick={onManage} style={ROW_STYLE}>
        <Users size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span style={{ flex: 1 }}>{t('accountMenu.workspaceManage')}</span>
      </button>

      <div style={{ height: 1, background: 'var(--chat-border)', margin: '4px 0' }} />
    </div>
  );
}
