'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type { LocalBranches } from '@agiworkforce/local-runtime-contract';
import { listLocalBranches, pushLocalBranch } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY } from '../code-surface';
import { LOCAL_CODE_COPY, localPullRequestLabel } from '../local-code';
import {
  openLocalPullRequest,
  readLocalPullRequest,
  type LocalPullRequestLookup,
  type LocalPullRequestState,
} from '../services/local-pull-request-api';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const read = await listLocalBranches(rootId);
      setBranches(read);
      if (read?.remoteUrl && read.current) {
        setLookup(
          await readLocalPullRequest({
            remoteUrl: read.remoteUrl,
            head: read.current,
            base: read.baseBranch,
          }),
        );
      }
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.pullRequestReadFailed));
    }
  }, [rootId]);

  useEffect(() => {
    setOpened(null);
    setLookup(null);
    void load();
  }, [load, refreshKey]);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const pushed = await pushLocalBranch(rootId);
      if (!pushed.baseBranch) throw new Error(LOCAL_CODE_COPY.pullRequestNoBase);
      setOpened(
        await openLocalPullRequest({
          remoteUrl: pushed.remoteUrl,
          head: pushed.branch,
          base: pushed.baseBranch,
          title,
        }),
      );
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.pullRequestOpenFailed));
    } finally {
      setBusy(false);
    }
  };

  const pullRequest = opened ?? lookup?.pullRequest ?? null;
  const onBase = Boolean(branches?.current) && branches?.current === branches?.baseBranch;

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
            onClick={() => void open()}
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
    </div>
  );
}
