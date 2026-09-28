import 'server-only';

import { z } from 'zod';

import {
  loadManagedMemoryContext,
  loadManagedMemoryPolicy,
  loadProjectMemoryScope,
  loadSuppressedMemorySources,
  type ManagedMemoryContextDb,
} from '@/lib/services/managed-memory-context-service';
import { MEMORY_COMMAND_SOURCE, createMemoryCommandPorts } from '@/lib/services/memory-commands';

export const SAVE_MEMORY_TOOL_NAME = 'save_memory';
export const SEARCH_MEMORY_TOOL_NAME = 'search_memory';
export const FORGET_MEMORY_TOOL_NAME = 'forget_memory';

const MEMORY_TOOL_NAMES: ReadonlySet<string> = new Set([
  SAVE_MEMORY_TOOL_NAME,
  SEARCH_MEMORY_TOOL_NAME,
  FORGET_MEMORY_TOOL_NAME,
]);

const MAX_FACT_CHARS = 500;
const MAX_QUERY_CHARS = 200;
const MIN_SUBJECT_CHARS = 3;
const MAX_SEARCH_RESULTS = 10;

export function isMemoryTool(name: string): boolean {
  return MEMORY_TOOL_NAMES.has(name);
}

export function memoryToolSource(surface: string | null | undefined): string {
  return surface === 'mobile' || surface === 'desktop' ? surface : MEMORY_COMMAND_SOURCE;
}

export function memoryToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: SAVE_MEMORY_TOOL_NAME,
        description:
          'Save one durable fact about the user to their Memory when they ask you to remember something, or when they state a lasting preference or detail they would want used in later chats. Save a single self-contained sentence in the third person. Do not save secrets, passwords, one-off task details or anything the user asked you not to remember.',
        parameters: {
          type: 'object',
          properties: {
            fact: {
              type: 'string',
              maxLength: MAX_FACT_CHARS,
              description: 'The fact to remember, as one sentence.',
            },
          },
          required: ['fact'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: SEARCH_MEMORY_TOOL_NAME,
        description:
          "Search the user's saved Memory for facts relevant to a topic, when the answer may depend on something the user told you in an earlier chat and it is not already in this conversation.",
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              maxLength: MAX_QUERY_CHARS,
              description: 'What to look for, in a few words.',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: FORGET_MEMORY_TOOL_NAME,
        description:
          'Delete saved memories when the user asks you to forget something. Every saved memory whose text contains the subject is deleted, so use the most specific words the user gave. The user approves the call before anything is deleted.',
        parameters: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              minLength: MIN_SUBJECT_CHARS,
              maxLength: MAX_QUERY_CHARS,
              description: 'Words that appear in the memories to delete.',
            },
          },
          required: ['subject'],
        },
      },
    },
  ];
}

export interface MemoryToolContext {
  db: ManagedMemoryContextDb;
  userId: string;
  organizationId: string | null;
  source: string;
  temporaryChat: boolean;
  projectId?: string | null;
}

const TEMPORARY_CHAT_MEMORY_MESSAGE =
  'This is a temporary chat, so it neither reads nor saves Memory.';

export interface MemoryToolResult {
  content: string;
  isError: boolean;
}

const FactArgs = z.object({ fact: z.string().trim().min(1).max(MAX_FACT_CHARS) });
const QueryArgs = z.object({ query: z.string().trim().min(1).max(MAX_QUERY_CHARS) });
const SubjectArgs = z.object({
  subject: z.string().trim().min(MIN_SUBJECT_CHARS).max(MAX_QUERY_CHARS),
});

function invalid(name: string): MemoryToolResult {
  return { content: `${name} was called with invalid arguments.`, isError: true };
}

async function saveMemory(
  args: Record<string, unknown>,
  context: MemoryToolContext,
): Promise<MemoryToolResult> {
  const parsed = FactArgs.safeParse(args);
  if (!parsed.success) return invalid(SAVE_MEMORY_TOOL_NAME);
  if (context.temporaryChat) {
    return {
      content: JSON.stringify({ saved: false, reason: TEMPORARY_CHAT_MEMORY_MESSAGE }),
      isError: false,
    };
  }
  const ports = createMemoryCommandPorts(context.db, {
    userId: context.userId,
    organizationId: context.organizationId,
    projectId: context.projectId ?? null,
    source: context.source,
  });
  const eligibility = await ports.checkEligibility(parsed.data.fact);
  if (!eligibility.eligible) {
    return {
      content: JSON.stringify({ saved: false, reason: eligibility.message }),
      isError: false,
    };
  }
  const stored = await ports.store({ fact: parsed.data.fact, category: 'fact' });
  return {
    content: JSON.stringify({
      saved: stored.stored,
      alreadyKnown: stored.alreadyKnown,
    }),
    isError: false,
  };
}

async function searchMemory(
  args: Record<string, unknown>,
  context: MemoryToolContext,
): Promise<MemoryToolResult> {
  const parsed = QueryArgs.safeParse(args);
  if (!parsed.success) return invalid(SEARCH_MEMORY_TOOL_NAME);
  if (context.temporaryChat) {
    return {
      content: JSON.stringify({ memories: [], reason: TEMPORARY_CHAT_MEMORY_MESSAGE }),
      isError: false,
    };
  }
  const [policy, suppressedSources, scope] = await Promise.all([
    loadManagedMemoryPolicy(context.db, {
      userId: context.userId,
      organizationId: context.organizationId,
    }),
    loadSuppressedMemorySources(context.db, { userId: context.userId }),
    loadProjectMemoryScope(context.db, {
      userId: context.userId,
      projectId: context.projectId ?? null,
    }),
  ]);
  if (!policy.enabled) {
    return {
      content: JSON.stringify({ memories: [], reason: 'Memory is off for this account.' }),
      isError: false,
    };
  }
  const memories = await loadManagedMemoryContext(context.db, {
    userId: context.userId,
    organizationId: context.organizationId,
    suppressedSources,
    scope,
    policy,
    query: parsed.data.query,
  });
  return {
    content: JSON.stringify({
      memories: memories.slice(0, MAX_SEARCH_RESULTS).map((memory) => memory.content),
    }),
    isError: false,
  };
}

async function forgetMemory(
  args: Record<string, unknown>,
  context: MemoryToolContext,
): Promise<MemoryToolResult> {
  const parsed = SubjectArgs.safeParse(args);
  if (!parsed.success) return invalid(FORGET_MEMORY_TOOL_NAME);
  const ports = createMemoryCommandPorts(context.db, {
    userId: context.userId,
    organizationId: context.organizationId,
    projectId: context.projectId ?? null,
    source: context.source,
  });
  const matches = await ports.find(parsed.data.subject);
  if (matches.length === 0) {
    return { content: JSON.stringify({ forgotten: [] }), isError: false };
  }
  const removed = await ports.remove(matches.map((match) => match.id));
  return {
    content: JSON.stringify({ forgotten: removed.map((memory) => memory.content) }),
    isError: false,
  };
}

export async function executeMemoryTool(
  name: string,
  args: Record<string, unknown>,
  context: MemoryToolContext,
): Promise<MemoryToolResult> {
  if (name === SAVE_MEMORY_TOOL_NAME) return saveMemory(args, context);
  if (name === SEARCH_MEMORY_TOOL_NAME) return searchMemory(args, context);
  if (name === FORGET_MEMORY_TOOL_NAME) return forgetMemory(args, context);
  return { content: `Unknown tool: ${name}`, isError: true };
}
