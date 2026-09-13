import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  isToolApprovalPolicy,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@agiworkforce/types';

import { fetchPreferenceNamespace, savePreferenceNamespace } from '@/services/preferences';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useSettingsStore } from '@/stores/settingsStore';

export type ToolApprovalSyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

export interface ToolApprovalPolicySync {
  policy: ToolApprovalPolicy;
  status: ToolApprovalSyncStatus;
  error: string | null;
  select: (policy: ToolApprovalPolicy) => void;
}

function storedPolicy(settings: unknown): ToolApprovalPolicy {
  const namespace = (settings as Record<string, unknown> | null)?.[
    TOOL_APPROVAL_PREFERENCE_NAMESPACE
  ] as ToolApprovalPreferences | undefined;
  return isToolApprovalPolicy(namespace?.defaultPolicy)
    ? namespace.defaultPolicy
    : DEFAULT_TOOL_APPROVAL_POLICY;
}

export function useToolApprovalPolicySync(): ToolApprovalPolicySync {
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const policy = useSettingsStore((state) => state.toolApprovalPolicy);
  const setToolApprovalPolicy = useSettingsStore((state) => state.setToolApprovalPolicy);

  const isCloud = appMode === 'cloud' && isClerkSignedIn;
  const [status, setStatus] = useState<ToolApprovalSyncStatus>(isCloud ? 'loading' : 'local');
  const [error, setError] = useState<string | null>(null);

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
        const settings = await fetchPreferenceNamespace(TOOL_APPROVAL_PREFERENCE_NAMESPACE);
        if (cancelled) return;
        setToolApprovalPolicy(storedPolicy({ [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: settings }));
        setStatus('synced');
      } catch (caught) {
        if (cancelled) return;
        setStatus('error');
        setError(
          caught instanceof Error ? caught.message : 'Your approval default could not be loaded.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCloud, setToolApprovalPolicy]);

  const select = useCallback(
    (next: ToolApprovalPolicy) => {
      const previous = useSettingsStore.getState().toolApprovalPolicy;
      setToolApprovalPolicy(next);
      if (!isCloud) return;

      setStatus('saving');
      setError(null);
      void savePreferenceNamespace<ToolApprovalPreferences>(TOOL_APPROVAL_PREFERENCE_NAMESPACE, {
        defaultPolicy: next,
      })
        .then(() => setStatus('synced'))
        .catch((caught: unknown) => {
          setToolApprovalPolicy(previous);
          setStatus('error');
          setError(
            caught instanceof Error ? caught.message : 'Your approval default could not be saved.',
          );
        });
    },
    [isCloud, setToolApprovalPolicy],
  );

  return { policy, status, error, select };
}
