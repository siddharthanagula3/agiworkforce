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
      } catch {
        if (cancelled) return;
        setStatus('error');
        setError('Could not load agent run notifications. Check your connection and try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCloud]);

  const setEnabled = useCallback(
    (value: boolean) => {
      const previousEnabled = enabled;
      setEnabledState(value);
      if (!isCloud) return;

      // The namespace is replaced wholesale by the settings route, so the
      // sibling keys web owns have to be written back with it.
      const previousNamespace = storedNamespace.current;
      const next = { ...previousNamespace, [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: value };
      storedNamespace.current = next;
      setStatus('saving');
      setError(null);
      void savePreferenceNamespace(ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE, next)
        .then(() => setStatus('synced'))
        .catch(() => {
          if (storedNamespace.current === next) {
            storedNamespace.current = previousNamespace;
            setEnabledState(previousEnabled);
          }
          setStatus('error');
          setError('Could not save agent run notifications. Check your connection and try again.');
        });
    },
    [enabled, isCloud],
  );

  return { enabled, status, error, setEnabled };
}
