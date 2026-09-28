import type { CustomCommand } from '@shared/stores/web-settings-store';

export const CUSTOM_COMMANDS_NAMESPACE = 'custom_commands';

export interface CustomCommandsNamespace {
  commands?: unknown;
}

function isCustomCommand(value: unknown): value is CustomCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return (
    typeof command['id'] === 'string' &&
    typeof command['name'] === 'string' &&
    command['name'].length > 0 &&
    typeof command['description'] === 'string' &&
    typeof command['template'] === 'string'
  );
}

export function readAccountCustomCommands(stored: CustomCommandsNamespace): CustomCommand[] | null {
  if (!Array.isArray(stored.commands)) return null;
  return stored.commands.filter(isCustomCommand);
}

export function mergeCustomCommands(
  account: readonly CustomCommand[],
  local: readonly CustomCommand[],
): CustomCommand[] {
  const names = new Set(account.map((command) => command.name));
  return [...account, ...local.filter((command) => !names.has(command.name))];
}

export function sameCustomCommands(
  left: readonly CustomCommand[] | null,
  right: readonly CustomCommand[],
): boolean {
  if (!left) return right.length === 0;
  if (left.length !== right.length) return false;
  return left.every((command, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      command.id === other.id &&
      command.name === other.name &&
      command.description === other.description &&
      command.template === other.template
    );
  });
}

export function hydratedCustomCommands(params: {
  account: readonly CustomCommand[] | null;
  local: readonly CustomCommand[];
  localOwner: string | null;
  userId: string;
}): CustomCommand[] {
  const { account, local, localOwner, userId } = params;
  const localBelongsHere = localOwner === null || localOwner === userId;
  if (account === null) return localBelongsHere ? [...local] : [];
  return localOwner === null ? mergeCustomCommands(account, local) : [...account];
}
