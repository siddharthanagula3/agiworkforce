import { useCallback, useEffect, useRef, useState } from 'react';
import { isCloudCodeEnvironmentsUnavailable } from '@agiworkforce/cloud-contracts';
import type { CloudCodeEnvironment } from '@agiworkforce/types';
import { networkAccessLabel } from './networkAccessOptions';
import { cloudCodeApi } from './service';

export const CLOUD_ENVIRONMENTS_SCREEN_TITLE = 'Cloud environments';
export const CLOUD_ENVIRONMENTS_LOAD_FAILED = 'Environments could not be loaded.';
export const CLOUD_ENVIRONMENT_DELETE_FAILED = 'The environment could not be deleted';

export function cloudEnvironmentVariablesLabel(count: number): string {
  return count === 1 ? '1 variable' : `${count} variables`;
}

export function describeCloudEnvironment(
  environment: Pick<CloudCodeEnvironment, 'networkAccess' | 'setupScript' | 'variableNames'>,
): string {
  const parts = [networkAccessLabel(environment.networkAccess)];
  if (environment.setupScript.trim()) parts.push('setup script');
  if (environment.variableNames.length > 0) {
    parts.push(cloudEnvironmentVariablesLabel(environment.variableNames.length));
  }
  return parts.join(' · ');
}

export function deleteEnvironmentConfirmation(name: string): { title: string; message: string } {
  return {
    title: `Delete ${name}?`,
    message:
      'Its settings and variables are removed for good. Sessions that are already running are not affected.',
  };
}

export type CloudEnvironmentsLoad =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; environments: CloudCodeEnvironment[]; limit: number };

export interface CloudEnvironments {
  load: CloudEnvironmentsLoad;
  retry: () => void;
  remove: (environmentId: string) => Promise<void>;
}

export function useCloudCodeEnvironments(): CloudEnvironments {
  const [load, setLoad] = useState<CloudEnvironmentsLoad>({ status: 'loading' });
  const request = useRef(0);
  const mounted = useRef(true);
  const current = useRef<CloudEnvironmentsLoad>(load);
  current.current = load;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = useCallback(async () => {
    const generation = ++request.current;
    try {
      const body = await cloudCodeApi.listEnvironments();
      if (generation !== request.current || !mounted.current) return;
      setLoad({ status: 'ready', environments: body.environments, limit: body.limit });
    } catch (error) {
      if (generation !== request.current || !mounted.current) return;
      setLoad(
        isCloudCodeEnvironmentsUnavailable(error) ? { status: 'unavailable' } : { status: 'error' },
      );
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    void read();
  }, [read]);

  const remove = useCallback(async (environmentId: string) => {
    request.current += 1;
    await cloudCodeApi.deleteEnvironment(environmentId);
    if (!mounted.current) return;
    setLoad((previous) =>
      previous.status === 'ready'
        ? {
            ...previous,
            environments: previous.environments.filter((entry) => entry.id !== environmentId),
          }
        : previous,
    );
  }, []);

  return { load, retry, remove };
}
