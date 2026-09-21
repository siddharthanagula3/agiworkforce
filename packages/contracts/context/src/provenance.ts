export const PROVENANCE_OBJECT_KINDS = [
  'assistant_response',
  'artifact',
  'generated_document',
  'spreadsheet',
  'presentation',
  'research_report',
  'generated_image',
  'generated_video',
  'memory',
  'summary',
  'search_answer',
  'code_patch',
  'automated_external_action',
] as const;

export type ProvenanceObjectKind = (typeof PROVENANCE_OBJECT_KINDS)[number];

export const PROVENANCE_FIELDS = [
  'creatorAccountId',
  'agentId',
  'parentObject',
  'sourceConversationId',
  'sourceTurnId',
  'sourceFileIds',
  'sourceConnectorItemIds',
  'model',
  'providerRoute',
  'promptVersion',
  'toolInvocations',
  'createdAt',
  'schemaVersion',
  'trustMode',
] as const;

export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];

export interface ProvenanceParentObject {
  readonly kind: ProvenanceObjectKind;
  readonly id: string;
}

export interface ProvenanceToolInvocation {
  readonly name: string;
  readonly callId: string;
}

export interface ProvenanceRecord {
  readonly objectKind: ProvenanceObjectKind;
  readonly creatorAccountId: string;
  /** Set only when an unattended run produced the object. */
  readonly agentId: string | null;
  readonly parentObject: ProvenanceParentObject | null;
  readonly sourceConversationId: string | null;
  readonly sourceTurnId: string | null;
  readonly sourceFileIds: readonly string[];
  readonly sourceConnectorItemIds: readonly string[];
  readonly model: string | null;
  readonly providerRoute: string | null;
  readonly promptVersion: string | null;
  readonly toolInvocations: readonly ProvenanceToolInvocation[];
  readonly createdAt: string;
  readonly schemaVersion: string;
  readonly trustMode: string;
}

export const PROVENANCE_SCHEMA_VERSION = '1';

/** Nothing can be produced without an account, a time, a schema and a trust boundary. */
const UNIVERSAL_REQUIRED: readonly ProvenanceField[] = [
  'creatorAccountId',
  'createdAt',
  'schemaVersion',
  'trustMode',
];

export interface ProvenanceKindPolicy {
  readonly objectKind: ProvenanceObjectKind;
  readonly required: readonly ProvenanceField[];
  /** Modules that already stamp this kind; empty until one does. */
  readonly producedBy: readonly { readonly module: string; readonly builder: string }[];
}

function kind(
  objectKind: ProvenanceObjectKind,
  extra: readonly ProvenanceField[],
  producedBy: ProvenanceKindPolicy['producedBy'] = [],
): ProvenanceKindPolicy {
  return { objectKind, required: [...UNIVERSAL_REQUIRED, ...extra], producedBy };
}

const MODEL_AUTHORED: readonly ProvenanceField[] = ['model', 'providerRoute', 'promptVersion'];

const KIND_POLICIES: { readonly [K in ProvenanceObjectKind]: ProvenanceKindPolicy } = {
  assistant_response: kind('assistant_response', [
    ...MODEL_AUTHORED,
    'sourceConversationId',
    'sourceTurnId',
  ]),
  artifact: kind('artifact', [...MODEL_AUTHORED, 'sourceConversationId', 'parentObject']),
  generated_document: kind('generated_document', [...MODEL_AUTHORED, 'sourceConversationId']),
  spreadsheet: kind('spreadsheet', [...MODEL_AUTHORED, 'sourceConversationId']),
  presentation: kind('presentation', [...MODEL_AUTHORED, 'sourceConversationId']),
  research_report: kind('research_report', [
    ...MODEL_AUTHORED,
    'sourceConversationId',
    'toolInvocations',
  ]),
  generated_image: kind('generated_image', [...MODEL_AUTHORED, 'sourceConversationId']),
  generated_video: kind('generated_video', [...MODEL_AUTHORED, 'sourceConversationId']),
  memory: kind(
    'memory',
    ['sourceConversationId', 'sourceTurnId'],
    [
      {
        module: 'apps/web/lib/services/managed-memory-context-service.ts',
        builder: 'memoryProvenance',
      },
    ],
  ),
  summary: kind('summary', [...MODEL_AUTHORED, 'sourceConversationId']),
  search_answer: kind('search_answer', [
    ...MODEL_AUTHORED,
    'sourceConversationId',
    'toolInvocations',
  ]),
  code_patch: kind('code_patch', [...MODEL_AUTHORED, 'sourceFileIds']),
  automated_external_action: kind('automated_external_action', [
    'agentId',
    'sourceConversationId',
    'toolInvocations',
  ]),
};

export function provenanceKindPolicy(objectKind: ProvenanceObjectKind): ProvenanceKindPolicy {
  return KIND_POLICIES[objectKind];
}

export function provenanceKindPolicies(): readonly ProvenanceKindPolicy[] {
  return PROVENANCE_OBJECT_KINDS.map((objectKind) => KIND_POLICIES[objectKind]);
}

export function provenanceKindsAwaitingProducer(): readonly ProvenanceObjectKind[] {
  return PROVENANCE_OBJECT_KINDS.filter(
    (objectKind) => KIND_POLICIES[objectKind].producedBy.length === 0,
  );
}

export interface ProvenanceInput {
  readonly creatorAccountId: string;
  readonly agentId?: string | null;
  readonly parentObject?: ProvenanceParentObject | null;
  readonly sourceConversationId?: string | null;
  readonly sourceTurnId?: string | null;
  readonly sourceFileIds?: readonly string[];
  readonly sourceConnectorItemIds?: readonly string[];
  readonly model?: string | null;
  readonly providerRoute?: string | null;
  readonly promptVersion?: string | null;
  readonly toolInvocations?: readonly ProvenanceToolInvocation[];
  readonly createdAt?: string;
  readonly schemaVersion?: string;
  readonly trustMode: string;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * The one way an important output records where it came from. A kind that
 * declares a field required cannot be stamped without it.
 */
export function provenanceRecord(
  objectKind: ProvenanceObjectKind,
  input: ProvenanceInput,
): ProvenanceRecord {
  const record: ProvenanceRecord = {
    objectKind,
    creatorAccountId: (input.creatorAccountId ?? '').trim(),
    agentId: input.agentId?.trim() || null,
    parentObject: input.parentObject ?? null,
    sourceConversationId: input.sourceConversationId?.trim() || null,
    sourceTurnId: input.sourceTurnId?.trim() || null,
    sourceFileIds: input.sourceFileIds ?? [],
    sourceConnectorItemIds: input.sourceConnectorItemIds ?? [],
    model: input.model?.trim() || null,
    providerRoute: input.providerRoute?.trim() || null,
    promptVersion: input.promptVersion?.trim() || null,
    toolInvocations: input.toolInvocations ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
    schemaVersion: input.schemaVersion ?? PROVENANCE_SCHEMA_VERSION,
    trustMode: (input.trustMode ?? '').trim(),
  };

  const missing = KIND_POLICIES[objectKind].required.filter(
    (field) => !isPresent(record[field as keyof ProvenanceRecord]),
  );
  if (missing.length > 0) {
    throw new Error(`Provenance for ${objectKind} is missing ${missing.join(', ')}`);
  }
  return record;
}

export function isProvenanceObjectKind(value: unknown): value is ProvenanceObjectKind {
  return (
    typeof value === 'string' && (PROVENANCE_OBJECT_KINDS as readonly string[]).includes(value)
  );
}
