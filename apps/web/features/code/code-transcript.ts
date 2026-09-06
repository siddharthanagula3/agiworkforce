import type {
  CloudCodeAgentStep,
  CloudCodeAgentStopReason,
  CloudCodeTerminalEntry,
} from '@agiworkforce/types';

export interface CodeApprovalPrompt {
  turnId: string;
  stepIndex: number;
  command: string;
  reason: string;
  goal: string;
}

export interface CodeTurnRecord {
  id: string;
  /** The server's turn id once it is known, which is what a reload dedupes on. */
  turnId: string | null;
  at: string;
  goal: string;
  stopReason: CloudCodeAgentStopReason | null;
  finalMessage: string;
  errorMessage: string | null;
  steps: CloudCodeAgentStep[];
  /** A turn the reader can start again, unchanged, from the transcript. */
  retryable: boolean;
}

export type CodeTranscriptItem =
  | { kind: 'commands'; id: string; at: string; entries: CloudCodeTerminalEntry[] }
  | { kind: 'task'; id: string; at: string; text: string }
  | { kind: 'steps'; id: string; at: string; steps: CloudCodeAgentStep[] }
  | {
      kind: 'reply';
      id: string;
      at: string;
      text: string;
      stopReason: CloudCodeAgentStopReason;
      retryGoal: string | null;
    };

/**
 * Terminal entries and agent turns are two independent histories of the same
 * session, so interleaving by timestamp keeps each block where it happened
 * rather than pinning either one to the end of the transcript.
 */
/** A task, its steps and its reply carry one timestamp, so rank breaks the tie. */
const KIND_RANK: Record<CodeTranscriptItem['kind'], number> = {
  commands: 0,
  task: 1,
  steps: 2,
  reply: 3,
};

export function buildCodeTranscript(
  entries: CloudCodeTerminalEntry[],
  turns: CodeTurnRecord[],
): CodeTranscriptItem[] {
  const items: CodeTranscriptItem[] = [];

  for (const entry of entries) {
    items.push({ kind: 'commands', id: entry.id, at: entry.startedAt, entries: [entry] });
  }

  for (const turn of turns) {
    items.push({ kind: 'task', id: `${turn.id}-task`, at: turn.at, text: turn.goal });
    if (turn.steps.length > 0) {
      items.push({ kind: 'steps', id: `${turn.id}-steps`, at: turn.at, steps: turn.steps });
    }
    if (!turn.stopReason) continue;
    const text = [turn.finalMessage, turn.errorMessage].filter(Boolean).join('\n\n');
    items.push({
      kind: 'reply',
      id: `${turn.id}-reply`,
      at: turn.at,
      text,
      stopReason: turn.stopReason,
      retryGoal: turn.retryable ? turn.goal : null,
    });
  }

  items.sort((a, b) => {
    const byTime = a.at.localeCompare(b.at);
    if (byTime !== 0) return byTime;
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    return a.id.localeCompare(b.id);
  });

  const grouped: CodeTranscriptItem[] = [];
  for (const item of items) {
    const previous = grouped[grouped.length - 1];
    if (item.kind === 'commands' && previous?.kind === 'commands') {
      previous.entries = [...previous.entries, ...item.entries];
      continue;
    }
    grouped.push(item.kind === 'commands' ? { ...item, entries: [...item.entries] } : item);
  }

  return grouped;
}
