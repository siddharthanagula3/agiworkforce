import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';
import { patchPreferenceNamespace } from '@/services/preferences';
import { fetchConnectorDirectory } from '@/services/connectors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { CAPABILITIES_NAMESPACE } from './artifactVisualPreferencesService';
import {
  DEFAULT_TOOL_ACCESS_MODE,
  TOOL_ACCESS_KEY,
  fetchToolAccessPreference,
  type ToolAccessMode,
} from './toolAccessPreferenceService';

export type ToolAccessStatus = 'loading' | 'ready' | 'unavailable';
export type ToolAccessConnectors = 'loading' | 'none' | 'connected' | 'unknown';

export const useReportedToolAccess = create<{ available: boolean }>(() => ({
  available: false,
}));

export function useToolAccessPreference(active: boolean) {
  const available = useReportedToolAccess((state) => state.available);
  const [mode, setShownMode] = useState<ToolAccessMode>(DEFAULT_TOOL_ACCESS_MODE);
  const [status, setStatus] = useState<ToolAccessStatus>('loading');
  const [connectors, setConnectors] = useState<ToolAccessConnectors>('loading');
  const [account, setAccount] = useState(captureCloudAccountEpoch);
  const writes = useRef(0);
  const saved = useRef<ToolAccessMode | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeCloudAccountEpochChange(() => {
      saved.current = null;
      setShownMode(DEFAULT_TOOL_ACCESS_MODE);
      setStatus('loading');
      setConnectors('loading');
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
      const current = () => !cancelled && isCloudAccountEpochCurrent(account);
      fetchToolAccessPreference(account)
        .then((read) => {
          if (!current()) return;
          useReportedToolAccess.setState({ available: read.available });
          if (writes.current === writesAtStart) {
            saved.current = read.mode;
            setShownMode(read.mode);
          }
          setStatus('ready');
          if (!read.available) return;
          fetchConnectorDirectory().then(
            (directory) => {
              if (!current()) return;
              setConnectors(directory.connectors.length > 0 ? 'connected' : 'none');
            },
            () => {
              if (!current()) return;
              setConnectors((state) => (state === 'loading' ? 'unknown' : state));
            },
          );
        })
        .catch(() => {
          if (!current()) return;
          setStatus((state) => (state === 'ready' ? state : 'unavailable'));
        });
      return () => {
        cancelled = true;
      };
    }, [active, account]),
  );

  const setMode = useCallback(
    (next: ToolAccessMode) => {
      if (next === mode) return;
      const account = captureCloudAccountEpoch();
      if (!account) return;
      writes.current += 1;
      const write = writes.current;
      setShownMode(next);
      patchPreferenceNamespace(
        CAPABILITIES_NAMESPACE,
        { [TOOL_ACCESS_KEY]: next },
        { accountEpoch: account },
      ).then(
        () => {
          if (!isCloudAccountEpochCurrent(account)) return;
          saved.current = next;
        },
        (error: unknown) => {
          if (isStaleCloudAccountOperation(error) || writes.current !== write) return;
          if (!isCloudAccountEpochCurrent(account)) return;
          setShownMode(saved.current ?? DEFAULT_TOOL_ACCESS_MODE);
          Alert.alert(
            'Not saved',
            'This setting could not be saved to your account. Check your connection and try again.',
          );
        },
      );
    },
    [mode],
  );

  return { available, mode, status, connectors, setMode };
}
