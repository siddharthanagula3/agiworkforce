export const CONNECTOR_TOOL_CATEGORIES = ['read_only', 'write'] as const;

export type ConnectorToolCategory = (typeof CONNECTOR_TOOL_CATEGORIES)[number];

const CATEGORY_TOOL_NAME_PREFIX = '*';

export function connectorCategoryToolName(category: ConnectorToolCategory): string {
  return `${CATEGORY_TOOL_NAME_PREFIX}${category}`;
}

export function isConnectorCategoryToolName(toolName: string): boolean {
  return toolName.startsWith(CATEGORY_TOOL_NAME_PREFIX);
}
