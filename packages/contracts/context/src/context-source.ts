export const CONTEXT_SOURCE_CLASSES = [
  'account_memory',
  'past_chat',
  'project_instruction',
  'project_knowledge_file',
  'project_sibling_chat',
  'library_file',
  'user_upload',
  'connector_result',
  'web_result',
  'security_policy',
  'agent_instruction',
  'template_instruction',
  'local_repository_instruction',
  'current_task_state',
] as const;

export type ContextSourceClass = (typeof CONTEXT_SOURCE_CLASSES)[number];

export const CONTEXT_ORIGINS = [
  'account_store',
  'conversation_store',
  'project_store',
  'workspace_policy',
  'request_payload',
  'local_device',
  'external_fetch',
  'connector',
  'run_state',
] as const;

export type ContextOrigin = (typeof CONTEXT_ORIGINS)[number];

export const CONTEXT_AUTHORSHIPS = [
  'user',
  'assistant',
  'operator',
  'third_party',
  'mixed',
] as const;

export type ContextAuthorship = (typeof CONTEXT_AUTHORSHIPS)[number];

export type ContextTrustLevel = 'instruction' | 'reference' | 'untrusted';

export interface ContextSourceProducer {
  readonly surface: 'web' | 'cli' | 'desktop' | 'mobile' | 'extension';
  readonly module: string;
  readonly loader: string;
}

export interface ContextSourceClassPolicy {
  readonly sourceClass: ContextSourceClass;
  readonly origin: ContextOrigin;
  /** `'per_source'` means the row decides, so every source of this class must state it. */
  readonly authoredBy: ContextAuthorship | 'per_source';
  readonly isExternal: boolean;
  readonly isInstruction: boolean;
  readonly canGenerateMemory: boolean;
  readonly canBeRetrieved: boolean;
  readonly canBeExported: boolean;
  readonly fenceTag: string | null;
  /** Loaders that already emit this class as a typed source; empty until one does. */
  readonly producedBy: readonly ContextSourceProducer[];
}

const POLICIES: { readonly [K in ContextSourceClass]: ContextSourceClassPolicy } = {
  account_memory: {
    sourceClass: 'account_memory',
    origin: 'account_store',
    authoredBy: 'user',
    isExternal: false,
    isInstruction: false,
    canGenerateMemory: true,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: 'account_memories',
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/lib/services/managed-memory-context-service.ts',
        loader: 'loadManagedMemoryContext',
      },
    ],
  },
  past_chat: {
    sourceClass: 'past_chat',
    origin: 'conversation_store',
    authoredBy: 'per_source',
    isExternal: false,
    isInstruction: false,
    canGenerateMemory: true,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: 'past_chats',
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/lib/services/past-chat-context-service.ts',
        loader: 'loadPastChatExcerpts',
      },
    ],
  },
  project_instruction: {
    sourceClass: 'project_instruction',
    origin: 'project_store',
    authoredBy: 'user',
    isExternal: false,
    isInstruction: true,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: null,
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/lib/services/project-context-service.ts',
        loader: 'loadProjectContext',
      },
    ],
  },
  project_knowledge_file: {
    sourceClass: 'project_knowledge_file',
    origin: 'project_store',
    authoredBy: 'third_party',
    isExternal: true,
    isInstruction: false,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: 'project_knowledge',
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/lib/services/project-context-service.ts',
        loader: 'loadProjectContext',
      },
    ],
  },
  project_sibling_chat: {
    sourceClass: 'project_sibling_chat',
    origin: 'project_store',
    authoredBy: 'mixed',
    isExternal: false,
    isInstruction: false,
    canGenerateMemory: true,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: 'project_chats',
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/lib/services/project-context-service.ts',
        loader: 'loadProjectContext',
      },
    ],
  },
  library_file: {
    sourceClass: 'library_file',
    origin: 'account_store',
    authoredBy: 'per_source',
    isExternal: false,
    isInstruction: false,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: 'library_files',
    producedBy: [],
  },
  user_upload: {
    sourceClass: 'user_upload',
    origin: 'request_payload',
    authoredBy: 'third_party',
    isExternal: true,
    isInstruction: false,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: 'user_uploads',
    producedBy: [],
  },
  connector_result: {
    sourceClass: 'connector_result',
    origin: 'connector',
    authoredBy: 'third_party',
    isExternal: true,
    isInstruction: false,
    canGenerateMemory: false,
    canBeRetrieved: false,
    canBeExported: false,
    fenceTag: 'connector_results',
    producedBy: [],
  },
  web_result: {
    sourceClass: 'web_result',
    origin: 'external_fetch',
    authoredBy: 'third_party',
    isExternal: true,
    isInstruction: false,
    canGenerateMemory: false,
    canBeRetrieved: false,
    canBeExported: false,
    fenceTag: 'web_results',
    producedBy: [],
  },
  security_policy: {
    sourceClass: 'security_policy',
    origin: 'workspace_policy',
    authoredBy: 'operator',
    isExternal: false,
    isInstruction: true,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: false,
    fenceTag: null,
    producedBy: [],
  },
  agent_instruction: {
    sourceClass: 'agent_instruction',
    origin: 'run_state',
    authoredBy: 'operator',
    isExternal: false,
    isInstruction: true,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: null,
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts',
        loader: 'agiWorkGoalContextSource',
      },
    ],
  },
  template_instruction: {
    sourceClass: 'template_instruction',
    origin: 'project_store',
    authoredBy: 'operator',
    isExternal: false,
    isInstruction: true,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: null,
    producedBy: [],
  },
  local_repository_instruction: {
    sourceClass: 'local_repository_instruction',
    origin: 'local_device',
    authoredBy: 'user',
    isExternal: false,
    isInstruction: true,
    canGenerateMemory: false,
    canBeRetrieved: false,
    canBeExported: false,
    fenceTag: null,
    producedBy: [],
  },
  current_task_state: {
    sourceClass: 'current_task_state',
    origin: 'run_state',
    authoredBy: 'assistant',
    isExternal: false,
    isInstruction: true,
    canGenerateMemory: false,
    canBeRetrieved: true,
    canBeExported: true,
    fenceTag: null,
    producedBy: [
      {
        surface: 'web',
        module: 'apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts',
        loader: 'agiWorkPlanContextSource',
      },
    ],
  },
};

