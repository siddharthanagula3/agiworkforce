import type { CloudCodeTerminalEntry } from '@agiworkforce/types';
import type { CloudCodeAgentStopReason } from './services/cloud-code-api';

export interface CodeApprovalPrompt {
  turnId: string;
  stepIndex: number;
  command: string;
  reason: string;
  goal: string;
}

export interface CodeTurnRecord {
  id: string;
  at: string;
  goal: string;
  stopReason: CloudCodeAgentStopReason | null;
  finalMessage: string;
  errorMessage: string | null;
}

export type CodeTranscriptItem =
  | { kind: 'commands'; id: string; at: string; entries: CloudCodeTerminalEntry[] }
  | { kind: 'task'; id: string; at: string; text: string }
  | {
      kind: 'reply';
      id: string;
      at: string;
      text: string;
      stopReason: CloudCodeAgentStopReason;
    };

/**
 * The agent turn endpoint returns one turn at a time and no turn history, so a
 * reload leaves only the persisted terminal entries. Interleaving by timestamp
 * keeps this tab's turns in place around them rather than pinning either block
 * to the end of the transcript.
 */
/** A task and the reply to it carry the same timestamp, so rank breaks the tie. */
const KIND_RANK: Record<CodeTranscriptItem['kind'], number> = {
  commands: 0,
  task: 1,
  reply: 2,
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
    if (!turn.stopReason) continue;
    const text = [turn.finalMessage, turn.errorMessage].filter(Boolean).join('\n\n');
    items.push({
      kind: 'reply',
      id: `${turn.id}-reply`,
      at: turn.at,
      text,
      stopReason: turn.stopReason,
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
