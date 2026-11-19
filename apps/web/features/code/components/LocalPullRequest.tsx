'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type { LocalBranches } from '@agiworkforce/local-runtime-contract';
import { listLocalBranches, pushLocalBranch } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY, githubInstallHref } from '../code-surface';
import { LOCAL_CODE_COPY, localPullRequestLabel } from '../local-code';
import {
  LocalPullRequestRequestError,
  openLocalPullRequest,
  readLocalPullRequest,
  type LocalPullRequestLookup,
  type LocalPullRequestState,
} from '../services/local-pull-request-api';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const CHECKS_POLL_MS = 30_000;

export interface LocalPullRequestProps {
  rootId: string;
  title: string;
  refreshKey: number;
}

export function LocalPullRequest({ rootId, title, refreshKey }: LocalPullRequestProps) {
  const [branches, setBranches] = useState<LocalBranches | null>(null);
  const [lookup, setLookup] = useState<LocalPullRequestLookup | null>(null);
  const [opened, setOpened] = useState<LocalPullRequestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectGitHub, setReconnectGitHub] = useState(false);

  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    loadSequence.current += 1;
    const sequence = loadSequence.current;
    const isCurrent = () => loadSequence.current === sequence;
    setError(null);
    try {
      const read = await listLocalBranches(rootId);
      if (!isCurrent()) return;
      setBranches(read);
      setLookup(null);
      if (read?.remoteUrl && read.current) {
        const found = await readLocalPullRequest({
          remoteUrl: read.remoteUrl,
          head: read.current,
          base: read.baseBranch,
        });
        if (isCurrent()) setLookup(found);
      }
    } catch (cause: unknown) {
      if (isCurrent()) setError(toUserMessage(cause, LOCAL_CODE_COPY.pullRequestReadFailed));
    }
  }, [rootId]);

  useEffect(() => {
    setOpened(null);
    setLookup(null);
    void load();
    return () => {
      loadSequence.current += 1;
    };
  }, [load, refreshKey]);

  const open = async (createBranch: boolean) => {
    setBusy(true);
    setError(null);
    setReconnectGitHub(false);
    try {
      const pushed = await pushLocalBranch(rootId, createBranch ? title : undefined);
      if (!pushed.baseBranch) throw new Error(LOCAL_CODE_COPY.pullRequestNoBase);
      setOpened(
        await openLocalPullRequest({
          remoteUrl: pushed.remoteUrl,
          head: pushed.branch,
          base: pushed.baseBranch,
          title,
        }),
      );
      if (createBranch) setBranches(await listLocalBranches(rootId));
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.pullRequestOpenFailed));
      setReconnectGitHub(cause instanceof LocalPullRequestRequestError && cause.reconnectGitHub);
    } finally {
      setBusy(false);
    }
  };

  const pullRequest = opened ?? lookup?.pullRequest ?? null;
  const checksRunning =
    pullRequest !== null &&
    pullRequest.checks === 'pending' &&
    (pullRequest.state === 'open' || pullRequest.state === 'draft');

  useEffect(() => {
    if (!checksRunning) return undefined;
    const timer = window.setTimeout(() => {
      setOpened(null);
      void load();
    }, CHECKS_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [checksRunning, load, lookup]);

  const onBase = Boolean(branches?.current) && branches?.current === branches?.baseBranch;

  if (branches !== null && branches.remoteUrl && !branches.current && pullRequest === null) {
    return (
      <div className={styles['pullRequestBlock']}>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={busy || !branches.baseBranch}
          onClick={() => void open(true)}
        >
          {busy && <Spinner size="sm" aria-hidden="true" />}
          {busy ? CODE_COPY.creatingPullRequest : LOCAL_CODE_COPY.createBranchAndOpenPullRequest}
        </button>
        <span className={styles['formHelp']}>
          {branches.baseBranch
            ? LOCAL_CODE_COPY.pullRequestDetached
            : LOCAL_CODE_COPY.pullRequestNoBase}
        </span>
        {error !== null && (
          <span className={styles['formHelp']} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  if (branches === null || !branches.remoteUrl || !branches.current) {
    return error !== null ? (
      <div className={styles['pullRequestBlock']}>
        <span className={styles['formHelp']} role="alert">
          {error}
        </span>
      </div>
    ) : null;
  }

  return (
    <div className={styles['pullRequestBlock']}>
      {pullRequest ? (
        <a
          className={`${styles['chip']} ${styles['chipSet']}`}
          href={pullRequest.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={GLYPH_SIZE} aria-hidden="true" />
          <span>{localPullRequestLabel(pullRequest)}</span>
        </a>
      ) : lookup && !lookup.connected ? (
        <>
          <a
            className={styles['secondaryButton']}
            href={lookup.compareUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={GLYPH_SIZE} aria-hidden="true" />
            <span>{LOCAL_CODE_COPY.pullRequestOnGitHub}</span>
          </a>
          <span className={styles['formHelp']}>{LOCAL_CODE_COPY.pullRequestNotConnected}</span>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={busy || onBase || lookup === null}
            onClick={() => void open(false)}
          >
            {busy && <Spinner size="sm" aria-hidden="true" />}
            {busy ? CODE_COPY.creatingPullRequest : LOCAL_CODE_COPY.pushAndOpenPullRequest}
          </button>
          {onBase && (
            <span className={styles['formHelp']}>{LOCAL_CODE_COPY.pullRequestOnBase}</span>
          )}
        </>
      )}
      {error !== null && (
        <span className={styles['formHelp']} role="alert">
          {error}
        </span>
      )}
      {error !== null && reconnectGitHub && (
        <a className={styles['secondaryButton']} href={githubInstallHref()}>
          {CODE_COPY.githubReauthorizeAction}
        </a>
      )}
    </div>
  );
}
