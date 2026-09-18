import 'server-only';

import {
  explicitForgetHandler,
  explicitRememberHandler,
  parseExplicitMemoryCommand,
  type ExplicitForgetOutcome,
  type ExplicitMemoryCommand,
  type ExplicitMemoryPorts,
  type ExplicitRememberOutcome,
  type MemoryCommandMatch,
} from '@agiworkforce/agent-core';
import { logger } from '@/lib/logger';
import {
  MemoryIneligibleError,
  activeMemoryPredicate,
  loadMemoryExclusions,
  loadOrganizationMemoryPolicy,
  matchedMemoryExclusion,
  memoryEligibilityGate,
  workspaceMemoryPredicate,
  writeConsolidatedMemory,
  type ManagedMemoryContextDb,
} from '@/lib/services/managed-memory-context-service';
import { excludedMemoryMessage } from '@/lib/services/memory-write-service';

export const MEMORY_COMMAND_SOURCE = 'web';

/** A search that matched everything would offer to delete everything. */
const MIN_FORGET_SUBJECT_CHARS = 3;
const MAX_FORGET_MATCHES = 25;

export interface MemoryCommandScope {
  userId: string;
  organizationId: string | null;
  projectId?: string | null;
  conversationId?: string | null;
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

      const organizationPolicy = await loadOrganizationMemoryPolicy(db, scope.organizationId);
      const decision = memoryEligibilityGate({
        write: {
          userId: scope.userId,
          content: fact,
          category: null,
          source: MEMORY_COMMAND_SOURCE,
          organizationId: scope.organizationId,
          projectId: scope.projectId ?? null,
        },
        organizationPolicy,
      });
      if (decision.eligible) return { eligible: true };
      return {
        eligible: false,
        reason:
          decision.reason === 'organization_memory_disabled' ? 'memory_disabled' : 'ineligible',
        message: decision.message,
      };
    },

    store: async ({ fact, category }) => {
      try {
        const row = await writeConsolidatedMemory(db, {
          userId: scope.userId,
          content: fact,
          category,
          source: MEMORY_COMMAND_SOURCE,
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
      return db.query<MemoryCommandMatch>(
        `select id::text as id, content
           from user_memories
          where user_id = $1
            and ${activeMemoryPredicate()}
            and ${workspaceMemoryPredicate(3)}
            and content ilike $2 escape '\\'
          order by pinned desc, updated_at desc
          limit ${MAX_FORGET_MATCHES}`,
        [scope.userId, likePattern(trimmed), scope.organizationId],
      );
    },

    /**
     * Soft delete, exactly as the Settings endpoint does: the row leaves every
     * read immediately because `activeMemoryPredicate` filters it, and
     * `sweepExpiredMemories` clears the content on expiry. That window is the
     * only audit retention there is, and it is the same one for both paths.
     */
    remove: async (ids) => {
      if (ids.length === 0) return [];
      return db.query<MemoryCommandMatch>(
        `update user_memories
            set is_deleted = true, updated_at = now()
          where user_id = $1
            and id = any($2::uuid[])
            and is_deleted = false
            and ${workspaceMemoryPredicate(3)}
        returning id::text as id, content`,
        [scope.userId, ids, scope.organizationId],
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
