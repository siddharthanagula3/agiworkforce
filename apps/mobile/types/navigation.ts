export interface ChatRouteParams {
  id: string;
}

export interface CompanionRouteParams {
  pairingCode?: string;
}

export interface ScheduleCreateRouteParams {
  id?: string;
  template?: string;
}

export type TabRouteName = 'index' | 'chat' | 'projects' | 'settings';

export interface AppRouteParams {
  '/(auth)/login': undefined;
  '/(app)': undefined;
  '/(app)/(tabs)': undefined;
  '/(app)/(tabs)/index': undefined;
  '/(app)/(tabs)/chat': undefined;
  '/(app)/(tabs)/settings': undefined;
  '/(app)/chat/[id]': ChatRouteParams;
  '/(app)/agents': undefined;
  '/(app)/companion': CompanionRouteParams | undefined;
  '/(app)/profile': undefined;
  '/(app)/schedules': undefined;
  '/(app)/schedules/create': ScheduleCreateRouteParams | undefined;
  '/(app)/settings/app-language': undefined;
  '/(app)/settings/memory': undefined;
  '/(app)/messaging': undefined;
  '/onboarding': undefined;
}
