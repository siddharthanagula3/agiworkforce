import { managedCloudPreferencesNamespacePath } from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export const CAPABILITIES_NAMESPACE = 'capabilities';

export type ArtifactVisualSwitch = 'artifacts' | 'inlineVisualizations';

export const ARTIFACT_VISUAL_SWITCHES: readonly ArtifactVisualSwitch[] = [
  'artifacts',
  'inlineVisualizations',
];

export type ArtifactVisualValues = Record<ArtifactVisualSwitch, boolean>;

export interface ArtifactVisualRead {
  values: ArtifactVisualValues;
  available: ArtifactVisualSwitch[];
}

interface CapabilitiesNamespaceResponse {
  settings?: unknown;
  availableSwitches?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function fetchArtifactVisualPreferences(
  accountEpoch: CloudAccountEpoch,
): Promise<ArtifactVisualRead> {
  const data = await api.get<CapabilitiesNamespaceResponse>(
    managedCloudPreferencesNamespacePath(CAPABILITIES_NAMESPACE),
    { accountEpoch },
  );
  const stored = data?.settings;
  const settings: Record<string, unknown> = isRecord(stored) ? stored : {};
  const switches = data?.availableSwitches;
  const reported: unknown[] = Array.isArray(switches) ? switches : [];
  return {
    values: {
      artifacts: settings.artifacts !== false,
      inlineVisualizations: settings.inlineVisualizations !== false,
    },
    available: ARTIFACT_VISUAL_SWITCHES.filter((key) => reported.includes(key)),
  };
}
