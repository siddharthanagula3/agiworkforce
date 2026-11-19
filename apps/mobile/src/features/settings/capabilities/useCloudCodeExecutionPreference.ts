import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchPreferenceNamespace, patchPreferenceNamespace } from '@/services/preferences';
import { useTierStore } from '@/src/features/billing/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatViewStore } from '@/stores/chat/chatViewStore';

const CAPABILITIES_NAMESPACE = 'capabilities';
const CODE_EXECUTION_KEY = 'cloudCodeExecution';

export type CloudCodeExecutionStatus = 'loading' | 'ready' | 'unavailable';

export function useCloudCodeExecutionPreference(active: boolean) {
  const enabled = useChatViewStore((state) => state.features.codeExecution);
  const [status, setStatus] = useState<CloudCodeExecutionStatus>('loading');
  const [account, setAccount] = useState(captureCloudAccountEpoch);
  const writes = useRef(0);
  const saved = useRef<boolean | null>(null);
  const saving = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeCloudAccountEpochChange(() => {
      saved.current = null;
      setStatus('loading');
      setAccount(captureCloudAccountEpoch());
    });
    setAccount((shown) => (isCloudAccountEpochCurrent(shown) ? shown : captureCloudAccountEpoch()));
    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!active || !account) return;
      const writesAtStart = writes.current;
      let cancelled = false;
      fetchPreferenceNamespace(CAPABILITIES_NAMESPACE, { accountEpoch: account })
        .then((settings) => {
          if (cancelled || !isCloudAccountEpochCurrent(account)) return;
          if (writes.current === writesAtStart) {
            const stored = (settings as Record<string, unknown>)[CODE_EXECUTION_KEY] !== false;
            saved.current = stored;
            useChatViewStore.getState().setFeature('codeExecution', stored);
          }
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled || !isCloudAccountEpochCurrent(account)) return;
          setStatus((current) => (current === 'ready' ? current : 'unavailable'));
        });
      return () => {
        cancelled = true;
      };
    }, [active, account]),
  );

  const setEnabled = useCallback((next: boolean) => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const previous = useChatViewStore.getState().features.codeExecution;
    const { setFeature } = useChatViewStore.getState();
    writes.current += 1;
    const write = writes.current;
    setFeature('codeExecution', next);
    const save = (): Promise<void> => {
      if (writes.current !== write) return Promise.resolve();
      return patchPreferenceNamespace(
        CAPABILITIES_NAMESPACE,
        { [CODE_EXECUTION_KEY]: next },
        { accountEpoch: account },
      ).then(
        () => {
          saved.current = next;
          if (writes.current === write && isCloudAccountEpochCurrent(account)) {
            setFeature('codeExecution', next);
          }
          void useTierStore.getState().refreshTier();
        },
        (error: unknown) => {
          if (isStaleCloudAccountOperation(error) || writes.current !== write) return;
          setFeature('codeExecution', saved.current ?? previous);
          Alert.alert(
            'Not saved',
            'This setting could not be saved to your account. Check your connection and try again.',
          );
        },
      );
    };
    const earlier = saving.current;
    const current = earlier ? earlier.then(save) : save();
    saving.current = current;
    void current.finally(() => {
      if (saving.current === current) saving.current = null;
    });
  }, []);

  return { enabled, status, setEnabled };
}
