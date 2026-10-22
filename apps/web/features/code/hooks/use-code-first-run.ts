'use client';

import { useEffect, useState } from 'react';
import type { CloudCodeApi } from '@agiworkforce/cloud-contracts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

export type CodeFirstRunState = 'idle' | 'checking' | 'show' | 'hide';

const NO_INSTALLATIONS = 0;

export function useCodeFirstRun(
  enabled: boolean,
  api: CloudCodeApi,
): { state: CodeFirstRunState; finish: () => void } {
  const completed = useSettingsStore((store) => store.codeFirstRunCompleted);
  const setCompleted = useSettingsStore((store) => store.setCodeFirstRunCompleted);
  const active = enabled && !completed;
  const [state, setState] = useState<CodeFirstRunState>(active ? 'checking' : 'idle');

  useEffect(() => {
    if (!active) {
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setState('checking');

    void Promise.all([
      api.list('all', controller.signal),
      api.listRepositories(undefined, controller.signal),
    ])
      .then(([sessions, repositories]) => {
        if (controller.signal.aborted) return;
        const alreadySetUp =
          sessions.sessions.length > 0 || repositories.installationCount > NO_INSTALLATIONS;
        if (alreadySetUp) {
          setCompleted(true);
          setState('hide');
          return;
        }
        const { availability } = sessions;
        setState(availability.deploymentEnabled && availability.planEntitled ? 'show' : 'hide');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState('hide');
      });

    return () => controller.abort();
  }, [active, api, setCompleted]);

  return {
    state: active ? state : 'idle',
    finish: () => setCompleted(true),
  };
}
