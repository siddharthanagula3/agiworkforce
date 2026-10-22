'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Plus, Square, TerminalSquare, X } from '@agiworkforce/icons';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { SHELL_TIMEOUT_MAX_MS } from '@agiworkforce/local-runtime-contract';
import {
  cancelLocalCommand,
  startBackgroundLocalCommand,
  startLocalCommand,
  type LocalCommandRun,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY, CODE_LIMITS } from '../code-surface';
import { LOCAL_CODE_COPY, LOCAL_PANEL_COPY, localTerminalTabLabel } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const EXIT_CODE_OK = 0;
const MAX_ENTRY_OUTPUT = 200_000;

interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  failed: boolean;
  running: boolean;
}

export interface LocalTerminalProps {
  rootId: string;
  folder: string;
  onCommandFinished: () => void;
  onBackgroundStarted?: () => void;
  onRunningChange?: (command: string | null) => void;
}

export function LocalTerminal({
  rootId,
  folder,
  onCommandFinished,
  onBackgroundStarted,
  onRunningChange,
}: LocalTerminalProps) {
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const run = useRef<LocalCommandRun | null>(null);
  const fieldId = useId();
  const endRef = useRef<HTMLDivElement>(null);
  const runningCommand = entries.find((entry) => entry.running)?.command ?? null;
  const running = runningCommand !== null;
  const prompt = `${folder} %`;

  useEffect(() => {
    setEntries([]);
  }, [rootId]);

  useEffect(() => {
    onRunningChange?.(runningCommand);
  }, [runningCommand, onRunningChange]);

  useEffect(
    () => () => {
      const current = run.current;
      if (current) void cancelLocalCommand(current.runId);
    },
    [],
  );

  useEffect(() => {
    const end = endRef.current;
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  const update = (id: string, patch: (entry: TerminalEntry) => Partial<TerminalEntry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch(entry) } : entry)),
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const line = command.trim();
    if (!line || running) return;
    setCommand('');
    let started: LocalCommandRun;
    try {
      started = startLocalCommand(
        { rootId, command: line, timeoutMs: SHELL_TIMEOUT_MAX_MS },
        (output) =>
          update(started.runId, (entry) => ({
            output: `${entry.output}${output.text}`.slice(-MAX_ENTRY_OUTPUT),
          })),
      );
    } catch (cause: unknown) {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          command: line,
          output: toUserMessage(cause, LOCAL_CODE_COPY.commandFailed),
          exitCode: null,
          failed: true,
          running: false,
        },
      ]);
      return;
    }
    run.current = started;
    setEntries((current) => [
      ...current,
      {
        id: started.runId,
        command: line,
        output: '',
        exitCode: null,
        failed: false,
        running: true,
      },
    ]);
    try {
      const result = await started.result;
      update(started.runId, () => ({
        exitCode: result.exitCode,
        failed: result.timedOut || result.exitCode !== EXIT_CODE_OK,
        running: false,
      }));
    } catch (cause: unknown) {
      update(started.runId, (entry) => ({
        output: `${entry.output}\n${toUserMessage(cause, LOCAL_CODE_COPY.commandFailed)}`,
        failed: true,
        running: false,
      }));
    } finally {
      run.current = null;
      onCommandFinished();
    }
  };

  const keepRunning = async () => {
    const line = command.trim();
    if (!line || running) return;
    setCommand('');
    const id = crypto.randomUUID();
    setEntries((current) => [
      ...current,
      { id, command: line, output: '', exitCode: null, failed: false, running: true },
    ]);
    try {
      const started = await startBackgroundLocalCommand({ rootId, command: line });
      update(id, () => ({
        output: [started.output, LOCAL_CODE_COPY.startedInBackground]
          .filter((text) => text !== '')
          .join('\n')
          .slice(-MAX_ENTRY_OUTPUT),
        exitCode: started.running ? null : started.exitCode,
        failed: !started.running && started.exitCode !== EXIT_CODE_OK,
        running: false,
      }));
      onBackgroundStarted?.();
    } catch (cause: unknown) {
      update(id, () => ({
        output: toUserMessage(cause, LOCAL_CODE_COPY.commandFailed),
        failed: true,
        running: false,
      }));
    }
  };

  const stop = () => {
    const current = run.current;
    if (current) void cancelLocalCommand(current.runId);
  };

  return (
    <div className={styles['terminalScreen']}>
      <div aria-live="polite">
        {entries.map((entry) => (
          <div key={entry.id} className={styles['terminalScreenEntry']}>
            <div className={styles['terminalCommand']}>
              <span className={styles['terminalScreenPrompt']}>{prompt} </span>
              {entry.command}
            </div>
            {entry.output && <pre className={styles['terminalOutput']}>{entry.output}</pre>}
            {entry.running ? (
              <Spinner size="sm" aria-label={LOCAL_CODE_COPY.working} />
            ) : (
              <div
                className={`${styles['terminalScreenExit']} ${entry.failed ? styles['terminalError'] : ''}`}
              >
                {entry.exitCode === null
                  ? LOCAL_CODE_COPY.commandStopped
                  : `exit ${entry.exitCode}`}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className={styles['terminalPromptRow']} onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor={fieldId}>
          {CODE_COPY.commandLabel}
        </label>
        <span className={styles['terminalScreenPrompt']} aria-hidden="true">
          {prompt}
        </span>
        <input
          id={fieldId}
          className={styles['terminalPromptInput']}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          maxLength={CODE_LIMITS.command}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={running}
        />
        {running ? (
          <button type="button" className={styles['secondaryButton']} onClick={stop}>
            <Square size={GLYPH_SIZE} aria-hidden="true" />
            <span>{LOCAL_CODE_COPY.stop}</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles['secondaryButton']}
            title={LOCAL_CODE_COPY.keepRunningHint}
            disabled={!command.trim()}
            onClick={() => void keepRunning()}
          >
            {LOCAL_CODE_COPY.keepRunning}
          </button>
        )}
      </form>
      <div ref={endRef} />
    </div>
  );
}

interface TerminalTab {
  id: number;
  ordinal: number;
}

export interface LocalTerminalDockProps {
  rootId: string;
  folder: string;
  open: boolean;
  onClose: () => void;
  onCommandFinished: () => void;
  onBackgroundStarted: () => void;
}

const FIRST_TAB: readonly TerminalTab[] = [{ id: 1, ordinal: 1 }];

export function LocalTerminalDock({
  rootId,
  folder,
  open,
  onClose,
  onCommandFinished,
  onBackgroundStarted,
}: LocalTerminalDockProps) {
  const [tabs, setTabs] = useState<readonly TerminalTab[]>(FIRST_TAB);
  const [activeId, setActiveId] = useState(FIRST_TAB[0]?.id ?? 1);
  const [runningByTab, setRunningByTab] = useState<Readonly<Record<number, string | null>>>({});
  const nextId = useRef(FIRST_TAB.length + 1);
  const panelsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<number, HTMLButtonElement>());
  const baseId = useId();
  const { confirm, dialog } = useConfirmAction();

  useEffect(() => {
    if (!open) return;
    panelsRef.current
      ?.querySelector<HTMLInputElement>(`[data-terminal-tab="${activeId}"] input:not(:disabled)`)
      ?.focus();
  }, [open, activeId]);

  const reportRunning = useCallback((id: number, command: string | null) => {
    setRunningByTab((current) =>
      current[id] === command ? current : { ...current, [id]: command },
    );
  }, []);

  const addTab = () => {
    const id = nextId.current;
    nextId.current += 1;
    setTabs((current) => {
      const ordinal = Math.max(0, ...current.map((tab) => tab.ordinal)) + 1;
      return [...current, { id, ordinal }];
    });
    setActiveId(id);
  };

  const removeTab = (id: number) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    setRunningByTab((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== id)),
    );
    if (remaining.length === 0) {
      const fresh = nextId.current;
      nextId.current += 1;
      setTabs([{ id: fresh, ordinal: 1 }]);
      setActiveId(fresh);
      onClose();
      return;
    }
    setTabs(remaining);
    if (id === activeId) {
      const neighbour = remaining[Math.min(index, remaining.length - 1)];
      if (neighbour) setActiveId(neighbour.id);
    }
  };

  const closeTab = (tab: TerminalTab) => {
    const command = runningByTab[tab.id] ?? null;
    if (command === null) {
      removeTab(tab.id);
      return;
    }
    confirm({
      title: LOCAL_PANEL_COPY.stopTabTitle,
      description: LOCAL_PANEL_COPY.stopTabDescription(command),
      confirmLabel: LOCAL_PANEL_COPY.stopTabConfirm,
      destructive: true,
      onConfirm: () => removeTab(tab.id),
    });
  };

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const target = tabs[(index + step + tabs.length) % tabs.length];
    if (!target) return;
    setActiveId(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  return (
    <section
      className={styles['terminalDock']}
      aria-label={LOCAL_PANEL_COPY.bottomPanel}
      hidden={!open}
      data-testid="local-terminal-dock"
    >
      <div className={styles['terminalDockBar']}>
        <div
          className={styles['terminalTabs']}
          role="tablist"
          aria-label={LOCAL_PANEL_COPY.terminalTabs}
        >
          {tabs.map((tab, index) => {
            const label = localTerminalTabLabel(folder, tab.ordinal);
            const selected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={`${styles['terminalTab']} ${selected ? styles['terminalTabActive'] : ''}`}
              >
                <button
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${tab.id}`}
                  ref={(node) => {
                    if (node) tabRefs.current.set(tab.id, node);
                    else tabRefs.current.delete(tab.id);
                  }}
                  className={styles['terminalTabButton']}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={(event) => moveFocus(event, index)}
                >
                  <TerminalSquare size={GLYPH_SIZE} aria-hidden="true" />
                  <span className={styles['terminalTabLabel']}>{label}</span>
                </button>
                <button
                  type="button"
                  className={styles['terminalTabClose']}
                  aria-label={LOCAL_PANEL_COPY.closeTerminalTab(label)}
                  title={LOCAL_PANEL_COPY.closeTerminalTab(label)}
                  onClick={() => closeTab(tab)}
                >
                  <X size={GLYPH_SIZE} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={LOCAL_PANEL_COPY.newTerminal}
          title={LOCAL_PANEL_COPY.newTerminal}
          onClick={addTab}
        >
          <Plus size={GLYPH_SIZE} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles['headerButton']} ${styles['terminalDockClose']}`}
          aria-label={LOCAL_PANEL_COPY.closeTerminalPanel}
          title={LOCAL_PANEL_COPY.closeTerminalPanel}
          onClick={onClose}
        >
          <X size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </div>
      <div className={styles['terminalPanels']} ref={panelsRef}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`${baseId}-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            className={styles['terminalPanel']}
            data-terminal-tab={tab.id}
            hidden={tab.id !== activeId}
          >
            <LocalTerminal
              rootId={rootId}
              folder={folder}
              onCommandFinished={onCommandFinished}
              onBackgroundStarted={onBackgroundStarted}
              onRunningChange={(command) => reportRunning(tab.id, command)}
            />
          </div>
        ))}
      </div>
      {dialog}
    </section>
  );
}
