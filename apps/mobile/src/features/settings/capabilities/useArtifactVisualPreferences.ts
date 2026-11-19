import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';
import { patchPreferenceNamespace } from '@/services/preferences';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  CAPABILITIES_NAMESPACE,
  fetchArtifactVisualPreferences,
  type ArtifactVisualSwitch,
  type ArtifactVisualValues,
} from './artifactVisualPreferencesService';

export type ArtifactVisualStatus = 'loading' | 'ready' | 'unavailable';

const DEFAULT_VALUES: ArtifactVisualValues = { artifacts: true, inlineVisualizations: true };

export const useReportedArtifactVisualSwitches = create<{
  available: readonly ArtifactVisualSwitch[];
}>(() => ({ available: [] }));

export function useArtifactVisualPreferences(active: boolean) {
  const available = useReportedArtifactVisualSwitches((state) => state.available);
  const [values, setValues] = useState<ArtifactVisualValues>(DEFAULT_VALUES);
  const [status, setStatus] = useState<ArtifactVisualStatus>('loading');
  const [account, setAccount] = useState(captureCloudAccountEpoch);
  const writes = useRef<Record<ArtifactVisualSwitch, number>>({
    artifacts: 0,
    inlineVisualizations: 0,
  });
  const saved = useRef<ArtifactVisualValues | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeCloudAccountEpochChange(() => {
      saved.current = null;
      setValues(DEFAULT_VALUES);
      setStatus('loading');
      setAccount(captureCloudAccountEpoch());
    });
    setAccount((shown) => (isCloudAccountEpochCurrent(shown) ? shown : captureCloudAccountEpoch()));
    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!active || !account) return;
      const writesAtStart = { ...writes.current };
      let cancelled = false;
      fetchArtifactVisualPreferences(account)
        .then((read) => {
          if (cancelled || !isCloudAccountEpochCurrent(account)) return;
          saved.current = read.values;
          setValues((shown) => ({
            artifacts:
              writes.current.artifacts === writesAtStart.artifacts
                ? read.values.artifacts
                : shown.artifacts,
            inlineVisualizations:
              writes.current.inlineVisualizations === writesAtStart.inlineVisualizations
                ? read.values.inlineVisualizations
                : shown.inlineVisualizations,
          }));
          useReportedArtifactVisualSwitches.setState({ available: read.available });
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled || !isCloudAccountEpochCurrent(account)) return;
          setStatus((state) => (state === 'ready' ? state : 'unavailable'));
        });
      return () => {
        cancelled = true;
      };
    }, [active, account]),
  );

  const setValue = useCallback((key: ArtifactVisualSwitch, next: boolean) => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    writes.current[key] += 1;
    const write = writes.current[key];
    setValues((shown) => ({ ...shown, [key]: next }));
    patchPreferenceNamespace(
      CAPABILITIES_NAMESPACE,
      { [key]: next },
      { accountEpoch: account },
    ).then(
      () => {
        if (!isCloudAccountEpochCurrent(account)) return;
        saved.current = { ...(saved.current ?? DEFAULT_VALUES), [key]: next };
      },
      (error: unknown) => {
        if (isStaleCloudAccountOperation(error) || writes.current[key] !== write) return;
        if (!isCloudAccountEpochCurrent(account)) return;
        const restored = (saved.current ?? DEFAULT_VALUES)[key];
        setValues((shown) => ({ ...shown, [key]: restored }));
        Alert.alert(
          'Not saved',
          'This setting could not be saved to your account. Check your connection and try again.',
        );
      },
    );
  }, []);

  return { available, values, status, setValue };
}
