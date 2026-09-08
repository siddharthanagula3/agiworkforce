'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Minimize2,
  MoreHorizontal,
  RefreshCw,
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
import { CODE_COPY, CODE_LIMITS, changeStateLabel, repositoryLabel } from '../code-surface';
import { diffByPath, diffLineKind } from '../code-diff';
import type { CloudCodeChanges } from '../services/cloud-code-api';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const EXIT_CODE_OK = 0;

function DiffBody({ body }: { body: string }) {
  return (
    <pre className={styles['diff']}>
      {body.split('\n').map((line, index) => (
        <span
          key={`${index}:${line}`}
          className={`${styles['diffLine']} ${styles[`diffLine-${diffLineKind(line)}`]}`}
        >
          {line}
        </span>
      ))}
    </pre>
  );
}

function ChangedFile({ path, state, body }: { path: string; state: string; body?: string }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();

  if (!body) {
    return (
      <div className={styles['fileRow']}>
        <span className={styles['fileStatus']}>{state}</span>
        <span className={styles['fileName']}>{path}</span>
      </div>
    );
  }

  return (
    <div className={styles['fileBlock']}>
      <button
        type="button"
        className={styles['fileRow']}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className={styles['activityChevron']}>
          {expanded ? (
            <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
          )}
        </span>
        <span className={styles['fileStatus']}>{state}</span>
        <span className={styles['fileName']}>{path}</span>
      </button>
      {expanded && (
        <div id={regionId}>
          <DiffBody body={body} />
        </div>
      )}
    </div>
  );
}

export interface CodeChangesPanelProps {
  session: CloudCodeSession;
  entries: CloudCodeTerminalEntry[];
  canRun: boolean;
  committing: boolean;
  commitNotice: string | null;
  running: boolean;
  wide: boolean;
  changes: CloudCodeChanges | null;
  changesLoading: boolean;
  pullRequestBusy: boolean;
  onToggleWide: () => void;
  onCommit: (message: string) => void;
  onRunCommand: (command: string) => void;
  onRefreshChanges: () => void;
  onCreatePullRequest: () => void;
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
  changes,
  changesLoading,
  pullRequestBusy,
  onToggleWide,
  onCommit,
  onRunCommand,
  onRefreshChanges,
  onCreatePullRequest,
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
  const workingBranch = changes?.workingBranch ?? session.workingBranch;
  const base = session.baseBranch ?? changes?.base ?? session.repositoryBranch;
  const closedOrArchived = session.state === 'closed' || session.archivedAt !== null;
  const committable = hasRepository && !closedOrArchived && session.state !== 'provisioning';
  const diffs = diffByPath(changes?.diff ?? '');

  const pullRequestBlocked = closedOrArchived
    ? CODE_COPY.pullRequestNeedsOpenSession
    : !hasRepository || !workingBranch
      ? CODE_COPY.pullRequestNeedsBranch
      : null;

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
          {hasRepository && workingBranch ? (
            <>
              <span>{base ?? repositoryLabel(session.repositoryUrl ?? '')}</span>
              <ArrowRight size={GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['changesBranchName']}>{workingBranch}</span>
            </>
          ) : (
            <span>{CODE_COPY.changesHeading}</span>
          )}
        </span>

        <div className={styles['changesActions']}>
          <button
            type="button"
            className={styles['headerButton']}
            aria-label={CODE_COPY.changesRefresh}
            disabled={changesLoading || !hasRepository}
            onClick={onRefreshChanges}
          >
            <RefreshCw size={GLYPH_SIZE} aria-hidden="true" />
          </button>

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

        {hasRepository && changesLoading && !changes && (
          <div className={styles['changesEmpty']}>
            <Spinner size="sm" aria-label={CODE_COPY.changesLoading} />
          </div>
        )}

        {hasRepository && changes && changes.files.length === 0 && (
          <p className={styles['changesEmpty']}>{CODE_COPY.changesNone}</p>
        )}

        {hasRepository && changes && changes.files.length > 0 && (
          <div className={styles['fileList']}>
            {changes.files.map((file) => (
              <ChangedFile
                key={file.path}
                path={file.path}
                state={changeStateLabel(file.state)}
                body={diffs.get(file.path)}
              />
            ))}
          </div>
        )}

        {hasRepository && changes?.diffTruncated && (
          <p className={styles['formHelp']}>{CODE_COPY.changesDiffTruncated}</p>
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

        {hasRepository && (
          <div className={styles['pullRequestBlock']}>
            {session.pullRequestUrl ? (
              <a
                className={`${styles['chip']} ${styles['chipSet']}`}
                href={session.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={GLYPH_SIZE} aria-hidden="true" />
                <span>{`${CODE_COPY.pullRequestChipPrefix} #${session.pullRequestNumber ?? ''}`}</span>
              </a>
            ) : (
              <>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  disabled={pullRequestBlocked !== null || pullRequestBusy}
                  onClick={onCreatePullRequest}
                >
                  {pullRequestBusy && <Spinner size="sm" aria-hidden="true" />}
                  {pullRequestBusy ? CODE_COPY.creatingPullRequest : CODE_COPY.createPullRequest}
                </button>
                {pullRequestBlocked && (
                  <span className={styles['formHelp']}>{pullRequestBlocked}</span>
                )}
              </>
            )}
          </div>
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
