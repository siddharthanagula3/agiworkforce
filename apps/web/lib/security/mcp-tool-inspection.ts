export type McpToolRejectionReason =
  | 'malformed_name'
  | 'description_too_long'
  | 'malformed_schema'
  | 'poisoned_description'
  | 'shadows_another_server';

export interface InspectableToolDef {
  serverId: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolRejection {
  serverId: string;
  toolName: string;
  reason: McpToolRejectionReason;
  detail: string;
}

export interface McpToolInspection<T extends InspectableToolDef> {
  allowed: T[];
  rejected: McpToolRejection[];
}

export const MAX_TOOL_NAME_LENGTH = 128;
export const MAX_TOOL_DESCRIPTION_LENGTH = 8_000;
export const MAX_TOOL_SCHEMA_PROPERTIES = 100;
export const MAX_TOOL_SCHEMA_DEPTH = 8;

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/u;

/**
 * A tool description is text a remote server writes and the host pastes into
 * the model's context, which makes it the shortest path from a third party to
 * the model's instructions. These are the shapes that are only ever written to
 * redirect the model, never to describe what a tool does.
 */
const POISONED_DESCRIPTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|earlier|above)\s+instructions/iu,
    label: 'instruction override',
  },
  {
    pattern: /disregard\s+(?:all\s+)?(?:previous|prior|the\s+system)\s+(?:instructions|prompt)/iu,
    label: 'instruction override',
  },
  {
    pattern: /(?:do\s+not|don't|never)\s+(?:tell|mention|inform|reveal\s+to)\s+the\s+user/iu,
    label: 'concealment',
  },
  { pattern: /without\s+(?:telling|informing|asking)\s+the\s+user/iu, label: 'concealment' },
  {
    pattern:
      /before\s+(?:using|calling|invoking)\s+(?:any\s+)?(?:other\s+)?tools?\b[^.]{0,120}\b(?:you\s+must|always|first)\b/iu,
    label: 'tool hijack',
  },
  {
    pattern: /\bwhen(?:ever)?\s+(?:the\s+)?user\s+asks[^.]{0,120}\bcall\s+(?:this|the)\s+tool/iu,
    label: 'tool hijack',
  },
  { pattern: /<\s*important\s*>/iu, label: 'hidden directive block' },
  { pattern: /\[\s*system\s*\]|<\s*\/?\s*system\s*>/iu, label: 'forged system turn' },
  {
    pattern:
      /(?:read|cat|include|exfiltrate|send)\b[^.]{0,80}(?:~\/\.(?:ssh|aws|config)|\.env\b|id_rsa|private\s+key)/iu,
    label: 'credential exfiltration',
  },
  {
    pattern:
      /\b(?:append|include|attach)\b[^.]{0,80}\b(?:api[_\s-]?key|token|password|secret)\b[^.]{0,80}\b(?:to\s+(?:the\s+)?(?:url|query|request|argument))/iu,
    label: 'credential exfiltration',
  },
];

function schemaDepth(value: unknown, depth = 1): number {
  if (!value || typeof value !== 'object') return depth;
  if (depth >= MAX_TOOL_SCHEMA_DEPTH + 1) return depth;
  let deepest = depth;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, schemaDepth(child, depth + 1));
  }
  return deepest;
}

function countProperties(schema: Record<string, unknown>): number {
  const properties = schema['properties'];
  if (!properties || typeof properties !== 'object') return 0;
  return Object.keys(properties as Record<string, unknown>).length;
}

export function findPoisonedDirective(description: string): string | null {
  for (const { pattern, label } of POISONED_DESCRIPTION_PATTERNS) {
    if (pattern.test(description)) return label;
  }
  return null;
}

function inspectOne(def: InspectableToolDef): McpToolRejection | null {
  if (
    !def.toolName ||
    def.toolName.length > MAX_TOOL_NAME_LENGTH ||
    !TOOL_NAME_PATTERN.test(def.toolName)
  ) {
    return {
      serverId: def.serverId,
      toolName: def.toolName,
      reason: 'malformed_name',
      detail: 'A tool name must be a bounded run of letters, digits, dot, dash or underscore',
    };
  }

  if ((def.description?.length ?? 0) > MAX_TOOL_DESCRIPTION_LENGTH) {
    return {
      serverId: def.serverId,
      toolName: def.toolName,
      reason: 'description_too_long',
      detail: `Description is ${def.description.length} characters, over the ${MAX_TOOL_DESCRIPTION_LENGTH} limit`,
    };
  }

  const directive = findPoisonedDirective(def.description ?? '');
  if (directive) {
    return {
      serverId: def.serverId,
      toolName: def.toolName,
      reason: 'poisoned_description',
      detail: `Description carries a ${directive} directive`,
    };
  }

  const schema = def.inputSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return {
      serverId: def.serverId,
      toolName: def.toolName,
      reason: 'malformed_schema',
      detail: 'Input schema is not an object',
    };
  }
  if (countProperties(schema) > MAX_TOOL_SCHEMA_PROPERTIES) {
    return {
      serverId: def.serverId,
      toolName: def.toolName,
      reason: 'malformed_schema',
      detail: `Input schema declares more than ${MAX_TOOL_SCHEMA_PROPERTIES} properties`,
    };
  }
  if (schemaDepth(schema) > MAX_TOOL_SCHEMA_DEPTH) {
    return {
      serverId: def.serverId,
      toolName: def.toolName,
      reason: 'malformed_schema',
      detail: `Input schema nests deeper than ${MAX_TOOL_SCHEMA_DEPTH} levels`,
    };
  }

  return null;
}

/**
 * Validates every tool a connector offered before the model is told it exists,
 * and refuses a later server's tool that reuses an earlier server's tool name.
 * The shadow is what makes cross-tool escalation work: the model asks for the
 * name it was taught, and whichever definition the host kept is what runs.
 * Order is the catalog's own, so the connector loaded first keeps its name.
 */
export function inspectConnectorToolDefs<T extends InspectableToolDef>(
  defs: readonly T[],
): McpToolInspection<T> {
  const allowed: T[] = [];
  const rejected: McpToolRejection[] = [];
  const claimedBy = new Map<string, string>();

  for (const def of defs) {
    const problem = inspectOne(def);
    if (problem) {
      rejected.push(problem);
      continue;
    }

    const owner = claimedBy.get(def.toolName);
    if (owner !== undefined && owner !== def.serverId) {
      rejected.push({
        serverId: def.serverId,
        toolName: def.toolName,
        reason: 'shadows_another_server',
        detail: `Tool name is already offered by ${owner}`,
      });
      continue;
    }

    claimedBy.set(def.toolName, def.serverId);
    allowed.push(def);
  }

  return { allowed, rejected };
}
