import 'server-only';

import { randomUUID } from 'node:crypto';

import type { ContextSourceClass } from '@agiworkforce/context';
import {
  createPostgresContextManifestStore,
  resolveContext,
  type ContextManifest,
  type ContextSourceLoader,
} from '@agiworkforce/context-engine';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  managedMemoryCitationExcerpt,
  type ManagedMemoryCitation,
  type ManagedMemoryLocalContextResponse,
  type ProjectFileCitation,
} from '@agiworkforce/types';

import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import { logger } from '@/lib/logger';
import {
  instructionLayerForContextClass,
  type InstructionBlock,
} from '@/lib/prompts/instruction-precedence';
import type { PastChatCitation } from '@/lib/past-chat-citation';
import { buildCustomInstructionsPreamble } from '@/lib/server/user-identity';
import {
  DISABLED_MANAGED_MEMORY_POLICY,
  formatManagedMemorySystemPrompt,
  loadManagedMemoryPolicy,
  loadOrganizationContextPolicy,
  loadProjectMemoryScope,
  loadSuppressedMemorySources,
  managedMemoryContextLoader,
  type ManagedMemoryContextDb,
  type ManagedMemoryContextItem,
  type ManagedMemoryPolicy,
} from './managed-memory-context-service';
import {
  formatPastChatContext,
  PAST_CHAT_DEGRADED_NOTICE,
  pastChatCitation,
  pastChatContextLoader,
} from './past-chat-context-service';
import {
  fitProjectContextBlocks,
  loadProjectContext,
  MAX_PROJECT_CONTEXT_CHARS,
  projectContextLoaders,
  renderProjectContextBlocks,
  type LoadedProjectContext,
  type ProjectContextBlock,
} from './project-context-service';

export interface InteractiveTurnContext {
  readonly projectBlocks: readonly ProjectContextBlock[];
  readonly projectCitations: readonly ProjectFileCitation[];
  readonly pastChatPrompt: string | null;
  readonly pastChatSources: readonly PastChatCitation[];
  readonly memoryPrompt: string | null;
  readonly memories: readonly ManagedMemoryContextItem[];
  readonly memoryCitations: readonly ManagedMemoryCitation[];
  readonly manifest: ContextManifest | null;
}

export function accountMemoryRequested(
  surface: CloudChatSurface,
  memoryEnabled: boolean | undefined,
): boolean {
  return surface === 'api' ? memoryEnabled === true : memoryEnabled !== false;
}

function classWithdrawn(manifest: ContextManifest, sourceClass: ContextSourceClass): boolean {
  const entry = manifest.entries.find((candidate) => candidate.sourceClass === sourceClass);
  return entry !== undefined && entry.candidateCount > 0 && entry.includedCount === 0;
}

/**
 * The project as this turn may carry it. Withdrawn classes leave before the
 * budget is spent, so a class the turn was never going to send cannot push an
 * admitted one out of it.
 */
function admittedProjectContext(
  context: LoadedProjectContext,
  manifest: ContextManifest,
): { blocks: ProjectContextBlock[]; citations: ProjectFileCitation[] } {
  const rendered = renderProjectContextBlocks(context);
  const blocks = fitProjectContextBlocks(
    rendered.blocks.filter((block) => !classWithdrawn(manifest, block.sourceClass)),
    MAX_PROJECT_CONTEXT_CHARS,
  );
  const knowledgeSent = blocks.some((block) => block.sourceClass === 'project_knowledge_file');
  return { blocks, citations: knowledgeSent ? rendered.citations : [] };
}

