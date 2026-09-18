import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { MAX_CONNECTOR_TOOLS_PER_USER } from '@/lib/user-connector-tools';

export const TOOL_DIRECTORY_TOOL_NAME = 'load_connector_tools';

export const DEFAULT_TOOL_SCHEMA_BYTES = 24_000;

const MIN_RELEVANT_SCORE = 1;
const NAME_MATCH_WEIGHT = 3;
const SERVER_MATCH_WEIGHT = 2;
const DESCRIPTION_MATCH_WEIGHT = 1;
const WORD = /[a-z0-9]+/g;
const MIN_WORD_LENGTH = 3;
const DEFERRED_SUMMARY_CHARS = 80;

export interface ToolSchemaBudget {
  maxTools: number;
  maxSchemaBytes: number;
}

export const DEFAULT_TOOL_SCHEMA_BUDGET: ToolSchemaBudget = {
  maxTools: MAX_CONNECTOR_TOOLS_PER_USER,
  maxSchemaBytes: DEFAULT_TOOL_SCHEMA_BYTES,
};

export interface SelectToolSchemasInput {
  tools: readonly WebMcpToolDef[];
  turnText: string;
  pinnedQualifiedNames?: readonly string[];
  budget?: Partial<ToolSchemaBudget>;
}

export interface DeferredTool {
  qualifiedName: string;
  serverId: string;
  summary: string;
}

export interface SelectedToolSchemas {
  tools: WebMcpToolDef[];
  deferred: DeferredTool[];
  bytes: number;
}

export function toolSchemaBytes(tool: WebMcpToolDef): number {
  return new TextEncoder().encode(
    JSON.stringify({
      name: tool.qualifiedName,
      description: tool.description,
      parameters: tool.inputSchema,
    }),
  ).byteLength;
}

function words(value: string): Set<string> {
  const out = new Set<string>();
  for (const match of value.toLowerCase().matchAll(WORD)) {
    if (match[0].length >= MIN_WORD_LENGTH) out.add(match[0]);
  }
  return out;
}

function overlap(candidate: Set<string>, turn: ReadonlySet<string>): number {
  let hits = 0;
  for (const word of candidate) if (turn.has(word)) hits += 1;
  return hits;
}

function relevanceScore(tool: WebMcpToolDef, turn: ReadonlySet<string>): number {
  return (
    overlap(words(tool.toolName), turn) * NAME_MATCH_WEIGHT +
    overlap(words(`${tool.serverId} ${tool.serverLabel ?? ''}`), turn) * SERVER_MATCH_WEIGHT +
    overlap(words(tool.description), turn) * DESCRIPTION_MATCH_WEIGHT
  );
}

function deferredEntry(tool: WebMcpToolDef): DeferredTool {
  const summary = tool.description.replace(/\s+/gu, ' ').trim();
  return {
    qualifiedName: tool.qualifiedName,
    serverId: tool.serverId,
    summary:
      summary.length > DEFERRED_SUMMARY_CHARS
        ? `${summary.slice(0, DEFERRED_SUMMARY_CHARS)}...`
        : summary,
  };
}

/**
 * Ranks the connected tools against the turn and admits schemas until the
 * budget is spent, so the prompt payload stays bounded as the connected count
 * grows. Anything left over is named, never hidden: the model reaches it
 * through TOOL_DIRECTORY_TOOL_NAME.
 */
export function selectToolSchemas(input: SelectToolSchemasInput): SelectedToolSchemas {
  const budget: ToolSchemaBudget = { ...DEFAULT_TOOL_SCHEMA_BUDGET, ...input.budget };
  const pinned = new Set(input.pinnedQualifiedNames ?? []);
  const turn = words(input.turnText);

  const ranked = input.tools
    .map((tool, index) => ({
      tool,
      index,
      pinned: pinned.has(tool.qualifiedName),
      score: relevanceScore(tool, turn),
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index;
    });

  const anyRelevant = ranked.some((entry) => entry.score >= MIN_RELEVANT_SCORE);
  const tools: WebMcpToolDef[] = [];
  const deferred: DeferredTool[] = [];
  let bytes = 0;

  for (const entry of ranked) {
    const size = toolSchemaBytes(entry.tool);
    const admissible =
      entry.pinned ||
      (tools.length < budget.maxTools &&
        bytes + size <= budget.maxSchemaBytes &&
        (!anyRelevant || entry.score >= MIN_RELEVANT_SCORE));
    if (!admissible) {
      deferred.push(deferredEntry(entry.tool));
      continue;
    }
    tools.push(entry.tool);
    bytes += size;
  }

  return {
    tools: tools.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName)),
    deferred,
    bytes,
  };
}

/**
 * The retrieval step: the model names the tools it wants and gets their real
 * schemas, so a tool ranking missed is one turn away rather than unreachable.
 */
export function expandDeferredToolSchemas(
  tools: readonly WebMcpToolDef[],
  requestedQualifiedNames: readonly string[],
): WebMcpToolDef[] {
  const requested = new Set(requestedQualifiedNames);
  return tools.filter((tool) => requested.has(tool.qualifiedName));
}

export function toolDirectoryToolDef(deferred: readonly DeferredTool[]): WebMcpToolDef | null {
  if (deferred.length === 0) return null;
  const listing = deferred.map((entry) => `- ${entry.qualifiedName}: ${entry.summary}`).join('\n');
  return {
    qualifiedName: TOOL_DIRECTORY_TOOL_NAME,
    serverId: 'agiworkforce',
    toolName: TOOL_DIRECTORY_TOOL_NAME,
    origin: 'operator',
    description: `Load the full input schema for connected tools that were not included in this turn. Call this before using any of them.\n\n${listing}`,
    inputSchema: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string', enum: deferred.map((entry) => entry.qualifiedName) },
          description: 'The qualified names of the tools whose schemas to load.',
        },
      },
      required: ['names'],
      additionalProperties: false,
    },
  };
}
