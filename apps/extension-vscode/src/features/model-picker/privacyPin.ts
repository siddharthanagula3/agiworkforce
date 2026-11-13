import type { ModelTrustMode } from './reachability';

export interface PrivacyPin {
  trustMode: ModelTrustMode;
  configPath?: string;
}

/**
 * The CLI starts a session only when its model runs on the pinned boundary,
 * so the picker refuses exactly what the CLI would refuse.
 */
export function privacyPinRefuses(pin: PrivacyPin | undefined, trustMode: ModelTrustMode): boolean {
  return pin !== undefined && pin.trustMode !== 'unknown' && trustMode !== pin.trustMode;
}

export function privacyPinReason(pin: PrivacyPin): string {
  const place = pin.configPath ?? "your organization's managed policy";
  return `Off while privacy_mode = "${pin.trustMode}" is set in ${place}`;
}
