export const MCP_APP_RESOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const MCP_APP_TOO_LARGE_MESSAGE = "This app's content is too large to display.";
export const MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE =
  "This app can't be displayed here, so the tool's result is shown instead.";

export interface McpAppToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content: unknown[];
}

export function mcpAppPlainResultText(result: McpAppToolResult): string {
  const text = result.content
    .map((block) =>
      block !== null &&
      typeof block === 'object' &&
      (block as Record<string, unknown>)['type'] === 'text' &&
      typeof (block as Record<string, unknown>)['text'] === 'string'
        ? ((block as Record<string, unknown>)['text'] as string)
        : null,
    )
    .filter((value): value is string => value !== null)
    .join('\n\n');
  if (text) return text;
  return result.structuredContent === undefined
    ? ''
    : JSON.stringify(result.structuredContent, null, 2);
}
