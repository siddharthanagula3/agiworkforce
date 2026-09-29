import { Alert } from 'react-native';
import {
  explicitForgetHandler,
  explicitRememberHandler,
  parseExplicitMemoryCommand,
  type ExplicitMemoryPorts,
  type MemoryCommandKind,
  type MemoryCommandMatch,
} from '@agiworkforce/agent-core';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { syncNow } from '@/services/cloudSyncEngine';
import { deleteMemoryFact, getMemoryFact, searchMemoryByText } from '@/storage/memory';
import type { StatusStep } from '@/types/chat';
import { writeLocalMemoryFact } from './localMemoryWriter';
import { prohibitedMemoryCategory, prohibitedMemoryMessage } from '@agiworkforce/context';

const MEMORY_COMMANDS_PATH = '/api/memory/commands';
const MIN_FORGET_SUBJECT_CHARS = 3;
const MAX_FORGET_MATCHES = 25;
const MEMORY_STEP_ID = 'memory-command';
const MEMORY_OFF_MESSAGE = 'Memory is turned off in your settings.';
const MEMORY_UNAVAILABLE_MESSAGE = 'Memory did not answer, so nothing was changed.';
const NOTHING_FORGOTTEN_MESSAGE = 'Nothing was forgotten.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANGED_STATUSES: ReadonlySet<MemoryCommandStatus> = new Set(['stored', 'forgotten']);

export type MemoryCommandStatus =
  | 'stored'
  | 'already_known'
  | 'refused'
  | 'forgotten'
  | 'nothing_to_forget'
  | 'confirmation_required';

export interface MemoryCommandReply {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
  message: string;
  memories: MemoryCommandMatch[];
}

export interface MemoryCommandTurnReport {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus | 'failed';
}

export interface MemoryCommandInput {
  executionMode: 'local' | 'cloud';
  message: string;
  conversationId: string | null;
  projectId: string | null;
  memoryEnabled: boolean;
  confirmed?: boolean;
}

interface CloudMemoryCommandResponse {
  command: { kind: MemoryCommandKind; subject: string } | null;
  status?: MemoryCommandStatus;
  message?: string;
  memories?: MemoryCommandMatch[];
}

export function hasMemoryCommand(message: string): boolean {
  return parseExplicitMemoryCommand(message) !== null;
}

function localMemoryPorts(memoryEnabled: boolean): ExplicitMemoryPorts {
  return {
    checkEligibility: async (fact) => {
      if (!memoryEnabled) {
        return { eligible: false, reason: 'memory_disabled', message: MEMORY_OFF_MESSAGE };
      }
      const category = prohibitedMemoryCategory(fact);
      return category
        ? { eligible: false, reason: 'ineligible', message: prohibitedMemoryMessage(category) }
        : { eligible: true };
    },
    store: async ({ fact }) => {
      const result = await writeLocalMemoryFact({ fact, source: 'typed' });
      return result.outcome === 'already_known'
        ? { stored: false, alreadyKnown: true }
        : { stored: true, alreadyKnown: false };
    },
    find: async (subject) => {
      const trimmed = subject.trim();
      if (trimmed.length < MIN_FORGET_SUBJECT_CHARS) return [];
      const rows = await searchMemoryByText(trimmed, MAX_FORGET_MATCHES);
      return rows.map((row) => ({ id: row.id, content: row.fact }));
    },
    remove: async (ids) => {
      const removed: MemoryCommandMatch[] = [];
      for (const id of ids) {
        const row = await getMemoryFact(id);
        if (!row) continue;
        await deleteMemoryFact(id);
        removed.push({ id, content: row.fact });
      }
      return removed;
    },
  };
}

async function runLocalMemoryCommand(
  input: MemoryCommandInput,
): Promise<MemoryCommandReply | null> {
  const command = parseExplicitMemoryCommand(input.message);
  if (!command) return null;
  const ports = localMemoryPorts(input.memoryEnabled);
  if (command.kind === 'remember') {
    const outcome = await explicitRememberHandler(command, ports);
    return { kind: 'remember', status: outcome.status, message: outcome.message, memories: [] };
  }
  const outcome = await explicitForgetHandler(command, ports, {
    confirmed: input.confirmed === true,
  });
  return {
    kind: 'forget',
    status: outcome.status,
    message: outcome.message,
    memories: outcome.removed,
  };
}

function uuidOrNull(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

async function runCloudMemoryCommand(
  input: MemoryCommandInput,
): Promise<MemoryCommandReply | null> {
  const response = await api.post<CloudMemoryCommandResponse>(MEMORY_COMMANDS_PATH, {
    message: input.message,
    conversationId: uuidOrNull(input.conversationId),
    projectId: uuidOrNull(input.projectId),
    ...(input.confirmed ? { confirmed: true } : {}),
  });
  if (!response.command || !response.status || !response.message) return null;
  return {
    kind: response.command.kind,
    status: response.status,
    message: response.message,
    memories: response.memories ?? [],
  };
}

export function runMemoryCommand(input: MemoryCommandInput): Promise<MemoryCommandReply | null> {
  return input.executionMode === 'cloud'
    ? runCloudMemoryCommand(input)
    : runLocalMemoryCommand(input);
}

function memoryStep(message: string, failed: boolean): StatusStep {
  return {
    id: MEMORY_STEP_ID,
    icon: failed ? 'error' : 'success',
    message,
    status: failed ? 'failed' : 'completed',
  };
}

function confirmForget(memories: MemoryCommandMatch[], onForget: () => void, onKeep: () => void) {
  const one = memories.length === 1;
  Alert.alert(
    one ? 'Forget this memory?' : `Forget ${memories.length} memories?`,
    `${memories.map((memory) => `“${memory.content}”`).join('\n')}\n\nChats stop using ${
      one ? 'it' : 'them'
    }, and ${one ? 'it' : 'they'} cannot be restored.`,
    [
      { text: 'Cancel', style: 'cancel', onPress: onKeep },
      { text: 'Forget', style: 'destructive', onPress: onForget },
    ],
    { cancelable: true, onDismiss: onKeep },
  );
}

export async function answerMemoryCommand(
  input: MemoryCommandInput,
  report: (step: StatusStep) => void,
): Promise<MemoryCommandTurnReport | null> {
  let reply: MemoryCommandReply | null;
  try {
    reply = await runMemoryCommand(input);
  } catch (error) {
    report(
      memoryStep(
        error instanceof ApiHttpError && error.message ? error.message : MEMORY_UNAVAILABLE_MESSAGE,
        true,
      ),
    );
    const command = parseExplicitMemoryCommand(input.message);
    return command ? { kind: command.kind, status: 'failed' } : null;
  }
  if (!reply) return null;

  if (reply.status === 'confirmation_required') {
    confirmForget(
      reply.memories,
      () => void answerMemoryCommand({ ...input, confirmed: true }, report),
      () => report(memoryStep(NOTHING_FORGOTTEN_MESSAGE, false)),
    );
    return { kind: reply.kind, status: reply.status };
  }

  report(memoryStep(reply.message, reply.status === 'refused'));
  if (input.executionMode === 'cloud' && CHANGED_STATUSES.has(reply.status)) {
    void syncNow().catch(() => undefined);
  }
  return { kind: reply.kind, status: reply.status };
}
