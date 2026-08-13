import { z } from 'zod';
import {
  SETTINGS_PANEL_SETTING_KEYS,
  type ConfigSettingUpdate,
  type ExtensionSettingsSnapshot,
  type MutableConfigKey,
  type MutableConfigValues,
} from '../../platform/config';
import type { CustomInstructionScope, InstructionContextSnapshot } from '../instructions';
import { MAX_CUSTOM_INSTRUCTION_CHARS } from '../instructions';
import type { AccountIdentity, TierInfo } from '../../utils/api';

export const SETTINGS_SECTIONS = [
  'general',
  'configuration',
  'personalization',
  'usage',
  'mcp',
  'hooks',
  'plugins',
  'account',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_COMMANDS = [
  'openRawSettings',
  'selectModel',
  'showAccountUsage',
  'signIn',
  'signOut',
  'manageUsage',
  'manageBilling',
  'viewPlans',
  'manageConnectors',
  'manageTeam',
  'openDocs',
  'openAgentConfig',
  'restartLocalRuntime',
  'openConfigDocs',
  'openInstructionDocs',
] as const;

export type SettingsCommand = (typeof SETTINGS_COMMANDS)[number];

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Expected an HTTP or HTTPS URL');

const settingValueSchemas = {
  apiEndpoint: httpUrlSchema,
  model: z.string().trim().min(1).max(200),
  cliPath: z.string().trim().min(1).max(4096),
  'composer.followUpBehavior': z.enum(['queue', 'steer']),
  contextLines: z.number().int().min(0).max(500),
  telemetryEnabled: z.boolean(),
  hoverEnabled: z.boolean(),
  codeLensEnabled: z.boolean(),
  autoApplyFixes: z.boolean(),
  'inlineCompletions.enabled': z.boolean(),
  'inlineCompletions.debounceMs': z.number().int().min(50).max(2000),
  'inlineCompletions.maxLength': z.number().int().min(50).max(5000),
  'agent.mode': z.enum(['ask', 'auto', 'plan', 'bypass']),
  'agent.effort': z.enum(['low', 'medium', 'high', 'max']),
  'agent.thinking': z.boolean(),
  'desktopBridge.enabled': z.boolean(),
  'desktopBridge.port': z.number().int().min(1024).max(65535),
  telemetryEndpoint: httpUrlSchema,
} satisfies {
  [K in MutableConfigKey]: z.ZodType<MutableConfigValues[K]>;
};

const messageEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('settings.ready') }).strict(),
  z
    .object({
      type: z.literal('settings.update'),
      key: z.string(),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal('settings.command'),
      command: z.enum(SETTINGS_COMMANDS),
    })
    .strict(),
  z
    .object({
      type: z.literal('settings.instructions.update'),
      scope: z.enum(['host', 'workspace']),
      value: z.string().max(MAX_CUSTOM_INSTRUCTION_CHARS),
    })
    .strict(),
]);

export type SettingsWebviewMessage =
  | { type: 'settings.ready' }
  | { type: 'settings.update'; update: ConfigSettingUpdate }
  | { type: 'settings.command'; command: SettingsCommand }
  | {
      type: 'settings.instructions.update';
      scope: CustomInstructionScope;
      value: string;
    };

export interface SettingsPanelState extends ExtensionSettingsSnapshot {
  accountConnected: boolean | null;
  accountStatus: 'loading' | 'signed-in' | 'signed-out' | 'expired';
  accountIdentity?: AccountIdentity;
  tierInfo?: TierInfo;
  agentConfigPath: string;
  instructionContext: InstructionContextSnapshot;
}

export type SettingsHostMessage =
  | { type: 'settings.snapshot'; state: SettingsPanelState }
  | { type: 'settings.saved'; key: MutableConfigKey }
  | { type: 'settings.instructions.saved'; scope: CustomInstructionScope }
  | { type: 'settings.error'; message: string }
  | { type: 'settings.navigate'; section: SettingsSection };

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && SETTINGS_SECTIONS.some((section) => section === value);
}

export function parseSettingsWebviewMessage(input: unknown): SettingsWebviewMessage | undefined {
  const parsed = messageEnvelopeSchema.safeParse(input);
  if (!parsed.success) return undefined;

  if (parsed.data.type === 'settings.ready') return parsed.data;
  if (parsed.data.type === 'settings.command') return parsed.data;
  if (parsed.data.type === 'settings.instructions.update') return parsed.data;

  const key = parsed.data.key;
  if (!SETTINGS_PANEL_SETTING_KEYS.some((candidate) => candidate === key)) return undefined;
  const typedKey = key as MutableConfigKey;
  const value = settingValueSchemas[typedKey].safeParse(parsed.data.value);
  if (!value.success) return undefined;

  return {
    type: 'settings.update',
    update: { key: typedKey, value: value.data } as ConfigSettingUpdate,
  };
}
