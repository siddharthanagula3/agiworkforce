'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronLeft, Square, TerminalSquare } from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import type {
  DeveloperRuntimeModels,
  LocalDeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import { CODE_LIMITS } from '../code-surface';
import {
  LOCAL_CODE_COPY,
  LOCAL_FAILURE_ACTION_LABELS,
  LOCAL_MODEL_EVIDENCE_LABELS,
  LOCAL_MODEL_SETUP_HEADING,
  localApprovalPrompts,
  localFailureAction,
  localModelChoices,
  localModelLabel,
  localModelSetup,
  localModelSetupCount,
  localProviderSetups,
  localSessionContext,
  localTranscriptItems,
  localTurnIsRunning,
  type LocalFailureAction,
  type LocalModelChoice,
  type LocalProviderSetup,
} from '../local-code';
import { useLocalSession } from '../hooks/use-local-session';
import { CodeTranscriptBody } from './CodeTranscript';
import styles from '../CloudCodePage.module.css';

const HEADER_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const CHIP_GLYPH_SIZE = 13;
const SUBMIT_KEY = 'Enter';
const MENU_EDGE_GAP = 12;

/**
 * The shell's title strip is a drag region, so a popover reaching into it is
 * untouchable. The height is read from its token rather than repeated here.
 */
function menuCollisionPadding(): { top: number; bottom: number; left: number; right: number } {
  const strip =
    typeof window === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue('--chat-window-title-strip');
  const top = Number.parseFloat(strip);
  return {
    top: Number.isFinite(top) && top > 0 ? top + MENU_EDGE_GAP : MENU_EDGE_GAP,
    bottom: MENU_EDGE_GAP,
    left: MENU_EDGE_GAP,
    right: MENU_EDGE_GAP,
  };
}

export interface LocalSessionPanelProps {
  session: LocalDeveloperSession;
  group: Pick<DeveloperSessionGroup, 'name' | 'branch' | 'sessions'>;
  runtimeModels: DeveloperRuntimeModels | null;
  verbose: boolean;
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

function ProviderSetupRow({ setup }: { setup: LocalProviderSetup }) {
  const [copied, setCopied] = useState(false);
  const offer = setup.offer;

  if (offer === null || offer.kind !== 'copy') {
    return (
      <DropdownMenuItem className="pl-8" disabled>
        <span className={styles['menuItemStack']}>
          <span className={styles['menuItemTop']}>
            <span className={styles['menuItemLabel']}>{setup.label}</span>
            <span className={styles['menuItemCount']}>{localModelSetupCount(setup)}</span>
          </span>
        </span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      className="pl-8"
      onSelect={(event) => {
        event.preventDefault();
        void navigator.clipboard.writeText(offer.text).then(() => setCopied(true));
      }}
    >
      <span className={styles['menuItemStack']}>
        <span className={styles['menuItemTop']}>
          <span className={styles['menuItemLabel']}>{setup.label}</span>
          <span className={styles['menuItemCount']}>{localModelSetupCount(setup)}</span>
        </span>
        <span className={styles['menuItemOffer']}>
          {copied ? LOCAL_FAILURE_ACTION_LABELS.copied : LOCAL_FAILURE_ACTION_LABELS.copy}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

function ModelChip({
  choices,
  setups,
  selected,
  unreachable,
  disabled,
  onSelect,
}: {
  choices: LocalModelChoice[];
  setups: LocalProviderSetup[];
  selected: string;
  unreachable: boolean;
  disabled: boolean;
  onSelect: (modelId: string) => void;
}) {
  const groupsByEvidence = [...new Set(choices.map((choice) => choice.evidence))];
  const triggerClass = unreachable
    ? `${styles['controlButton']} ${styles['controlButtonWarning']}`
    : styles['controlButton'];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClass} disabled={disabled}>
          <span>{localModelLabel(selected) ?? selected}</span>
          <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        collisionPadding={menuCollisionPadding()}
        className={`w-80 ${styles['menuScroll']}`}
      >
        <DropdownMenuRadioGroup value={selected} onValueChange={onSelect}>
          {groupsByEvidence.map((evidence, index) => (
            <div key={evidence}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{LOCAL_MODEL_EVIDENCE_LABELS[evidence]}</DropdownMenuLabel>
              {choices
                .filter((choice) => choice.evidence === evidence)
                .map((choice) => (
                  <DropdownMenuRadioItem key={choice.id} value={choice.id}>
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
        {setups.length > 0 && (
          <div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{LOCAL_MODEL_SETUP_HEADING}</DropdownMenuLabel>
            {setups.map((setup) => (
              <ProviderSetupRow key={setup.provider} setup={setup} />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LocalSessionPanel({
  session,
  group,
  runtimeModels,
  verbose,
  onClose,
}: LocalSessionPanelProps) {
  const state = useLocalSession(session);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [model, setModel] = useState(session.model ?? '');
  const endRef = useRef<HTMLDivElement>(null);
  const choices = localModelChoices(runtimeModels, group.sessions);
  const setups = localProviderSetups(runtimeModels);
  const activeModel = model === '' ? (choices[0]?.id ?? '') : model;
  const activeSetup = localModelSetup(runtimeModels, model === '' ? session.model : model);
  const readyModel = choices[0]?.id;

  const running = localTurnIsRunning(state.turn);
  const busy = running || state.sending;
  const items = localTranscriptItems(state.messages, state.turn);
  const failureAction = state.turn.failure ? localFailureAction(state.turn.failure) : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length, state.turn.reply]);

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
                    <ModelChip
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
