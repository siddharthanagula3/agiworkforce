import 'server-only';

import {
  explicitForgetHandler,
  explicitRememberHandler,
  parseExplicitMemoryCommand,
  type ExplicitForgetOutcome,
  type ExplicitMemoryCommand,
  type ExplicitMemoryPorts,
  type ExplicitRememberOutcome,
  type MemoryCommandKind,
  type MemoryCommandMatch,
} from '@agiworkforce/agent-core';
import { logger } from '@/lib/logger';
import {
  DELETED_MEMORY_ASSIGNMENTS,
  MemoryIneligibleError,
  activeMemoryPredicate,
  loadMemoryExclusions,
  loadProjectMemoryScope,
  matchedMemoryExclusion,
  memoryScopePredicate,
  memoryWriteAdmission,
  workspaceMemoryPredicate,
  writeConsolidatedMemory,
  type ManagedMemoryContextDb,
  type MemoryIneligibilityReason,
  type MemoryScope,
} from '@/lib/services/managed-memory-context-service';
import { excludedMemoryMessage } from '@/lib/services/memory-write-service';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';

export const MEMORY_COMMAND_SOURCE = 'web';

export const MEMORY_COMMAND_CLIENT_SURFACES: ReadonlySet<CloudChatSurface> =
  new Set<CloudChatSurface>(['web', 'desktop', 'mobile']);

const LABELLED_MEMORY_COMMAND_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'mobile',
  'desktop',
  'chrome',
]);

export function memoryCommandSource(surface: CloudChatSurface | null): string {
  return surface && LABELLED_MEMORY_COMMAND_SURFACES.has(surface) ? surface : MEMORY_COMMAND_SOURCE;
}

/** A search that matched everything would offer to delete everything. */
const MIN_FORGET_SUBJECT_CHARS = 3;
const MAX_FORGET_MATCHES = 25;

export interface MemoryCommandScope {
  userId: string;
  organizationId: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  /** A temporary chat may still forget; it may never teach Memory anything. */
  temporaryChat?: boolean;
  source?: string;
}

const MEMORY_OFF_REASONS: ReadonlySet<MemoryIneligibilityReason> = new Set([
  'user_memory_disabled',
  'organization_memory_disabled',
]);

function commandRefusalReason(reason: MemoryIneligibilityReason) {
  return MEMORY_OFF_REASONS.has(reason) ? ('memory_disabled' as const) : ('ineligible' as const);
}

export type MemoryCommandResult =
  | { kind: 'remember'; command: ExplicitMemoryCommand; outcome: ExplicitRememberOutcome }
  | { kind: 'forget'; command: ExplicitMemoryCommand; outcome: ExplicitForgetOutcome };

