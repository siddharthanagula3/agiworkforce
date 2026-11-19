import {
  capabilitySwitchAvailable,
  managedCloudPreferencesNamespacePath,
  parseToolAccessMode,
  TOOL_ACCESS_MODES,
  TOOL_ACCESS_SETTING_KEY,
  type ToolAccessMode,
} from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { CAPABILITIES_NAMESPACE } from './artifactVisualPreferencesService';

export {
  DEFAULT_TOOL_ACCESS_MODE,
  parseToolAccessMode,
  TOOL_ACCESS_SETTING_KEY as TOOL_ACCESS_KEY,
  type ToolAccessMode,
} from '@agiworkforce/cloud-contracts';

const TOOL_ACCESS_COPY: Record<ToolAccessMode, { label: string; description: string }> = {
  auto: { label: 'Auto', description: 'AGI chooses for you' },
  on_demand: {
    label: 'On demand',
    description: 'Load tools when needed. More steps, lower accuracy',
  },
  always: {
    label: 'Always available',
    description: 'Ready from the start. Fewer messages, better accuracy',
  },
};

export const TOOL_ACCESS_OPTIONS: ReadonlyArray<{
  mode: ToolAccessMode;
  label: string;
  description: string;
}> = TOOL_ACCESS_MODES.map((mode) => ({ mode, ...TOOL_ACCESS_COPY[mode] }));

export interface ToolAccessRead {
  mode: ToolAccessMode;
  available: boolean;
}

interface CapabilitiesNamespaceResponse {
  settings?: unknown;
  availableSwitches?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function fetchToolAccessPreference(
  accountEpoch: CloudAccountEpoch,
): Promise<ToolAccessRead> {
  const data = await api.get<CapabilitiesNamespaceResponse>(
    managedCloudPreferencesNamespacePath(CAPABILITIES_NAMESPACE),
    { accountEpoch },
  );
  const stored = data?.settings;
  const settings: Record<string, unknown> = isRecord(stored) ? stored : {};
  return {
    mode: parseToolAccessMode(settings[TOOL_ACCESS_SETTING_KEY]),
    available: capabilitySwitchAvailable(data?.availableSwitches, TOOL_ACCESS_SETTING_KEY),
  };
}
