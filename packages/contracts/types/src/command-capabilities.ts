
export type RuntimeTier =
  | 'cloud'
  | 'desktop-only'
  | 'desktop-preferred';

export interface CommandCapability {
  tier: RuntimeTier;
  featureGroup: string;
  commandName: string;
}

export interface RuntimeFeatureContext {
  available: string[];
  unavailable: string[];
  runtime: 'tauri' | 'cloud-web' | 'test';
}
