'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe, Share2, TerminalSquare } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { cloudCodeRepositoryLabel, type CloudCodeSharedSession } from '@agiworkforce/types';
import {
  buildCodeTranscript,
  toCodeTurnRecord,
  type CloudCodeApi,
} from '@agiworkforce/cloud-contracts';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { formatRelativeTime } from '@shared/utils/format';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY, CODE_ROUTES } from './code-surface';
import { CodeTranscriptBody } from './components/CodeTranscript';
import { cloudCodeApi } from './services/cloud-code-api';
import styles from './CloudCodePage.module.css';

const HEADER_GLYPH_SIZE = 16;
const BADGE_GLYPH_SIZE = 13;

type SharedState =
  | { status: 'loading' }
  | { status: 'ready'; shared: CloudCodeSharedSession }
  | { status: 'error'; message: string };

export interface SharedCodeSessionPageProps {
  token: string;
  api?: CloudCodeApi;
}

export function SharedCodeSessionPage({ token, api = cloudCodeApi }: SharedCodeSessionPageProps) {
  const [state, setState] = useState<SharedState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    api
      .openShared(token, controller.signal)
      .then((shared) => setState({ status: 'ready', shared }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: toUserMessage(error, CODE_COPY.sharedUnavailable) });
      });
    return () => controller.abort();
  }, [api, token]);

  const items = useMemo(
    () =>
      state.status === 'ready'
        ? buildCodeTranscript(
            state.shared.terminalEntries,
            state.shared.turns.map((turn) => ({ ...toCodeTurnRecord(turn), retryable: false })),
          )
        : [],
    [state],
  );

  const shared = state.status === 'ready' ? state.shared : null;

  return (
    <WebAppShell>
      <div className={styles['surface']}>
        <div className={styles['main']}>
          <header className={styles['header']}>
            <span className={styles['headerGlyph']}>
              <TerminalSquare size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            </span>
            <h1 className={styles['headerTitle']}>{shared ? shared.title : CODE_COPY.surface}</h1>
            {shared?.repositoryUrl && (
              <span className={styles['headerChip']}>
                <span className={styles['headerChipText']}>
                  {cloudCodeRepositoryLabel(shared.repositoryUrl)}
                  {shared.workingBranch ? ` · ${shared.workingBranch}` : ''}
                </span>
              </span>
            )}
            {shared && (
              <span className={styles['headerChip']}>
                {shared.visibility === 'team' ? (
                  <Share2 size={BADGE_GLYPH_SIZE} aria-hidden="true" />
                ) : (
                  <Globe size={BADGE_GLYPH_SIZE} aria-hidden="true" />
                )}
                <span className={styles['headerChipText']}>
                  {shared.visibility === 'team' ? CODE_COPY.sharedTeam : CODE_COPY.sharedPublic}
                </span>
              </span>
            )}
            <div className={styles['headerActions']}>
              <Link className={styles['secondaryButton']} href={CODE_ROUTES.root}>
                {CODE_COPY.sharedOpenCode}
              </Link>
            </div>
          </header>

          <div className={styles['body']}>
            <div className={styles['column']}>
              <div className={styles['scroll']}>
                <div className={styles['center']}>
                  {state.status === 'loading' && (
                    <div className={styles['notice']} role="status">
                      <Spinner size="sm" aria-label={CODE_COPY.sharedLoading} />
                      <span>{CODE_COPY.sharedLoading}</span>
                    </div>
                  )}

                  {state.status === 'error' && (
                    <div className={`${styles['notice']} ${styles['noticeError']}`} role="alert">
                      <span>{state.message}</span>
                    </div>
                  )}

                  {shared && (
                    <>
                      <p className={styles['statusLine']}>
                        {`${CODE_COPY.sharedSnapshot} ${CODE_COPY.sharedUpdated} ${formatRelativeTime(shared.updatedAt)}.`}
                      </p>
                      {items.length === 0 ? (
                        <p className={styles['statusLine']}>{CODE_COPY.sharedEmpty}</p>
                      ) : (
                        <CodeTranscriptBody
                          items={items}
                          approvals={[]}
                          busy={false}
                          busySince={null}
                          verbose={false}
                          onDecideApproval={() => undefined}
                          onRetryTask={() => undefined}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WebAppShell>
  );
}
