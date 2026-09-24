import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { ToolShortlistShadowInput } from '@/lib/services/semantic-decisions/consumers/tool-shortlist';
import type { SemanticDecisionScope } from '@/lib/services/semantic-decisions/shadow';

import {
  DEFAULT_TOOL_SCHEMA_BUDGET,
  selectToolSchemas,
  toolSchemaBytes,
} from './tool-schema-loader';

/**
 * Ranking the catalog a second time and JSON-encoding every connector tool to
 * count its bytes is the whole cost of this kind on a turn that will never ask.
 * None of it happens here: the response path hands over the tool list and a way
 * to read the turn, and the body below runs only once the gate opens.
 */
export function toolShortlistShadowInput(input: {
  scope: SemanticDecisionScope;
  tools: readonly WebMcpToolDef[];
  turnText: () => string;
}): ToolShortlistShadowInput {
  return {
    scope: input.scope,
    derive: () => {
      const turnText = input.turnText();
      return {
        latestUserMessage: turnText,
        previousUserMessage: null,
        candidates: input.tools.map((tool) => ({
          qualifiedName: tool.qualifiedName,
          serverId: tool.serverId,
          toolName: tool.toolName,
          description: tool.description,
          bytes: toolSchemaBytes(tool),
        })),
        baselineQualifiedNames: selectToolSchemas({ tools: input.tools, turnText }).tools.map(
          (tool) => tool.qualifiedName,
        ),
        budget: DEFAULT_TOOL_SCHEMA_BUDGET,
      };
    },
  };
}
