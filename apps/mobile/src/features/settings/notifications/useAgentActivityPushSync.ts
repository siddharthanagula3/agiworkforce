import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPreferenceNamespace, savePreferenceNamespace } from '@/services/preferences';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

export const ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE = 'notifications';

/**
 * Read by `apps/web/lib/services/agent-notification-service.ts` before it hands
 * an agent-run notice to Expo. It is opt-out: only an explicit `false` silences
 * agent-run push, and this screen is the only surface that writes it.
 */
export const AGENT_ACTIVITY_PUSH_PREFERENCE_KEY = 'mobilePushAgentActivity';

export type AgentActivityPushStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

interface AgentActivityPushSync {
  enabled: boolean;
  status: AgentActivityPushStatus;
  error: string | null;
  setEnabled: (value: boolean) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function useAgentActivityPushSync(): AgentActivityPushSync {
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const isCloud = appMode === 'cloud' && isClerkSignedIn;

  const [enabled, setEnabledState] = useState(true);
  const [status, setStatus] = useState<AgentActivityPushStatus>(isCloud ? 'loading' : 'local');
  const [error, setError] = useState<string | null>(null);
  const storedNamespace = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (!isCloud) {
      setStatus('local');
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const stored = asRecord(
          await fetchPreferenceNamespace(ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE),
        );
        if (cancelled) return;
        storedNamespace.current = stored;
        setEnabledState(stored[AGENT_ACTIVITY_PUSH_PREFERENCE_KEY] !== false);
        setStatus('synced');
      } catch (caught) {
        if (cancelled) return;
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'Could not load agent run push.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCloud]);

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      if (!isCloud) return;

      // The namespace is replaced wholesale by the settings route, so the
      // sibling keys web owns have to be written back with it.
      const next = { ...storedNamespace.current, [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: value };
      storedNamespace.current = next;
      setStatus('saving');
      setError(null);
      void savePreferenceNamespace(ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE, next)
        .then(() => setStatus('synced'))
        .catch((caught: unknown) => {
          setStatus('error');
          setError(caught instanceof Error ? caught.message : 'Could not save agent run push.');
        });
    },
    [isCloud],
  );

  return { enabled, status, error, setEnabled };
}
