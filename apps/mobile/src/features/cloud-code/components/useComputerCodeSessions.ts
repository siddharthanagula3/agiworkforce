import { useCallback, useEffect, useMemo } from 'react';
import type { RemoteCodeRoot, RemoteCodeSessionSummary } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { listCodeSessions } from '@/src/features/companion/remote-code/service';
import { useRemoteCodeStore } from '@/src/features/companion/remote-code/store';
import { useConnectionStore } from '@/stores/connectionStore';

const NO_SESSIONS: RemoteCodeSessionSummary[] = [];

export interface ComputerCodeSessions {
  sessions: readonly RemoteCodeSessionSummary[];
  /** The folders on the connected computer that can run a new session now. */
  folders: readonly RemoteCodeRoot[];
  connected: boolean;
  computerName: string | null;
  waiting: boolean;
  refresh: () => void;
}

function listsCodeSessions(metadata: Record<string, unknown> | null): boolean {
  const capabilities = metadata?.['capabilities'];
  return Array.isArray(capabilities) && capabilities.includes('code-sessions');
}

export function useComputerCodeSessions(): ComputerCodeSessions {
  const status = useConnectionStore((state) => state.status);
  const computerName = useConnectionStore((state) => state.desktopName);
  const offersSessions = useConnectionStore((state) => listsCodeSessions(state.desktopMetadata));
  const stored = useRemoteCodeStore((state) => state.sessions);
  const roots = useRemoteCodeStore((state) => state.roots);
  const syncedAt = useRemoteCodeStore((state) => state.sessionsSyncedAt);
  const enabled = FEATURES.companion && offersSessions;
  const connected = status === 'connected';

  const refresh = useCallback(() => {
    if (enabled && useConnectionStore.getState().status === 'connected') void listCodeSessions();
  }, [enabled]);

  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  const folders = useMemo(
    () => (enabled && connected ? roots.filter((root) => root.available) : []),
    [connected, enabled, roots],
  );

  return {
    sessions: enabled ? stored : NO_SESSIONS,
    folders,
    connected,
    computerName,
    waiting: enabled && connected && syncedAt === null,
    refresh,
  };
}
