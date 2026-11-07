import { CHAT_SYSTEM_PROMPT_VERSIONS } from '@/lib/prompts/chat-system-prompt';

export const MANAGED_TOOL_INVENTORY_MESSAGE_NAME = 'managed_tool_inventory';

export interface ManagedToolInventoryFields {
  name?: typeof MANAGED_TOOL_INVENTORY_MESSAGE_NAME;
  __managedToolInventoryVersion?: number;
}

export function isManagedToolInventoryVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    CHAT_SYSTEM_PROMPT_VERSIONS.some(({ version }) => version === value)
  );
}
