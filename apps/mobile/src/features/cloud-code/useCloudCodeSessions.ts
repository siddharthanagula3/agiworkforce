import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CloudCodeAvailability,
  CloudCodeRuntime,
  CloudCodeSession,
  CloudCodeSessionStatusFilter,
} from '@agiworkforce/types';
import { CLOUD_CODE_LIST_ERROR, cloudCodeApi, describeCloudCodeError } from './service';

export type CloudCodeListLoad = 'initial' | 'refresh' | 'background';

export interface CloudCodeSessionList {
  status: 'loading' | 'ready' | 'error';
  sessions: CloudCodeSession[];
  availability: CloudCodeAvailability | null;
  runtimes: CloudCodeRuntime[];
  error: string | null;
  refreshing: boolean;
}

const INITIAL_LIST: CloudCodeSessionList = {
  status: 'loading',
  sessions: [],
  availability: null,
  runtimes: [],
  error: null,
  refreshing: false,
};

export function useCloudCodeSessions(
  filter: CloudCodeSessionStatusFilter,
): CloudCodeSessionList & { load: (mode: CloudCodeListLoad) => Promise<void> } {
  const [list, setList] = useState<CloudCodeSessionList>(INITIAL_LIST);
  const generation = useRef(0);

  const load = useCallback(
    async (mode: CloudCodeListLoad) => {
      generation.current += 1;
      const current = generation.current;
      setList((previous) => ({
        ...previous,
        status: mode === 'initial' ? 'loading' : previous.status,
        refreshing: mode === 'refresh',
      }));
      try {
        const body = await cloudCodeApi.list(filter);
        if (current !== generation.current) return;
        setList({
          status: 'ready',
          sessions: body.sessions,
          availability: body.availability,
          runtimes: body.runtimes,
          error: null,
          refreshing: false,
        });
      } catch (error) {
        if (current !== generation.current) return;
        setList((previous) => ({
          ...previous,
          status: mode === 'initial' ? 'error' : previous.status,
          error: describeCloudCodeError(error, CLOUD_CODE_LIST_ERROR),
          refreshing: false,
        }));
      }
    },
    [filter],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  return { ...list, load };
}
