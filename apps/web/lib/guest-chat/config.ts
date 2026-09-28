import { z } from 'zod';

export const GUEST_CHAT_FLAG_KEY = 'guest.chat';

export const GUEST_CHAT_ENV_VARS = {
  deviceMessagesPerDay: 'GUEST_CHAT_DEVICE_MESSAGES_PER_DAY',
  ipMessagesPerDay: 'GUEST_CHAT_IP_MESSAGES_PER_DAY',
  globalSpendMicrousdPerDay: 'GUEST_CHAT_GLOBAL_SPEND_MICROUSD_PER_DAY',
  maxMessages: 'GUEST_CHAT_MAX_MESSAGES',
  maxMessageChars: 'GUEST_CHAT_MAX_MESSAGE_CHARS',
  maxOutputTokens: 'GUEST_CHAT_MAX_OUTPUT_TOKENS',
  turnTimeoutMs: 'GUEST_CHAT_TURN_TIMEOUT_MS',
} as const;

export const GuestChatConfigSchema = z
  .object({
    deviceMessagesPerDay: z.coerce.number().int().min(1).max(1_000).default(20),
    ipMessagesPerDay: z.coerce.number().int().min(1).max(100_000).default(100),
    globalSpendMicrousdPerDay: z.coerce.number().int().min(0).default(20_000_000),
    maxMessages: z.coerce.number().int().min(1).max(200).default(40),
    maxMessageChars: z.coerce.number().int().min(1).max(100_000).default(8_000),
    maxOutputTokens: z.coerce.number().int().min(64).max(32_000).default(2_048),
    turnTimeoutMs: z.coerce.number().int().min(5_000).max(600_000).default(120_000),
  })
  .strict();

export type GuestChatConfig = z.infer<typeof GuestChatConfigSchema>;

export function readGuestChatConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GuestChatConfig {
  const candidate = Object.fromEntries(
    Object.entries(GUEST_CHAT_ENV_VARS)
      .map(([field, name]) => [field, env[name]])
      .filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = GuestChatConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : GuestChatConfigSchema.parse({});
}

export const GUEST_CHAT_CONFIG: GuestChatConfig = readGuestChatConfig();
