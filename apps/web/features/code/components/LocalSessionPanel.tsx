'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  Code2,
  ListChecks,
  PanelsTopLeft,
  Square,
  TerminalSquare,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import {
  CLOUD_CODE_DEFAULT_TURN_STEPS,
  CLOUD_CODE_TURN_STEP_BOUNDS,
  isCloudCodeTurnStepBound,
  type CloudCodeTurnStepBound,
} from '@agiworkforce/types';
import {
  DEVELOPER_AGENT_MODE_LABELS,
  type DeveloperRuntimeModels,
  type LocalDeveloperSession,
  type DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import { openWorkspaceInEditor } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import {
  CODE_COPY,
  CODE_LIMITS,
  CODE_TURN_STEP_HINTS,
  continueLocalSessionInVsCodeHref,
  localSessionResumeCommand,
} from '../code-surface';
import {
  LOCAL_AGENT_MODES,
  LOCAL_AGENT_MODE_HINTS,
  LOCAL_CODE_COPY,
  LOCAL_FAILURE_ACTION_LABELS,
  localAgentMode,
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
  type LocalAgentMode,
  type LocalFailureAction,
} from '../local-code';
import { useLocalSession, type LocalSessionState } from '../hooks/use-local-session';
import { useLocalTests } from '../hooks/use-local-tests';
import { getModelMetadata } from '@shared/config/llm';
import { UsageRing } from './CodeComposer';
import { LocalChangesPanel } from './LocalChangesPanel';
import { LocalExtensionsControl } from './LocalExtensionsControl';
import { LocalMemoryControl } from './LocalMemoryControl';
import { LocalModelChip } from './LocalModelChip';
import { CodeTranscriptBody } from './CodeTranscript';
import styles from '../CloudCodePage.module.css';

const HEADER_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const MODE_GLYPH_SIZE = 14;
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

function LocalModeControl({
  mode,
  turnSteps,
  disabled,
  onChange,
  onTurnStepsChange,
}: {
  mode: LocalAgentMode;
  turnSteps: CloudCodeTurnStepBound | null;
  disabled: boolean;
  onChange: (mode: LocalAgentMode) => void;
  onTurnStepsChange: (steps: CloudCodeTurnStepBound) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${styles['controlButton']} ${styles['controlButtonMode']}`}
          aria-label={LOCAL_CODE_COPY.modeControl}
          disabled={disabled}
        >
          <span>{DEVELOPER_AGENT_MODE_LABELS[mode]}</span>
          <ChevronDown size={MODE_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-80">
        <DropdownMenuLabel>{LOCAL_CODE_COPY.modeMenu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => onChange(localAgentMode(value as LocalAgentMode))}
        >
          {LOCAL_AGENT_MODES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              <span className={styles['menuRowLabel']}>
                <span className={styles['optionLabel']}>{DEVELOPER_AGENT_MODE_LABELS[option]}</span>
                <span className={styles['optionHint']}>{LOCAL_AGENT_MODE_HINTS[option]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {turnSteps !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{CODE_COPY.turnStepsMenu}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(turnSteps)}
              onValueChange={(value) => {
                const bound = Number(value);
                if (isCloudCodeTurnStepBound(bound)) onTurnStepsChange(bound);
              }}
            >
              {CLOUD_CODE_TURN_STEP_BOUNDS.map((bound) => (
                <DropdownMenuRadioItem key={bound} value={String(bound)}>
                  <span className={styles['menuRowLabel']}>
                    <span className={styles['optionLabel']}>
                      {bound} {CODE_COPY.turnStepsUnit}
                    </span>
                    <span className={styles['optionHint']}>{CODE_TURN_STEP_HINTS[bound]}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A choice the agent asked for. Allow and Deny cannot carry an answer, so the
 * options are the buttons, and declining lets the agent go on without one.
 */
function QuestionPrompt({
  question,
  onAnswer,
  onSkip,
}: {
  question: { question: string; options: string[] };
  onAnswer: (option: string) => void;
  onSkip: () => void;
}) {
  return (
    <div
      className={`${styles['notice']} ${styles['questionPrompt']}`}
      role="group"
      aria-label={question.question}
    >
      <p className={styles['hintText']}>{question.question}</p>
      <div className={styles['questionOptions']}>
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            className={styles['secondaryButton']}
            onClick={() => onAnswer(option)}
          >
            {option}
          </button>
        ))}
        <button type="button" className={styles['secondaryButton']} onClick={onSkip}>
          {LOCAL_CODE_COPY.skipQuestion}
        </button>
      </div>
    </div>
  );
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
  const tests = useLocalTests(session.rootId);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const vsCodeHref = continueLocalSessionInVsCodeHref(session);
  const resumeCommand = localSessionResumeCommand(session.id);
  const testsRunning = tests.status === 'running';
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [model, setModel] = useState(session.model ?? '');
  const [mode, setMode] = useState<LocalAgentMode | null>(null);
  const [turnSteps, setTurnSteps] = useState<CloudCodeTurnStepBound>(CLOUD_CODE_DEFAULT_TURN_STEPS);
  const boundedTurns = runtimeModels?.features?.maxTurns === true;
  const memoryAvailable = runtimeModels?.features?.memory === true;
  const activeMode = mode ?? localAgentMode(runtimeModels?.defaultAgentMode);
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
    void state.send(
      text,
      model === '' || model === session.model ? undefined : model,
      activeMode,
      boundedTurns ? turnSteps : undefined,
    );
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
        <div className={styles['headerActions']}>
          <LocalExtensionsControl rootId={session.rootId} />
          {memoryAvailable && <LocalMemoryControl rootId={session.rootId} />}
          <button
            type="button"
            className={`${styles['headerButton']} ${changesOpen ? styles['headerButtonActive'] : ''}`}
            aria-label={CODE_COPY.changes}
            aria-pressed={changesOpen}
            title={CODE_COPY.changes}
            onClick={() => setChangesOpen((open) => !open)}
          >
            <PanelsTopLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles['headerButton']} ${testsRunning ? styles['headerButtonActive'] : ''}`}
            aria-label={testsRunning ? LOCAL_CODE_COPY.stopTests : LOCAL_CODE_COPY.runTests}
            title={testsRunning ? LOCAL_CODE_COPY.stopTests : LOCAL_CODE_COPY.runTests}
            onClick={() => (testsRunning ? tests.stop() : void tests.run())}
          >
            {testsRunning ? (
              <Spinner size="sm" aria-hidden="true" />
            ) : (
              <ListChecks size={HEADER_GLYPH_SIZE} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={LOCAL_CODE_COPY.openInEditor}
            title={LOCAL_CODE_COPY.openInEditor}
            onClick={() => {
              setEditorError(null);
              openWorkspaceInEditor(session.rootId).catch((cause: unknown) =>
                setEditorError(toUserMessage(cause, LOCAL_CODE_COPY.editorFailed)),
              );
            }}
          >
            <Code2 size={HEADER_GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles['headerButton']} ${handoffOpen ? styles['headerButtonActive'] : ''}`}
            aria-label={CODE_COPY.continueElsewhere}
            aria-expanded={handoffOpen}
            aria-controls="local-session-handoff"
            title={CODE_COPY.continueElsewhere}
            onClick={() => setHandoffOpen((open) => !open)}
          >
            <ArrowRight size={HEADER_GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
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
                  approvals={state.approval?.question ? [] : localApprovalPrompts(state.approval)}
                  busy={busy}
                  busySince={running ? session.updatedAt : null}
                  verbose={verbose}
                  onDecideApproval={(_prompt, decision) =>
                    void state.decideApproval(decision === 'approve')
                  }
                  onRetryTask={(goal) => void state.send(goal)}
                />
              )}

              {state.approval?.question && (
                <QuestionPrompt
                  question={state.approval.question}
                  onAnswer={(option) => void state.decideApproval(true, option)}
                  onSkip={() => void state.decideApproval(false)}
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

              {handoffOpen && (
                <div
                  id="local-session-handoff"
                  className={styles['notice']}
                  role="group"
                  aria-label={CODE_COPY.continueElsewhere}
                >
                  <div className={styles['testsNoticeBody']}>
                    <span>{CODE_COPY.resumeInTerminal}</span>
                    <pre>{resumeCommand}</pre>
                    <div className={styles['noticeActions']}>
                      <CopyOffer offer={{ kind: 'copy', text: resumeCommand }} />
                      {vsCodeHref !== null && (
                        <a className={styles['secondaryButton']} href={vsCodeHref}>
                          <ArrowRight size={HEADER_GLYPH_SIZE} aria-hidden="true" />
                          <span>{CODE_COPY.continueInVsCode}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editorError !== null && (
                <div className={styles['notice']} role="alert">
                  <span>{editorError}</span>
                </div>
              )}

              {(testsRunning || tests.message !== null) && (
                <div
                  className={styles['notice']}
                  role={tests.status === 'failed' ? 'alert' : 'status'}
                  data-testid="local-tests-notice"
                >
                  <div className={styles['testsNoticeBody']}>
                    <span>
                      {testsRunning && tests.command !== null
                        ? LOCAL_CODE_COPY.runningTests(tests.command)
                        : tests.message}
                    </span>
                    {tests.output !== '' && (
                      <details>
                        <summary>{LOCAL_CODE_COPY.testOutput}</summary>
                        <pre className={styles['activityOutput']}>{tests.output}</pre>
                      </details>
                    )}
                  </div>
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
                      if (isImeComposingKey(event.nativeEvent)) return;
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

                <div className={styles['controlRow']}>
                  <LocalModeControl
                    mode={activeMode}
                    turnSteps={boundedTurns ? turnSteps : null}
                    disabled={busy}
                    onChange={setMode}
                    onTurnStepsChange={setTurnSteps}
                  />
                  <span className={styles['controlSpacer']} />
                  {choices.length > 0 && (
                    <LocalModelChip
                      choices={choices}
                      setups={setups}
                      selected={activeModel}
                      unreachable={activeSetup !== null}
                      disabled={busy}
                      onSelect={setModel}
                    />
                  )}
                  <UsageRing
                    contextTokens={state.contextTokens}
                    contextWindow={getModelMetadata(activeModel)?.contextWindow ?? null}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        {changesOpen && (
          <LocalChangesPanel
            rootId={session.rootId}
            title={session.title}
            refreshKey={state.messages.length}
            onClose={() => setChangesOpen(false)}
          />
        )}
      </div>
    </>
  );
}