export async function resolveInteractiveTurnContext(
  db: ManagedMemoryContextDb,
  input: {
    turnId: string;
    userId: string;
    organizationId: string | null;
    projectId: string | null;
    conversationId: string | null;
    temporaryChat: boolean;
    surface: CloudChatSurface;
    memoryEnabled: boolean | undefined;
    policy: ManagedMemoryPolicy;
    query: string;
    projectContext: LoadedProjectContext | null;
    recordManifest?: boolean;
  },
): Promise<InteractiveTurnContext> {
  const includeMemory =
    input.policy.enabled &&
    !input.temporaryChat &&
    accountMemoryRequested(input.surface, input.memoryEnabled);
  const includePastChats =
    input.policy.searchPastChats &&
    !input.temporaryChat &&
    input.surface !== 'api' &&
    input.memoryEnabled !== false &&
    input.query.length > 0;
  if (!includeMemory && !includePastChats && !input.projectContext) {
    return {
      projectBlocks: [],
      projectCitations: [],
      pastChatPrompt: null,
      pastChatSources: [],
      memoryPrompt: null,
      memories: [],
      memoryCitations: [],
      manifest: null,
    };
  }

  const [suppressedSources, scope] = await Promise.all([
    includeMemory ? loadSuppressedMemorySources(db, { userId: input.userId }) : Promise.resolve([]),
    includeMemory || includePastChats
      ? loadProjectMemoryScope(db, { userId: input.userId, projectId: input.projectId })
      : Promise.resolve(undefined),
  ]);

  const memoryLoader = includeMemory
    ? managedMemoryContextLoader(db, {
        userId: input.userId,
        organizationId: input.organizationId,
        suppressedSources,
        ...(scope ? { scope } : {}),
        query: input.query,
      })
    : null;
  const pastChatLoader = includePastChats
    ? pastChatContextLoader(db, {
        userId: input.userId,
        query: input.query,
        organizationId: input.organizationId,
        currentConversationId: input.conversationId,
        ...(scope ? { scope } : {}),
      })
    : null;
  const loaders: ContextSourceLoader[] = [
    ...(input.projectContext ? projectContextLoaders(input.projectContext) : []),
    ...(pastChatLoader ? [pastChatLoader] : []),
    ...(memoryLoader ? [memoryLoader] : []),
  ];

  const resolution = await resolveContext({
    turnId: input.turnId,
    actor: {
      userId: input.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
    },
    policy: await loadOrganizationContextPolicy(db, input.organizationId),
    loaders,
    temporaryChat: input.temporaryChat,
    onLoaderError: (sourceClass, error) => {
      logger.warn(
        { error, userId: input.userId, turnId: input.turnId, sourceClass },
        'A context source failed to load; the turn continues without it',
      );
    },
  });

  if (!input.temporaryChat && input.recordManifest !== false) {
    void createPostgresContextManifestStore(db)
      .write(resolution.manifest)
      .catch((error: unknown) => {
        logger.warn(
          { error, userId: input.userId, turnId: input.turnId },
          'The turn context manifest could not be stored',
        );
      });
  }

  const memoryItems = memoryLoader
    ? resolution.itemsOf('account_memory').flatMap((item) => {
        const memory = memoryLoader.itemFor(item.source.id);
        return memory ? [{ memory, recordId: item.source.provenance.recordId }] : [];
      })
    : [];
  const memories = memoryItems.map(({ memory }) => memory);
  const memoryCitations = memoryItems.flatMap(({ memory, recordId }) =>
    recordId ? [{ id: recordId, excerpt: managedMemoryCitationExcerpt(memory.content) }] : [],
  );
  const excerpts = pastChatLoader
    ? resolution.itemsOf('past_chat').flatMap((item) => {
        const excerpt = pastChatLoader.excerptFor(item.source.id);
        return excerpt ? [{ ...excerpt, content: item.text }] : [];
      })
    : [];
  const recallDegraded = pastChatLoader?.degraded() === true;
  const project = input.projectContext
    ? admittedProjectContext(input.projectContext, resolution.manifest)
    : { blocks: [], citations: [] };

  return {
    projectBlocks: project.blocks,
    projectCitations: project.citations,
    pastChatPrompt: recallDegraded ? PAST_CHAT_DEGRADED_NOTICE : formatPastChatContext(excerpts),
    pastChatSources: recallDegraded ? [] : excerpts.map(pastChatCitation),
    memoryPrompt: formatManagedMemorySystemPrompt(memories),
    memories,
    memoryCitations,
    manifest: resolution.manifest,
  };
}

interface PersonalContextParts {
  readonly instructions: string | null;
  readonly memory: string | null;
  readonly pastChats: string | null;
  readonly memoryCitations: readonly ManagedMemoryCitation[];
  readonly projectBlocks: readonly ProjectContextBlock[];
  readonly projectCitations: readonly ProjectFileCitation[];
}

export type FreeOfferingPersonalContext =
  | {
      readonly status: 'ready';
      readonly blocks: readonly InstructionBlock[];
      readonly projectBlocks: readonly ProjectContextBlock[];
      readonly projectCitations: readonly ProjectFileCitation[];
      readonly memoryCitations: readonly ManagedMemoryCitation[];
    }
  | { readonly status: 'project_unavailable' }
  | { readonly status: 'project_load_failed' };

