import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchWorkspaceOverview, type WorkspaceOverview } from './service';

export interface NewChatWorkspace {
  name: string;
  organization: boolean;
}

export function useNewChatWorkspace(
  enabled: boolean,
  personalLabel: string,
): NewChatWorkspace | null {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const controller = new AbortController();
      fetchWorkspaceOverview(controller.signal)
        .then(setOverview)
        .catch(() => setOverview(null));
      return () => controller.abort();
    }, [enabled]),
  );

  if (!enabled || !overview || overview.workspaces.length === 0) return null;
  const active = overview.workspaces.find(
    (workspace) => workspace.id === overview.activeWorkspaceId,
  );
  return active
    ? { name: active.name, organization: true }
    : { name: personalLabel, organization: false };
}