function likePattern(subject: string): string {
  return `%${subject.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function createMemoryCommandPorts(
  db: ManagedMemoryContextDb,
  scope: MemoryCommandScope,
): ExplicitMemoryPorts {
  let visibleScope: Promise<MemoryScope> | null = null;
  const visibleMemories = async (values: unknown[]): Promise<string> => {
    visibleScope ??= loadProjectMemoryScope(db, {
      userId: scope.userId,
      projectId: scope.projectId ?? null,
    });
    const resolved = await visibleScope;
    return memoryScopePredicate(resolved, resolved.projectId ? values.push(resolved.projectId) : 0);
  };
  return {
    /**
     * The same gate an extracted fact passes, plus the never-remember list.
     * An explicit ask does not buy a way around either.
     */
    checkEligibility: async (fact) => {
      const exclusion = matchedMemoryExclusion(
        fact,
        await loadMemoryExclusions(db, { userId: scope.userId }),
      );
      if (exclusion !== null) {
        return { eligible: false, reason: 'excluded', message: excludedMemoryMessage(exclusion) };
      }

      const decision = await memoryWriteAdmission(db, {
        userId: scope.userId,
        content: fact,
        category: null,
        source: scope.source ?? MEMORY_COMMAND_SOURCE,
        organizationId: scope.organizationId,
        projectId: scope.projectId ?? null,
        temporaryChat: scope.temporaryChat === true,
      });
      if (decision.eligible) return { eligible: true };
      return {
        eligible: false,
        reason: commandRefusalReason(decision.reason),
        message: decision.message,
      };
    },

    store: async ({ fact, category }) => {
      try {
        const row = await writeConsolidatedMemory(db, {
          userId: scope.userId,
          content: fact,
          category,
          source: scope.source ?? MEMORY_COMMAND_SOURCE,
          organizationId: scope.organizationId,
          projectId: scope.projectId ?? null,
        });
        if (!row) return { stored: false, alreadyKnown: false };
        return { stored: row.outcome === 'inserted', alreadyKnown: row.outcome === 'merged' };
      } catch (error) {
        if (error instanceof MemoryIneligibleError) return { stored: false, alreadyKnown: false };
        throw error;
      }
    },

    find: async (subject) => {
      const trimmed = subject.trim();
      if (trimmed.length < MIN_FORGET_SUBJECT_CHARS) return [];
      const values: unknown[] = [scope.userId, likePattern(trimmed), scope.organizationId];
      const visible = await visibleMemories(values);
      return db.query<MemoryCommandMatch>(
        `select id::text as id, content
           from user_memories
          where user_id = $1
            and ${activeMemoryPredicate()}
            and ${workspaceMemoryPredicate(3)}
            ${visible}
            and content ilike $2 escape '\\'
          order by pinned desc, updated_at desc
          limit ${MAX_FORGET_MATCHES}`,
        values,
      );
    },

    /**
     * The text is read before it is cleared so the reply can name what was
     * forgotten; the stored row keeps no copy of it.
     */
    remove: async (ids) => {
      if (ids.length === 0) return [];
      const values: unknown[] = [scope.userId, ids, scope.organizationId];
      const visible = await visibleMemories(values);
      return db.query<MemoryCommandMatch>(
        `with target as (
           select id, content
             from user_memories
            where user_id = $1
              and id = any($2::uuid[])
              and is_deleted = false
              and ${workspaceMemoryPredicate(3)}
              ${visible}
              for update
         ), purged as (
           update user_memories as memory
              set ${DELETED_MEMORY_ASSIGNMENTS}
             from target
            where memory.user_id = $1 and memory.id = target.id
           returning memory.id
         )
         select target.id::text as id, target.content
           from target
           join purged on purged.id = target.id`,
        values,
      );
    },
  };
}

/**
 * Runs an explicit remember or forget and returns what the chat turn should
 * say. Returns null when the message carried no command, which is the signal to
 * fall through to passive extraction.
 */
export async function runMemoryCommand(
  db: ManagedMemoryContextDb,
  scope: MemoryCommandScope,
  input: { message: string; confirmed?: boolean },
): Promise<MemoryCommandResult | null> {
  const command = parseExplicitMemoryCommand(input.message);
  if (!command) return null;

  const ports = createMemoryCommandPorts(db, scope);
  if (command.kind === 'remember') {
    const outcome = await explicitRememberHandler(command, ports);
    logger.info(
      { userId: scope.userId, status: outcome.status },
      '[memory-commands] explicit remember',
    );
    return { kind: 'remember', command, outcome };
  }

  const outcome = await explicitForgetHandler(command, ports, {
    confirmed: input.confirmed ?? false,
  });
  logger.info(
    {
      userId: scope.userId,
      status: outcome.status,
      removed: outcome.status === 'forgotten' ? outcome.removed.length : 0,
    },
    '[memory-commands] explicit forget',
  );
  return { kind: 'forget', command, outcome };
}

export const MEMORY_COMMAND_TURN_STATUSES = [
  'stored',
  'already_known',
  'refused',
  'confirmation_required',
  'nothing_to_forget',
  'forgotten',
  'failed',
] as const;

export type MemoryCommandTurnStatus = (typeof MEMORY_COMMAND_TURN_STATUSES)[number];

const MEMORY_COMMAND_TURN_OUTCOMES: Readonly<Record<MemoryCommandTurnStatus, string>> = {
  stored: 'It was saved to memory.',
  already_known: 'It was already in memory, so nothing changed.',
  refused:
    'It was not saved: memory is off, or this is something memory does not keep. Do not say you will remember it.',
  confirmation_required:
    'The app is asking the user to confirm the deletion, so nothing has been deleted yet. Do not say it was forgotten.',
  nothing_to_forget: 'No saved memory matched, so nothing was deleted.',
  forgotten: 'The matching memories were deleted.',
  failed: 'Memory did not respond, so nothing changed. Do not say it was saved or deleted.',
};

export function memoryCommandTurnNote(
  message: string,
  reported: { kind: MemoryCommandKind; status: MemoryCommandTurnStatus },
): string | null {
  const command = parseExplicitMemoryCommand(message);
  if (!command || command.kind !== reported.kind) return null;
  return [
    `The user asked you to ${command.kind} ${JSON.stringify(command.subject)}, and the app has already handled it.`,
    MEMORY_COMMAND_TURN_OUTCOMES[reported.status],
    'Tell the user the outcome in one short sentence, and never describe a memory change this note does not report.',
  ].join(' ');
}