async function resolvePersonalContextParts(
  db: DatabaseAdapter,
  input: {
    turnId: string;
    userId: string;
    organizationId: string | null;
    projectId: string | null;
    conversationId: string | null;
    temporaryChat: boolean;
    memoryEnabled: boolean | undefined;
    query: string;
    projectContext?: LoadedProjectContext | null;
    recordManifest?: boolean;
  },
): Promise<PersonalContextParts> {
  const [preamble, policy] = await Promise.all([
    buildCustomInstructionsPreamble(db, input.userId, { projectId: input.projectId }).catch(
      (error: unknown) => {
        logger.warn(
          { error, userId: input.userId },
          'Custom instructions read failed; sending none',
        );
        return null;
      },
    ),
    loadManagedMemoryPolicy(db, {
      userId: input.userId,
      organizationId: input.organizationId,
    }).catch((error: unknown) => {
      logger.error(
        { error, userId: input.userId, conversationId: input.conversationId },
        'Managed memory load failed; continuing without account memory',
      );
      return DISABLED_MANAGED_MEMORY_POLICY;
    }),
  ]);
  let context: InteractiveTurnContext | null = null;
  try {
    context = await resolveInteractiveTurnContext(db, {
      turnId: input.turnId,
      userId: input.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      temporaryChat: input.temporaryChat,
      surface: 'web',
      memoryEnabled: input.memoryEnabled,
      policy,
      query: input.query,
      projectContext: input.projectContext ?? null,
      ...(input.recordManifest === undefined ? {} : { recordManifest: input.recordManifest }),
    });
  } catch (error) {
    if (input.projectContext) throw error;
    logger.error(
      { error, userId: input.userId, conversationId: input.conversationId },
      'Turn context could not be assembled; continuing without account memory or past chats',
    );
  }
  return {
    instructions: preamble || null,
    memory: context?.memoryPrompt || null,
    pastChats: context?.pastChatPrompt || null,
    memoryCitations: context?.memoryPrompt ? context.memoryCitations : [],
    projectBlocks: context?.projectBlocks ?? [],
    projectCitations: context?.projectCitations ?? [],
  };
}

export async function resolveFreeOfferingPersonalContext(
  db: DatabaseAdapter,
  input: {
    turnId: string;
    userId: string;
    organizationId: string | null;
    projectId: string | null;
    conversationId: string;
    temporaryChat: boolean;
    memoryEnabled: boolean | undefined;
    personalization: boolean | undefined;
    query: string;
  },
): Promise<FreeOfferingPersonalContext> {
  const personalized = input.personalization !== false;
  let projectContext: LoadedProjectContext | null = null;
  if (input.projectId) {
    try {
      const loaded = await loadProjectContext(db, {
        projectId: input.projectId,
        userId: input.userId,
        currentConversationId: input.conversationId,
        currentUserQuery: input.query,
        semanticRetrieval: false,
      });
      if (!loaded) return { status: 'project_unavailable' };
      projectContext = loaded;
    } catch (error) {
      logger.error(
        { error, userId: input.userId, projectId: input.projectId },
        'Project context could not be loaded; no model request was sent',
      );
      return { status: 'project_load_failed' };
    }
  }
  if (!personalized && !projectContext) {
    return {
      status: 'ready',
      blocks: [],
      projectBlocks: [],
      projectCitations: [],
      memoryCitations: [],
    };
  }
  let parts: PersonalContextParts;
  try {
    parts = await resolvePersonalContextParts(db, {
      ...input,
      memoryEnabled: personalized ? input.memoryEnabled : false,
      projectContext,
    });
  } catch (error) {
    logger.error(
      { error, userId: input.userId, projectId: input.projectId },
      'Project context could not be admitted to the turn; no model request was sent',
    );
    return { status: 'project_load_failed' };
  }
  const project = { projectBlocks: parts.projectBlocks, projectCitations: parts.projectCitations };
  if (!personalized) return { status: 'ready', blocks: [], ...project, memoryCitations: [] };
  const blocks: InstructionBlock[] = [];
  if (parts.instructions !== null) blocks.push({ layer: 'personalized', text: parts.instructions });
  if (parts.memory !== null) {
    blocks.push({ layer: instructionLayerForContextClass('account_memory'), text: parts.memory });
  }
  if (parts.pastChats !== null) {
    blocks.push({ layer: instructionLayerForContextClass('past_chat'), text: parts.pastChats });
  }
  return { status: 'ready', blocks, ...project, memoryCitations: parts.memoryCitations };
}

export async function resolveLocalTurnPersonalContext(
  db: DatabaseAdapter,
  input: { userId: string; organizationId: string | null; projectId: string | null },
): Promise<ManagedMemoryLocalContextResponse> {
  const parts = await resolvePersonalContextParts(db, {
    ...input,
    turnId: randomUUID(),
    conversationId: null,
    temporaryChat: false,
    memoryEnabled: true,
    query: '',
    recordManifest: false,
  });
  return {
    instructions: parts.instructions,
    memory: parts.memory,
    memoryCitations: [...parts.memoryCitations],
  };
}
