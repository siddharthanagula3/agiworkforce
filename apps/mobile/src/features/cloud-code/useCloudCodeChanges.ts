import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloudCodeChanges, CloudCodePullRequestStatus } from '@agiworkforce/cloud-contracts';
import { cloudCodeApi, describeCloudCodeError } from './service';
import { CLOUD_CODE_CHANGES_COPY } from './presentation';

const CHANGES_ERROR = 'The changes could not be loaded';
const COMMIT_ERROR = 'The commit could not be pushed';
const DISCARD_ERROR = 'The changes could not be discarded';
const PULL_REQUEST_ERROR = 'The pull request could not be created';
const COMMAND_ERROR = 'The command could not be run';

export type CloudCodeChangesAction = 'commit' | 'discard' | 'pull-request' | 'command';

export interface CloudCodeChangesView {
  changes: CloudCodeChanges | null;
  loading: boolean;
  busy: CloudCodeChangesAction | null;
  error: string | null;
  notice: string | null;
  refresh: () => void;
  commit: (message: string, files: string[] | null) => Promise<boolean>;
  discard: (files: string[]) => void;
  createPullRequest: () => void;
  runCommand: (command: string) => Promise<boolean>;
  loadPullRequestStatus: () => Promise<CloudCodePullRequestStatus>;
  dismissError: () => void;
}

export function useCloudCodeChanges(
  sessionId: string,
  active: boolean,
  onSessionChanged: () => void,
): CloudCodeChangesView {
  const [changes, setChanges] = useState<CloudCodeChanges | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<CloudCodeChangesAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    generation.current += 1;
    const current = generation.current;
    setLoading(true);
    try {
      const body = await cloudCodeApi.changes(sessionId);
      if (!mounted.current || current !== generation.current) return;
      setChanges(body);
      setError(null);
    } catch (loadError) {
      if (!mounted.current || current !== generation.current) return;
      setError(describeCloudCodeError(loadError, CHANGES_ERROR));
    } finally {
      if (mounted.current && current === generation.current) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const perform = useCallback(
    async (action: CloudCodeChangesAction, run: () => Promise<void>, fallback: string) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(action);
      setError(null);
      setNotice(null);
      try {
        await run();
        return true;
      } catch (actionError) {
        if (mounted.current) setError(describeCloudCodeError(actionError, fallback));
        return false;
      } finally {
        inFlight.current = false;
        if (mounted.current) {
          setBusy(null);
          onSessionChanged();
          void load();
        }
      }
    },
    [load, onSessionChanged],
  );

  const commit = useCallback(
    (message: string, files: string[] | null) =>
      perform(
        'commit',
        async () => {
          const result = await cloudCodeApi.commit(sessionId, {
            message,
            ...(files ? { files } : {}),
          });
          if (!mounted.current) return;
          if (!result.push.ok) throw new Error(result.push.error ?? result.push.output);
          setNotice(CLOUD_CODE_CHANGES_COPY.commitPushed);
        },
        COMMIT_ERROR,
      ),
    [perform, sessionId],
  );

  const discard = useCallback(
    (files: string[]) => {
      void perform(
        'discard',
        async () => {
          await cloudCodeApi.discardChanges(sessionId, files);
        },
        DISCARD_ERROR,
      );
    },
    [perform, sessionId],
  );

  const createPullRequest = useCallback(() => {
    void perform(
      'pull-request',
      async () => {
        await cloudCodeApi.createPullRequest(sessionId);
      },
      PULL_REQUEST_ERROR,
    );
  }, [perform, sessionId]);

  const runCommand = useCallback(
    (command: string) =>
      perform(
        'command',
        async () => {
          await cloudCodeApi.run(sessionId, command);
        },
        COMMAND_ERROR,
      ),
    [perform, sessionId],
  );

  const loadPullRequestStatus = useCallback(
    () => cloudCodeApi.pullRequestStatus(sessionId),
    [sessionId],
  );

  const refresh = useCallback(() => void load(), [load]);
  const dismissError = useCallback(() => setError(null), []);

  return {
    changes,
    loading,
    busy,
    error,
    notice,
    refresh,
    commit,
    discard,
    createPullRequest,
    runCommand,
    loadPullRequestStatus,
    dismissError,
  };
}