export function contextSourceClassPolicy(
  sourceClass: ContextSourceClass,
): ContextSourceClassPolicy {
  return POLICIES[sourceClass];
}

export function contextSourceClassPolicies(): readonly ContextSourceClassPolicy[] {
  return CONTEXT_SOURCE_CLASSES.map((sourceClass) => POLICIES[sourceClass]);
}

export function contextSourceClassesAwaitingProducer(): readonly ContextSourceClass[] {
  return CONTEXT_SOURCE_CLASSES.filter(
    (sourceClass) => POLICIES[sourceClass].producedBy.length === 0,
  );
}

export function contextTrustLevel(policy: ContextSourceClassPolicy): ContextTrustLevel {
  if (policy.isInstruction) return 'instruction';
  return policy.isExternal ? 'untrusted' : 'reference';
}

export interface ContextTrust {
  readonly level: ContextTrustLevel;
  readonly isExternal: boolean;
  readonly isInstruction: boolean;
  readonly isUserAuthored: boolean;
  readonly isMerelyData: boolean;
  readonly canGenerateMemory: boolean;
  readonly canBeRetrieved: boolean;
  readonly canBeExported: boolean;
  readonly requiresFence: boolean;
  readonly fenceTag: string | null;
}

export interface ContextProvenance {
  readonly origin: ContextOrigin;
  readonly authoredBy: ContextAuthorship;
  readonly locator: string;
  readonly recordId?: string;
  readonly conversationId?: string;
  readonly projectId?: string;
  readonly ownerUserId?: string;
  readonly organizationId?: string;
  readonly capturedAt?: string;
}

export interface ContextSource {
  readonly id: string;
  readonly sourceClass: ContextSourceClass;
  readonly provenance: ContextProvenance;
  readonly trust: ContextTrust;
}

export interface ContextSourceInput {
  readonly sourceClass: ContextSourceClass;
  readonly locator: string;
  readonly authoredBy?: ContextAuthorship;
  readonly recordId?: string | null;
  readonly conversationId?: string | null;
  readonly projectId?: string | null;
  readonly ownerUserId?: string | null;
  readonly organizationId?: string | null;
  readonly capturedAt?: string | null;
}

function optional(
  key: keyof ContextProvenance,
  value: string | null | undefined,
): Partial<ContextProvenance> {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? { [key]: trimmed } : {};
}

export function contextSource(input: ContextSourceInput): ContextSource {
  const policy = POLICIES[input.sourceClass];
  const authoredBy =
    input.authoredBy ?? (policy.authoredBy === 'per_source' ? null : policy.authoredBy);
  if (!authoredBy) {
    throw new Error(
      `Context class ${input.sourceClass} is authored per source; every source must state authoredBy`,
    );
  }
  if (
    input.authoredBy &&
    policy.authoredBy !== 'per_source' &&
    input.authoredBy !== policy.authoredBy
  ) {
    throw new Error(
      `Context class ${input.sourceClass} is authored by ${policy.authoredBy}, not ${input.authoredBy}`,
    );
  }
  const locator = input.locator.trim();
  if (!locator) throw new Error(`Context class ${input.sourceClass} needs a provenance locator`);

  return {
    id: `${input.sourceClass}:${locator}`,
    sourceClass: input.sourceClass,
    provenance: {
      origin: policy.origin,
      authoredBy,
      locator,
      ...optional('recordId', input.recordId),
      ...optional('conversationId', input.conversationId),
      ...optional('projectId', input.projectId),
      ...optional('ownerUserId', input.ownerUserId),
      ...optional('organizationId', input.organizationId),
      ...optional('capturedAt', input.capturedAt),
    },
    trust: {
      level: contextTrustLevel(policy),
      isExternal: policy.isExternal,
      isInstruction: policy.isInstruction,
      isUserAuthored: authoredBy === 'user',
      isMerelyData: !policy.isInstruction,
      canGenerateMemory: policy.canGenerateMemory,
      canBeRetrieved: policy.canBeRetrieved,
      canBeExported: policy.canBeExported,
      requiresFence: !policy.isInstruction,
      fenceTag: policy.fenceTag,
    },
  };
}

// Callers ask the taxonomy rather than naming a tag inline, so a class that gains
// a fence gains it at every call site.
export function contextFenceTag(sourceClass: ContextSourceClass): string {
  const policy = POLICIES[sourceClass];
  if (!policy.fenceTag) {
    throw new Error(`Context class ${sourceClass} is trusted as instruction and is never fenced`);
  }
  return policy.fenceTag;
}

export function isContextSourceClass(value: unknown): value is ContextSourceClass {
  return typeof value === 'string' && (CONTEXT_SOURCE_CLASSES as readonly string[]).includes(value);
}
