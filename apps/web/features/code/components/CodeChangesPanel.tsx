'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Minimize2,
  MoreHorizontal,
  X,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import type { CloudCodeSession, CloudCodeTerminalEntry } from '@agiworkforce/types';
import { CODE_COPY, CODE_LIMITS, repositoryLabel } from '../code-surface';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const EXIT_CODE_OK = 0;
const PORCELAIN_STATUS_WIDTH = 3;

export interface CodeChangesPanelProps {
  session: CloudCodeSession;
  entries: CloudCodeTerminalEntry[];
  canRun: boolean;
  committing: boolean;
  commitNotice: string | null;
  running: boolean;
  wide: boolean;
  changedFiles: string[] | null;
  onToggleWide: () => void;
  onCommit: (message: string) => void;
  onRunCommand: (command: string) => void;
  onCheckChanges: () => void;
  onClose: () => void;
}

export function CodeChangesPanel({
  session,
  entries,
  canRun,
  committing,
  commitNotice,
  running,
  wide,
  changedFiles,
  onToggleWide,
  onCommit,
  onRunCommand,
  onCheckChanges,
  onClose,
}: CodeChangesPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [command, setCommand] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [showExitCodes, setShowExitCodes] = useState(true);
  const terminalRegionId = useId();
  const commandFieldId = useId();
  const endRef = useRef<HTMLDivElement>(null);

  const ready = session.state === 'ready';
  const hasRepository = Boolean(session.repositoryUrl);
  const committable =
    hasRepository &&
    session.state !== 'closed' &&
    session.state !== 'provisioning' &&
    session.state !== 'failed';

  useEffect(() => {
    if (!terminalOpen) return;
    const end = endRef.current;
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' });
  }, [entries, terminalOpen, running]);

  useEffect(() => {
    if (commitNotice) setCommitMessage('');
  }, [commitNotice]);

  const submitCommit = (event: FormEvent) => {
    event.preventDefault();
    if (!commitMessage.trim() || committing) return;
    onCommit(commitMessage.trim());
  };

  const submitCommand = (event: FormEvent) => {
    event.preventDefault();
    if (!command.trim() || running || !ready || !canRun) return;
    onRunCommand(command.trim());
    setCommand('');
  };

  return (
    <aside
      className={`${styles['changes']} ${wide ? styles['changesWide'] : ''}`}
      aria-label={CODE_COPY.changesHeading}
    >
      <div className={styles['changesHeader']}>
        <span className={styles['changesBranch']}>
          <GitBranch size={GLYPH_SIZE} aria-hidden="true" />
          {hasRepository ? (
            <>
              <span>{repositoryLabel(session.repositoryUrl ?? '')}</span>
              <ArrowRight size={GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['changesBranchName']}>
                {session.repositoryBranch ?? CODE_COPY.changesBranchFrom}
              </span>
            </>
          ) : (
            <span>{CODE_COPY.changesHeading}</span>
          )}
        </span>

        <div className={styles['changesActions']}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={styles['headerButton']}
                aria-label={CODE_COPY.changesSettings}
              >
                <MoreHorizontal size={GLYPH_SIZE} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{CODE_COPY.changesSettings}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={terminalOpen}
                onCheckedChange={(checked) => setTerminalOpen(checked === true)}
              >
                {CODE_COPY.terminal}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showExitCodes}
                onCheckedChange={(checked) => setShowExitCodes(checked === true)}
              >
                {CODE_COPY.showExitCodes}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            className={styles['headerButton']}
            aria-label={wide ? CODE_COPY.changesCollapse : CODE_COPY.changesExpand}
            aria-pressed={wide}
            onClick={onToggleWide}
          >
            <Minimize2 size={GLYPH_SIZE} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={CODE_COPY.closeChanges}
            onClick={onClose}
          >
            <X size={GLYPH_SIZE} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles['changesBody']}>
        {!hasRepository && (
          <p className={styles['changesEmpty']}>{CODE_COPY.changesNoRepository}</p>
        )}

        {hasRepository && changedFiles === null && (
          <div className={styles['changesCheck']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={!canRun || !ready || running}
              onClick={onCheckChanges}
            >
              {running ? <Spinner size="sm" aria-hidden="true" /> : null}
              {running ? CODE_COPY.changesChecking : CODE_COPY.changesCheck}
            </button>
          </div>
        )}

        {hasRepository && changedFiles?.length === 0 && (
          <p className={styles['changesEmpty']}>{CODE_COPY.changesNone}</p>
        )}

        {hasRepository && changedFiles && changedFiles.length > 0 && (
          <ul className={styles['fileList']}>
            {changedFiles.map((line) => (
              <li key={line} className={styles['fileRow']}>
                <span className={styles['fileStatus']}>
                  {line.slice(0, PORCELAIN_STATUS_WIDTH).trim()}
                </span>
                <span className={styles['fileName']}>
                  {line.slice(PORCELAIN_STATUS_WIDTH).trim()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {committable && (
          <form className={styles['formField']} onSubmit={submitCommit}>
            <span className={styles['formLabel']}>{CODE_COPY.commitLabel}</span>
            <div className={styles['commitRow']}>
              <input
                className={styles['textInput']}
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                maxLength={CODE_LIMITS.commitMessage}
                disabled={committing}
                aria-label={CODE_COPY.commitLabel}
              />
              <button
                type="submit"
                className={styles['secondaryButton']}
                disabled={committing || !commitMessage.trim()}
              >
                {committing && <Spinner size="sm" aria-hidden="true" />}
                {CODE_COPY.commitAction}
              </button>
            </div>
            {commitNotice && <span className={styles['formHelp']}>{commitNotice}</span>}
          </form>
        )}

        <div className={styles['terminalBlock']}>
          <button
            type="button"
            className={styles['activityRow']}
            aria-expanded={terminalOpen}
            aria-controls={terminalRegionId}
            onClick={() => setTerminalOpen((open) => !open)}
          >
            <span className={styles['activityChevron']}>
              {terminalOpen ? (
                <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
              ) : (
                <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
              )}
            </span>
            <span>{CODE_COPY.terminal}</span>
          </button>

          {terminalOpen && (
            <div id={terminalRegionId} className={styles['terminalBlock']}>
              <div className={styles['terminal']} aria-live="polite">
                {entries.length === 0 && (
                  <p className={styles['terminalEmpty']}>{CODE_COPY.terminalEmpty}</p>
                )}
                {entries.map((entry) => (
                  <div key={entry.id} className={styles['terminalEntry']}>
                    <div className={styles['terminalCommand']}>
                      <span className={styles['terminalPrompt']}>$ </span>
                      {entry.command}
                    </div>
                    {entry.stdout && <pre className={styles['terminalOutput']}>{entry.stdout}</pre>}
                    {entry.stderr && (
                      <pre className={`${styles['terminalOutput']} ${styles['terminalError']}`}>
                        {entry.stderr}
                      </pre>
                    )}
                    {showExitCodes && (
                      <div
                        className={`${styles['terminalExit']} ${
                          entry.exitCode === EXIT_CODE_OK ? '' : styles['terminalError']
                        }`}
                      >
                        {`exit ${entry.exitCode}`}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <form className={styles['formField']} onSubmit={submitCommand}>
                <label className={styles['formLabel']} htmlFor={commandFieldId}>
                  {CODE_COPY.commandLabel}
                </label>
                <div className={styles['commitRow']}>
                  <input
                    id={commandFieldId}
                    className={styles['textInput']}
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder={CODE_COPY.commandPlaceholder}
                    maxLength={CODE_LIMITS.command}
                    disabled={!canRun || running || !ready}
                  />
                  <button
                    type="submit"
                    className={styles['secondaryButton']}
                    disabled={!canRun || running || !ready || !command.trim()}
                  >
                    {running ? <Spinner size="sm" aria-hidden="true" /> : CODE_COPY.commandRun}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
