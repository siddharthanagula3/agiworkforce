'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, Square, TerminalSquare } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type { DeveloperSession, DeveloperSessionGroup } from '@agiworkforce/local-runtime-contract';
import { CODE_LIMITS } from '../code-surface';
import {
  LOCAL_CODE_COPY,
  localApprovalPrompts,
  localSessionContext,
  localTranscriptItems,
  localTurnIsRunning,
} from '../local-code';
import { useLocalSession } from '../hooks/use-local-session';
import { CodeTranscriptBody } from './CodeTranscript';
import styles from '../CloudCodePage.module.css';

const HEADER_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const SUBMIT_KEY = 'Enter';

export interface LocalSessionPanelProps {
  session: DeveloperSession;
  group: Pick<DeveloperSessionGroup, 'name' | 'branch'>;
  verbose: boolean;
  onClose: () => void;
}

export function LocalSessionPanel({ session, group, verbose, onClose }: LocalSessionPanelProps) {
  const state = useLocalSession(session);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const running = localTurnIsRunning(state.turn);
  const busy = running || state.sending;
  const items = localTranscriptItems(state.messages, state.turn, session.provider);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length, state.turn.reply]);

  const submit = () => {
    const text = draft.trim();
    if (text === '' || busy) return;
    setDraft('');
    void state.send(text);
  };

  return (
    <>
      <header className={styles['header']}>
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={LOCAL_CODE_COPY.back}
          onClick={onClose}
        >
          <ChevronLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
        </button>
        <span className={styles['headerGlyph']}>
          <TerminalSquare size={HEADER_GLYPH_SIZE} aria-hidden="true" />
        </span>
        <h1 className={styles['headerTitle']}>{session.title}</h1>
        <span className={styles['headerChip']}>
          <span className={styles['headerChipText']}>{localSessionContext(session, group)}</span>
        </span>
      </header>

      <div className={styles['body']}>
        <div className={styles['column']}>
          <div className={styles['scroll']} data-testid="local-code-scroll">
            <div className={styles['center']}>
              {state.loading && (
                <div className={styles['notice']} role="status">
                  <Spinner size="sm" aria-label={LOCAL_CODE_COPY.openingSession} />
                  <span>{LOCAL_CODE_COPY.openingSession}</span>
                </div>
              )}

              {state.truncated && (
                <p className={styles['statusLine']}>{LOCAL_CODE_COPY.transcriptTruncated}</p>
              )}

              {!state.loading && (
                <CodeTranscriptBody
                  items={items}
                  approvals={localApprovalPrompts(state.approval)}
                  busy={busy}
                  busySince={running ? session.updatedAt : null}
                  verbose={verbose}
                  onDecideApproval={(_prompt, decision) =>
                    void state.decideApproval(decision === 'approve')
                  }
                  onRetryTask={(goal) => void state.send(goal)}
                />
              )}

              <div ref={endRef} />
            </div>
          </div>

          <div className={styles['noticeArea']}>
            <div className={styles['center']}>
              {state.error !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{state.error}</span>
                </div>
              )}
            </div>
          </div>

          <div className={styles['composerArea']} data-testid="local-code-composer">
            <div className={styles['center']}>
              <div className={`${styles['field']} ${focused ? styles['fieldFocused'] : ''}`}>
                <div className={styles['fieldRow']}>
                  <textarea
                    className={styles['input']}
                    value={draft}
                    rows={1}
                    maxLength={CODE_LIMITS.task}
                    placeholder={LOCAL_CODE_COPY.composerPlaceholder}
                    aria-label={LOCAL_CODE_COPY.composerPlaceholder}
                    onChange={(event) => setDraft(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(event) => {
                      if (event.key !== SUBMIT_KEY || event.shiftKey) return;
                      event.preventDefault();
                      submit();
                    }}
                  />
                  {running ? (
                    <button
                      type="button"
                      className={styles['sendButton']}
                      disabled={state.stopping}
                      aria-label={state.stopping ? LOCAL_CODE_COPY.stopping : LOCAL_CODE_COPY.stop}
                      onClick={() => void state.stop()}
                    >
                      {state.stopping ? (
                        <Spinner size="sm" aria-hidden="true" />
                      ) : (
                        <Square size={SEND_GLYPH_SIZE} aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles['sendButton']}
                      disabled={draft.trim() === '' || busy}
                      aria-label={LOCAL_CODE_COPY.send}
                      onClick={submit}
                    >
                      {state.sending ? (
                        <Spinner size="sm" aria-hidden="true" />
                      ) : (
                        <ArrowUp size={SEND_GLYPH_SIZE} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
