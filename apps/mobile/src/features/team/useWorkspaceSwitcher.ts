import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConversationMenuState } from '@/src/features/conversation-actions';
import { fetchWorkspaceOverview, type WorkspaceOverview } from './service';
import { switchWorkspace } from './switchWorkspace';

export interface WorkspaceSwitcher {
  activeName: string | null;
  open: () => void;
  menu: ConversationMenuState;
}

export function useWorkspaceSwitcher(enabled: boolean, personalLabel: string): WorkspaceSwitcher {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    fetchWorkspaceOverview(signal)
      .then(setOverview)
      .catch(() => {
        if (!signal?.aborted) setOverview(null);
      });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const close = useCallback(() => setMenuOpen(false), []);
  const open = useCallback(() => setMenuOpen(true), []);

  const workspaces = useMemo(
    () => (enabled ? (overview?.workspaces ?? []) : []),
    [enabled, overview],
  );
  const hasWorkspaces = workspaces.length > 0;
  const activeId = overview?.activeWorkspaceId ?? null;
  const activeName = hasWorkspaces
    ? (workspaces.find((workspace) => workspace.id === activeId)?.name ?? personalLabel)
    : null;

  const menu = useMemo<ConversationMenuState>(() => {
    const choose = (organizationId: string | null) => () => {
      if (organizationId === activeId) return;
      void switchWorkspace(organizationId).then((switched) => {
        if (switched) load();
      });
    };
    return {
      visible: menuOpen && hasWorkspaces,
      title: 'Switch workspace',
      close,
      actions: hasWorkspaces
        ? [
            {
              key: 'workspace-personal',
              label: personalLabel,
              selected: activeId === null,
              run: choose(null),
            },
            ...workspaces.map((workspace) => ({
              key: `workspace-${workspace.id}`,
              label: workspace.name,
              selected: workspace.id === activeId,
              run: choose(workspace.id),
            })),
          ]
        : [],
    };
  }, [activeId, close, hasWorkspaces, load, menuOpen, personalLabel, workspaces]);

  return { activeName, open, menu };
}
