export const BOT_PROTECTION_ENV_VAR = 'AGI_BOT_PROTECTION';
export const BOT_PROTECTION_PUBLIC_ENV_VAR = 'NEXT_PUBLIC_AGI_BOT_PROTECTION';

export const BOT_PROTECTION_MODES = {
  platform: 'platform',
  off: 'off',
} as const;

export type BotProtectionMode = (typeof BOT_PROTECTION_MODES)[keyof typeof BOT_PROTECTION_MODES];

const MODE_VALUES: readonly string[] = Object.values(BOT_PROTECTION_MODES);

export function parseBotProtectionMode(raw: string | undefined): BotProtectionMode | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value || !MODE_VALUES.includes(value)) return undefined;
  return value as BotProtectionMode;
}

export function resolveBotProtectionMode(
  env: Record<string, string | undefined>,
  platformHosted: boolean,
): BotProtectionMode {
  const configured =
    parseBotProtectionMode(env[BOT_PROTECTION_ENV_VAR]) ??
    parseBotProtectionMode(env[BOT_PROTECTION_PUBLIC_ENV_VAR]);
  if (configured) return configured;
  return platformHosted ? BOT_PROTECTION_MODES.platform : BOT_PROTECTION_MODES.off;
}

export function clientBotProtectionMode(): BotProtectionMode {
  return (
    parseBotProtectionMode(process.env['NEXT_PUBLIC_AGI_BOT_PROTECTION']) ??
    BOT_PROTECTION_MODES.platform
  );
}
