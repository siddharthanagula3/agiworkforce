import type { PlatformCapability } from '../capabilities';

export type { PlatformCapability };

export type CapabilityLayer = 'model' | 'tier' | 'surface' | 'settings';

export const CAPABILITY_LAYERS = [
  'model',
  'tier',
  'surface',
  'settings',
] as const satisfies readonly CapabilityLayer[];

export function isCapabilityLayer(value: string): value is CapabilityLayer {
  return (CAPABILITY_LAYERS as readonly string[]).includes(value);
}

export interface CapabilityLayerGrant {
  layer: CapabilityLayer;
  sourceId: string;
  granted: ReadonlySet<PlatformCapability>;
}

export interface CapabilityDocumentRef {
  sessionId: string;
  version: string;
  computedAt: string;
}

export const CAPABILITY_LIMIT_WINDOWS = [
  'day',
  'month',
  'billing_period',
  'rolling_five_hour',
  'rolling_weekly',
] as const;

export type CapabilityLimitWindow = (typeof CAPABILITY_LIMIT_WINDOWS)[number];

export const CAPABILITY_LIMIT_UNITS = [
  'tokens',
  'messages',
  'images',
  'video_seconds',
  'voice_minutes',
  'usage_cents',
] as const;

export type CapabilityLimitUnit = (typeof CAPABILITY_LIMIT_UNITS)[number];

export interface CapabilityLimit {
  id: string;
  capabilityId: PlatformCapability | null;
  limit: number | null;
  unit: CapabilityLimitUnit;
  window: CapabilityLimitWindow;
  resetsAt: string | null;
  policySource: string;
}

export interface EffectiveCapabilityDocument extends CapabilityDocumentRef {
  sources: Readonly<Record<CapabilityLayer, string>>;
  granted: readonly PlatformCapability[];
  deniedBy: Readonly<Partial<Record<PlatformCapability, readonly CapabilityLayer[]>>>;
  limits: readonly CapabilityLimit[];
}
