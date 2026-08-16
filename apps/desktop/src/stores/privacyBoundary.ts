import { selectPrivacyMode, useAppModeStore } from './appModeStore';

export function isPrivateTrustBoundary(): boolean {
  try {
    return selectPrivacyMode(useAppModeStore.getState()) !== 'managed';
  } catch {
    return true;
  }
}
