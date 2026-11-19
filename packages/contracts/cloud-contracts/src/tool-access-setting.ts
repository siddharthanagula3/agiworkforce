import { z } from 'zod';

export const TOOL_ACCESS_SETTING_KEY = 'toolAccess';

export const TOOL_ACCESS_MODES = ['auto', 'on_demand', 'always'] as const;

export type ToolAccessMode = (typeof TOOL_ACCESS_MODES)[number];

export const DEFAULT_TOOL_ACCESS_MODE: ToolAccessMode = 'auto';

export function isToolAccessMode(value: unknown): value is ToolAccessMode {
  return typeof value === 'string' && (TOOL_ACCESS_MODES as readonly string[]).includes(value);
}

export function parseToolAccessMode(value: unknown): ToolAccessMode {
  return isToolAccessMode(value) ? value : DEFAULT_TOOL_ACCESS_MODE;
}

// Plain strings, not an enum of known keys: a server that announces a switch an
// older client does not know must not make that client drop the ones it does.
export const CapabilityAvailableSwitchesSchema = z.array(z.string());

export type CapabilityAvailableSwitches = z.infer<typeof CapabilityAvailableSwitchesSchema>;

export function capabilitySwitchAvailable(availableSwitches: unknown, key: string): boolean {
  const parsed = CapabilityAvailableSwitchesSchema.safeParse(availableSwitches);
  return parsed.success && parsed.data.includes(key);
}
