export type RuntimeTier = 'cloud' | 'desktop-only' | 'desktop-preferred';

export interface CommandCapability {
  tier: RuntimeTier;
  featureGroup: string;
  commandName: string;
}
