'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, Square, TerminalSquare } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type {
  DeveloperRuntimeModels,
  LocalDeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import { CODE_LIMITS } from '../code-surface';
import {
  LOCAL_CODE_COPY,
  LOCAL_FAILURE_ACTION_LABELS,
  localApprovalPrompts,
  localFailureAction,
  localModelChoices,
  localModelLabel,
  localModelSetup,
  localProviderSetups,
  localSessionContext,
  startingModelId,
  localTranscriptItems,
  localTurnIsRunning,
  type LocalFailureAction,
} from '../local-code';
import { useLocalSession, type LocalSessionState } from '../hooks/use-local-session';
import { LocalModelChip } from './LocalModelChip';
import { CodeTranscriptBody } from './CodeTranscript';
import styles from '../CloudCodePage.module.css';

const HEADER_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const SUBMIT_KEY = 'Enter';

export interface LocalSessionPanelProps {
  session: LocalDeveloperSession;
  group: Pick<DeveloperSessionGroup, 'name' | 'branch' | 'sessions'>;
  runtimeModels: DeveloperRuntimeModels | null;
  verbose: boolean;
  /** The task typed into the main composer, which opened this session. */
  initialPrompt?: string;
  onPromptSent?: () => void;
  onClose: () => void;
}

function FailureAction({
  action,
  onRetry,
}: {
  action: NonNullable<LocalFailureAction>;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (action.kind === 'copy') {
    return (
      <button
        type="button"
        className={styles['secondaryButton']}
        onClick={() => {
          void navigator.clipboard.writeText(action.text).then(() => setCopied(true));
        }}
      >
        {copied ? LOCAL_FAILURE_ACTION_LABELS.copied : LOCAL_FAILURE_ACTION_LABELS.copy}
      </button>
    );
  }

  return (
    <button type="button" className={styles['secondaryButton']} onClick={onRetry}>
      {LOCAL_FAILURE_ACTION_LABELS.retry}
    </button>
  );
}

function CopyOffer({
  offer,
  className,
}: {
  offer: NonNullable<LocalFailureAction>;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (offer.kind !== 'copy') return null;

  return (
    <button
      type="button"
      className={className ?? styles['secondaryButton']}
      onClick={() => {
        void navigator.clipboard.writeText(offer.text).then(() => setCopied(true));
      }}
    >
      {copied ? LOCAL_FAILURE_ACTION_LABELS.copied : LOCAL_FAILURE_ACTION_LABELS.copy}
    </button>
  );
}

export function LocalSessionPanel({
  session,
  group,
  runtimeModels,
  verbose,
  initialPrompt,
  onPromptSent,
  onClose,
}: LocalSessionPanelProps) {
  const state = useLocalSession(session);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [model, setModel] = useState(session.model ?? '');
  const endRef = useRef<HTMLDivElement>(null);
  const choices = localModelChoices(runtimeModels, group.sessions);
  const setups = localProviderSetups(runtimeModels);
  const preferredModel = startingModelId(runtimeModels, group.sessions);
  const activeModel = model === '' ? (preferredModel ?? '') : model;
  const activeSetup = localModelSetup(runtimeModels, model === '' ? session.model : model);
  const readyModel = preferredModel;

  const running = localTurnIsRunning(state.turn);
  const busy = running || state.sending;
  const items = localTranscriptItems(state.messages, state.turn);
  const failureAction = state.turn.failure ? localFailureAction(state.turn.failure) : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length, state.turn.reply]);

  const opening = useRef<{ send: LocalSessionState['send']; sent: () => void }>({
    send: state.send,
    sent: () => undefined,
  });
  opening.current = { send: state.send, sent: onPromptSent ?? (() => undefined) };

  useEffect(() => {
    const text = initialPrompt?.trim() ?? '';
    if (text === '') return;
    opening.current.sent();
    void opening.current.send(text);
  }, [session.id, initialPrompt]);

  const submit = () => {
    const text = draft.trim();
    if (text === '' || busy) return;
    setDraft('');
    void state.send(text, model === '' || model === session.model ? undefined : model);
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

              {failureAction && (
                <FailureAction
                  action={failureAction}
                  onRetry={() => void state.send(state.turn.prompt)}
                />
              )}

              <div ref={endRef} />
            </div>
          </div>

          <div className={styles['noticeArea']}>
            <div className={styles['center']}>
              {activeSetup !== null && (
                <div className={styles['notice']} role="status">
                  <span className={styles['hintText']}>
                    {LOCAL_CODE_COPY.modelNeedsSetup(
                      localModelLabel(model === '' ? session.model : model) ?? activeSetup.label,
                      activeSetup.label,
                    )}
                  </span>
                  {activeSetup.offer !== null && <CopyOffer offer={activeSetup.offer} />}
                  {readyModel !== undefined && (
                    <button
                      type="button"
                      className={styles['secondaryButton']}
                      onClick={() => setModel(readyModel)}
                    >
                      {LOCAL_CODE_COPY.switchToReadyModel}
                    </button>
                  )}
                </div>
              )}

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

                {choices.length > 0 && (
                  <div className={styles['controlRow']}>
                    <LocalModelChip
                      choices={choices}
                      setups={setups}
                      selected={activeModel}
                      unreachable={activeSetup !== null}
                      disabled={busy}
                      onSelect={setModel}
                    />
                    <span className={styles['controlSpacer']} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
