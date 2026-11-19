import Constants from 'expo-constants';
import { Dimensions, Platform } from 'react-native';

import type { MobileChatAppMode } from '@/src/features/chat/store/appModeStore';
import { getTabletLayout } from '@/src/shared/hooks/useTabletLayout';

export interface FeedbackClientContext {
  appVersion: string | null;
  appBuild: string | null;
  platform: string;
  osVersion: string;
  deviceClass: 'phone' | 'tablet';
  appMode: MobileChatAppMode;
}

export function readAppBuild(): string | null {
  const embedded =
    Platform.OS === 'ios'
      ? Constants.platform?.ios?.buildNumber
      : Platform.OS === 'android'
        ? Constants.platform?.android?.versionCode
        : undefined;
  return embedded === undefined || embedded === null ? null : String(embedded);
}

function readDeviceClass(): FeedbackClientContext['deviceClass'] {
  const { isTablet } = getTabletLayout(Dimensions.get('window'), Dimensions.get('screen'));
  return Platform.OS === 'ios' && Platform.isPad ? 'tablet' : isTablet ? 'tablet' : 'phone';
}

export function feedbackClientContext(appMode: MobileChatAppMode): FeedbackClientContext {
  return {
    appVersion: Constants.expoConfig?.version ?? null,
    appBuild: readAppBuild(),
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    deviceClass: readDeviceClass(),
    appMode,
  };
}
