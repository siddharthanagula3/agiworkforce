import { useCallback, useEffect, useState } from 'react';
import {
  CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  isToolApprovalPolicy,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@agiworkforce/types';

import { fetchToolApprovalNamespace, savePreferenceNamespace } from '@/services/preferences';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useSettingsStore } from '@/stores/settingsStore';

export type ToolApprovalSyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

export interface ToolApprovalPolicySync {
  policy: ToolApprovalPolicy;
  autonomyForbidden: boolean;
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
    : CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY;
}

export function useToolApprovalPolicySync(): ToolApprovalPolicySync {
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const policy = useSettingsStore((state) => state.toolApprovalPolicy);
  const setToolApprovalPolicy = useSettingsStore((state) => state.setToolApprovalPolicy);

  const isCloud = appMode === 'cloud' && isClerkSignedIn;
  const [status, setStatus] = useState<ToolApprovalSyncStatus>(isCloud ? 'loading' : 'local');
  const [error, setError] = useState<string | null>(null);
  const [autonomyAllowed, setAutonomyAllowed] = useState<boolean | null>(null);

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
        const { settings, autonomousToolApprovalsAllowed } = await fetchToolApprovalNamespace(
          TOOL_APPROVAL_PREFERENCE_NAMESPACE,
        );
        if (cancelled) return;
        setAutonomyAllowed(autonomousToolApprovalsAllowed);
        setToolApprovalPolicy(storedPolicy({ [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: settings }));
        setStatus('synced');
      } catch (caught) {
        if (cancelled) return;
        setStatus('error');
        setError('Your approval default could not be loaded. Check your connection and try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCloud, setToolApprovalPolicy]);

  const autonomyForbidden = isCloud && autonomyAllowed === false;

  const select = useCallback(
    (next: ToolApprovalPolicy) => {
      if (next === 'autonomous' && autonomyForbidden) return;
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
            'Your approval default could not be saved. Check your connection and try again.',
          );
        });
    },
    [autonomyForbidden, isCloud, setToolApprovalPolicy],
  );

  const appliedPolicy =
    autonomyForbidden && policy === 'autonomous' ? DEFAULT_TOOL_APPROVAL_POLICY : policy;

  return { policy: appliedPolicy, autonomyForbidden, status, error, select };
}
