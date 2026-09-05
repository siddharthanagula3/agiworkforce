'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Minus,
  Square,
  TriangleAlert,
  Volume2,
} from '@agiworkforce/icons';
import { MarkdownContent } from '@agiworkforce/unified-chat';
import { Spinner } from '@agiworkforce/ui';
import type { CloudCodeSession, CloudCodeTerminalEntry } from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { formatRelativeTime } from '@shared/utils/format';
import { useTTS } from '@/lib/hooks/useTTS';
import {
  CODE_COPY,
  CODE_TIMING,
  commandRanLabel,
  formatElapsed,
  provisioningSteps,
  stopReasonIsFailure,
  stopReasonLabel,
} from '../code-surface';
import type { CodeApprovalPrompt, CodeTranscriptItem } from '../code-transcript';
import styles from '../CloudCodePage.module.css';

const ACTION_GLYPH_SIZE = 14;
const CHEVRON_GLYPH_SIZE = 14;
const STEP_GLYPH_SIZE = 13;
const MARK_SIZE = 16;
const EXIT_CODE_OK = 0;
const FIRST_OUTPUT_LINE = 0;

function firstOutputLine(entry: CloudCodeTerminalEntry): string {
  const output = entry.stdout || entry.stderr;
  return output.split('\n')[FIRST_OUTPUT_LINE]?.trim() ?? '';
}

