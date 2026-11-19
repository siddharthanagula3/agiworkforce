import type {
  RemoteCodeDiff,
  RemoteCodeToolRecord,
  RemoteCodeTranscriptEntry,
} from '@agiworkforce/types';
import type { RemoteCodeThread } from '../remote-code/store';

export const CODE_SESSION_COPY = Object.freeze({
  opening: 'Opening the session on Desktop…',
  placeholder: 'Message this session',
  queuePlaceholder: 'Queue for after this turn',
  steerPlaceholder: 'Stop this turn and send',
  inputLabel: 'Message for this session',
  send: 'Send to this session',
  queue: 'Queue for after this turn',
  stop: 'Stop the current turn',
  sendFailed: 'Not sent. Check the connection to your computer and try again.',
  working: 'Working',
  thinking: 'Thinking',
  thought: 'Thought process',
  queued: 'Queued for after this turn',
  loadEarlier: 'Load earlier messages',
  jumpToLatest: 'Jump to latest',
  question: 'Question',
  answerAtComputer: 'Answer on your computer',
  skipQuestion: 'Skip',
  answerPlaceholder: 'Type your answer',
  sendAnswer: 'Send answer',
  answerFailed: 'The answer was not sent. Check the connection to your computer and try again.',
  changes: 'Changes',
  closeChanges: 'Close changes',
  tests: 'Test results',
  files: 'Files',
  newFile: 'New file',
  noCounts: 'No counts in the output',
  diffTruncated: 'The diff is longer than a phone view. Open it on Desktop to read the rest.',
  more: 'More about this session',
  planUsage: 'Plan usage',
  device: 'This computer',
  readAloud: 'Read aloud',
  stopReading: 'Stop reading',
});

export type CodeTimelineItem =
  | { kind: 'user'; key: string; text: string; turnId?: string }
  | { kind: 'reply'; key: string; text: string; turnId?: string }
  | { kind: 'thinking'; key: string; text: string; turnId: string; live: boolean }
  | { kind: 'work'; key: string; tools: RemoteCodeToolRecord[]; turnId: string | null }
  | { kind: 'partial'; key: string; text: string }
  | { kind: 'queued'; key: string; text: string };

function turnKey(message: RemoteCodeTranscriptEntry): string | null {
  return message.turnId ? `${message.role}:${message.turnId}` : null;
}

/**
 * The conversation page is read from the computer on request, so it can be
 * older than the session's own recent messages. Those that follow the last one
 * the page already holds are added behind it. A message with no turn cannot be
 * matched against the page, so it waits for the next page rather than risk
 * appearing twice.
 */
export function displayedCodeMessages(thread: RemoteCodeThread): RemoteCodeTranscriptEntry[] {
  if (!thread.transcript) return thread.messages;
  const held = new Set(thread.transcript.messages.flatMap((message) => turnKey(message) ?? []));
  let lastHeld = -1;
  thread.messages.forEach((message, position) => {
    const key = turnKey(message);
    if (key && held.has(key)) lastHeld = position;
  });
  const newer = thread.messages.slice(lastHeld + 1).filter((message) => {
    const key = turnKey(message);
    return key !== null && !held.has(key);
  });
  return [...thread.transcript.messages, ...newer];
}

function messageKey(message: RemoteCodeTranscriptEntry, position: number): string {
  return 'index' in message && typeof message.index === 'number'
    ? `m${message.index}`
    : `p${position}`;
}

export function buildCodeSessionTimeline(thread: RemoteCodeThread): CodeTimelineItem[] {
  const active = thread.activeTurnId;
  const toolsByTurn = new Map<string, RemoteCodeToolRecord[]>();
  const untied: RemoteCodeToolRecord[] = [];
  for (const tool of thread.tools) {
    if (!tool.turnId) {
      untied.push(tool);
      continue;
    }
    toolsByTurn.set(tool.turnId, [...(toolsByTurn.get(tool.turnId) ?? []), tool]);
  }
  const thinkingByTurn = new Map(thread.thinking.map((entry) => [entry.turnId, entry.text]));
  const placed = new Set<string>();

  const workOf = (turnId: string, live: boolean): CodeTimelineItem[] => {
    if (placed.has(turnId)) return [];
    placed.add(turnId);
    const thought = thinkingByTurn.get(turnId);
    const tools = toolsByTurn.get(turnId);
    return [
      ...(thought
        ? [{ kind: 'thinking' as const, key: `thinking:${turnId}`, text: thought, turnId, live }]
        : []),
      ...(tools && tools.length > 0
        ? [{ kind: 'work' as const, key: `work:${turnId}`, tools, turnId }]
        : []),
    ];
  };

  const items: CodeTimelineItem[] = [];
  displayedCodeMessages(thread).forEach((message, position) => {
    const key = messageKey(message, position);
    const turn = message.turnId ? { turnId: message.turnId } : {};
    if (message.role === 'user') {
      items.push({ kind: 'user', key, text: message.text, ...turn });
      return;
    }
    if (message.turnId && message.turnId !== active) items.push(...workOf(message.turnId, false));
    items.push({ kind: 'reply', key, text: message.text, ...turn });
  });

  const unanswered = [...new Set([...thinkingByTurn.keys(), ...toolsByTurn.keys()])].filter(
    (turnId) => turnId !== active && !placed.has(turnId),
  );
  for (const turnId of unanswered) {
    let after = -1;
    items.forEach((item, position) => {
      if ('turnId' in item && item.turnId === turnId) after = position;
    });
    const block = workOf(turnId, false);
    if (after >= 0) items.splice(after + 1, 0, ...block);
    else items.push(...block);
  }

  if (untied.length > 0)
    items.push({ kind: 'work', key: 'work:untied', tools: untied, turnId: null });
  if (active) {
    items.push(...workOf(active, true));
    if (thread.partialResponse) {
      items.push({ kind: 'partial', key: `partial:${active}`, text: thread.partialResponse });
    }
  }
  thread.queuedGuidance.forEach((text, position) => {
    items.push({ kind: 'queued', key: `queued:${position}`, text });
  });
  return items;
}

export function codeWorkLabel(tools: readonly RemoteCodeToolRecord[]): string {
  const running = tools.filter((tool) => tool.state === 'running');
  const current = running[running.length - 1];
  if (current) {
    const done = tools.length - running.length;
    const name = current.summary || current.name;
    return done > 0 ? `Running ${name} · ${done} done` : `Running ${name}`;
  }
  return tools.length === 1 ? 'Ran 1 step' : `Ran ${tools.length} steps`;
}

/**
 * Sub-tasks are counted when the computer reads the session, tools as they
 * start and finish. A sub-task is usually started by a tool that is still
 * running, so the larger of the two is shown rather than their sum.
 */
export function codeRunningTaskCount(thread: RemoteCodeThread): number {
  const tools = thread.tools.filter((tool) => tool.state === 'running').length;
  return Math.max(tools, thread.runningTasks);
}

export function codeWorkingLabel(thread: RemoteCodeThread): string {
  const tasks = codeRunningTaskCount(thread);
  return tasks >= 2
    ? `${CODE_SESSION_COPY.working} · ${tasks} running tasks`
    : CODE_SESSION_COPY.working;
}

export function countDiffLines(diffs: readonly RemoteCodeDiff[]): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const diff of diffs) {
    for (const line of diff.patch.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
      else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
    }
  }
  return { added, removed };
}

export function codeChangedFileCount(thread: RemoteCodeThread): number {
  return new Set([
    ...thread.fileChanges.map((change) => change.path),
    ...thread.diffs.map((diff) => diff.path),
  ]).size;
}
