import type { MobileChatAppMode } from '@/src/features/chat/store/appModeStore';

export type DestinationScope = 'device' | 'cloud';

export const DESTINATION_SCOPE = {
  '/(app)/chats': 'device',
  '/(app)/(tabs)/projects': 'device',
  '/(app)/library': 'device',
  '/(app)/artifacts': 'device',
  '/(app)/models': 'device',
  '/(app)/notifications': 'device',
  '/(app)/about': 'device',
  '/(app)/settings': 'device',
  '/(app)/settings/general': 'device',
  '/(app)/settings/appearance': 'device',
  '/(app)/settings/personalization': 'device',
  '/(app)/settings/memory': 'device',
  '/(app)/settings/voice': 'device',
  '/(app)/settings/voice-language': 'device',
  '/(app)/settings/notifications': 'device',
  '/(app)/settings/data-controls': 'device',
  '/(app)/settings/capabilities': 'device',
  '/(app)/settings/code': 'device',
  '/(app)/settings/storage': 'device',
  '/(app)/settings/parental-controls': 'device',

  '/(app)/cloud-code': 'cloud',
  '/(app)/schedules': 'cloud',
  '/(app)/companion': 'cloud',
  '/(app)/tasks': 'cloud',
  '/(app)/sites': 'cloud',
  '/(app)/agents': 'cloud',
  '/(app)/reports': 'cloud',
  '/(app)/connectors': 'cloud',
  '/(app)/skills': 'cloud',
  '/(app)/customize': 'cloud',
  '/(app)/plugins': 'cloud',
  '/(app)/support': 'cloud',
  '/(app)/settings/remote-control': 'cloud',
  '/(app)/settings/archived-chats': 'cloud',
  '/(app)/settings/shared-links': 'cloud',
  '/(app)/settings/account-security': 'cloud',
  '/(app)/settings/workspace': 'cloud',
  '/(app)/settings/cloud-billing': 'cloud',
  '/(app)/settings/cloud-usage': 'cloud',
} as const satisfies Record<string, DestinationScope>;

export function isClassifiedDestination(route: string): boolean {
  return Object.prototype.hasOwnProperty.call(DESTINATION_SCOPE, route);
}

// A screen nobody classified is treated as Cloud, so a new destination cannot
// appear in Local mode before someone has decided it works without an account.
export function destinationScope(route: string): DestinationScope {
  return isClassifiedDestination(route)
    ? DESTINATION_SCOPE[route as keyof typeof DESTINATION_SCOPE]
    : 'cloud';
}

export function isShownInMode(route: string, appMode: MobileChatAppMode): boolean {
  return appMode === 'cloud' || destinationScope(route) === 'device';
}