function DisclosureRow({
  label,
  expanded,
  onToggle,
  failed = false,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  failed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles['activityRow']} ${failed ? styles['activityRowFailed'] : ''}`}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span>{label}</span>
      <span
        className={`${styles['activityChevron']} ${expanded ? styles['activityChevronOpen'] : ''}`}
      >
        <ChevronRight size={CHEVRON_GLYPH_SIZE} aria-hidden="true" />
      </span>
    </button>
  );
}

function InitializedSession({ session }: { session: CloudCodeSession }) {
  const [expanded, setExpanded] = useState(false);
  const steps = provisioningSteps(session);
  const failed = steps.some((step) => step.state === 'failed');

  return (
    <div className={styles['activity']}>
      <DisclosureRow
        label={failed ? CODE_COPY.stepFailed : CODE_COPY.initializedSession}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        failed={failed}
      />
      {expanded && (
        <ul className={styles['stepList']}>
          {steps.map((step) => (
            <li key={step.id} className={styles['stepRow']}>
              <span
                className={
                  step.state === 'failed' ? styles['stepGlyphFailed'] : styles['stepGlyph']
                }
              >
                {step.state === 'done' && <Check size={STEP_GLYPH_SIZE} aria-hidden="true" />}
                {step.state === 'skipped' && <Minus size={STEP_GLYPH_SIZE} aria-hidden="true" />}
                {step.state === 'failed' && (
                  <TriangleAlert size={STEP_GLYPH_SIZE} aria-hidden="true" />
                )}
              </span>
              <span>{step.label}</span>
            </li>
          ))}
          {session.lastError && <li className={styles['stepError']}>{session.lastError}</li>}
        </ul>
      )}
    </div>
  );
}

function CommandCard({ entry, verbose }: { entry: CloudCodeTerminalEntry; verbose: boolean }) {
  const [expanded, setExpanded] = useState(verbose);
  const failed = entry.exitCode !== EXIT_CODE_OK;
  const summary = firstOutputLine(entry);

  useEffect(() => setExpanded(verbose), [verbose]);

  return (
    <div className={styles['commandCard']}>
      <DisclosureRow
        label={entry.command}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        failed={failed}
      />
      {!expanded && summary && <p className={styles['commandSummary']}>{summary}</p>}
      {expanded && (
        <div className={styles['activityDetail']}>
          {entry.stdout && <pre className={styles['activityOutput']}>{entry.stdout}</pre>}
          {entry.stderr && (
            <pre className={`${styles['activityOutput']} ${styles['terminalError']}`}>
              {entry.stderr}
            </pre>
          )}
          <p className={failed ? styles['activityFailure'] : styles['activityExit']}>
            {`exit ${entry.exitCode}`}
          </p>
        </div>
      )}
    </div>
  );
}

function CommandGroup({
  entries,
  verbose,
}: {
  entries: CloudCodeTerminalEntry[];
  verbose: boolean;
}) {
  const [expanded, setExpanded] = useState(verbose);
  const failed = entries.filter((entry) => entry.exitCode !== EXIT_CODE_OK);

  useEffect(() => setExpanded(verbose), [verbose]);

  return (
    <div className={styles['activity']}>
      <DisclosureRow
        label={commandRanLabel(entries.length)}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      />

      {!expanded &&
        failed.map((entry) => (
          <p key={entry.id} className={styles['activityFailure']}>
            {`${entry.command} exited ${entry.exitCode}`}
          </p>
        ))}

      {expanded && (
        <div className={styles['commandCards']}>
          {entries.map((entry) => (
            <CommandCard key={entry.id} entry={entry} verbose={verbose} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyActions({ text, at }: { text: string; at: string }) {
  const [copied, setCopied] = useState(false);
  const { isSpeaking, isSupported, speak, stop } = useTTS();

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <div className={styles['actionRow']}>
      <button
        type="button"
        className={styles['actionButton']}
        aria-label={CODE_COPY.copyReply}
        onClick={() => void copy()}
      >
        {copied ? (
          <Check size={ACTION_GLYPH_SIZE} aria-hidden="true" />
        ) : (
          <Copy size={ACTION_GLYPH_SIZE} aria-hidden="true" />
        )}
        <span>{copied ? CODE_COPY.copiedReply : CODE_COPY.copyReply}</span>
      </button>
      {isSupported && (
        <button
          type="button"
          className={styles['actionButton']}
          aria-label={isSpeaking ? CODE_COPY.stopReading : CODE_COPY.readAloud}
          onClick={() => (isSpeaking ? stop() : speak(text))}
        >
          {isSpeaking ? (
            <Square size={ACTION_GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <Volume2 size={ACTION_GLYPH_SIZE} aria-hidden="true" />
          )}
          <span>{isSpeaking ? CODE_COPY.stopReading : CODE_COPY.readAloud}</span>
        </button>
      )}
      <span className={styles['actionTime']}>{formatRelativeTime(at)}</span>
    </div>
  );
}

function RunningRow({ startedAt, phase }: { startedAt: string; phase: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CODE_TIMING.elapsedTickMs);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = formatElapsed(now - new Date(startedAt).getTime());

  return (
    <div className={styles['runningRow']} role="status">
      <AgiMark size={MARK_SIZE} spinning />
      <span>{`${elapsed} · ${phase}`}</span>
    </div>
  );
}

export interface CodeTranscriptProps {
  session: CloudCodeSession;
  items: CodeTranscriptItem[];
  approvals: CodeApprovalPrompt[];
  busy: boolean;
  busySince: string | null;
  verbose: boolean;
  onDecideApproval: (approval: CodeApprovalPrompt, decision: 'approve' | 'reject') => void;
}

export function CodeTranscript({
  session,
  items,
  approvals,
  busy,
  busySince,
  verbose,
  onDecideApproval,
}: CodeTranscriptProps) {
  const lastReplyId = [...items].reverse().find((item) => item.kind === 'reply')?.id ?? null;
  const cloning = session.state === 'provisioning' && Boolean(session.repositoryUrl);

  return (
    <div className={styles['transcript']}>
      <InitializedSession session={session} />

      {items.map((item) => {
        if (item.kind === 'commands') {
          return <CommandGroup key={item.id} entries={item.entries} verbose={verbose} />;
        }
        if (item.kind === 'task') {
          return (
            <p key={item.id} className={styles['task']}>
              {item.text}
            </p>
          );
        }
        return (
          <div key={item.id} className={styles['replyBlock']}>
            {item.text && (
              <div className={styles['reply']}>
                <MarkdownContent content={item.text} />
              </div>
            )}
            <p
              className={
                stopReasonIsFailure(item.stopReason)
                  ? styles['activityFailure']
                  : styles['statusLine']
              }
            >
              {stopReasonLabel(item.stopReason)}
            </p>
            {item.id === lastReplyId && item.text && <ReplyActions text={item.text} at={item.at} />}
          </div>
        );
      })}

      {approvals.map((approval) => (
        <div
          key={`${approval.turnId}:${approval.stepIndex}`}
          className={styles['approval']}
          role="group"
          aria-label={CODE_COPY.approvalHeading}
        >
          <span className={styles['approvalHeading']}>{CODE_COPY.approvalHeading}</span>
          <span>{approval.reason}</span>
          <pre className={styles['approvalCommand']}>{approval.command}</pre>
          <div className={styles['approvalActions']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={busy}
              onClick={() => onDecideApproval(approval, 'reject')}
            >
              {CODE_COPY.reject}
            </button>
            <button
              type="button"
              className={styles['primaryButton']}
              disabled={busy}
              onClick={() => onDecideApproval(approval, 'approve')}
            >
              {CODE_COPY.approve}
            </button>
          </div>
        </div>
      ))}

      {cloning && (
        <div className={styles['activityRow']} role="status">
          <Spinner size="sm" aria-hidden="true" />
          <span>{CODE_COPY.cloningRepository}</span>
        </div>
      )}

      {busy && busySince && <RunningRow startedAt={busySince} phase={CODE_COPY.agentWorking} />}

      {!busy && items.length > 0 && (
        <div className={styles['idleMark']} aria-hidden="true">
          <AgiMark size={MARK_SIZE} />
        </div>
      )}
    </div>
  );
}
