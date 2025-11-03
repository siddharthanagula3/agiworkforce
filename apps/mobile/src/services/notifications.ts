import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export interface NotificationRegistrationResult {
  granted: boolean;
  token?: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<NotificationRegistrationResult> {
  if (!Device.isDevice) {
    return { granted: false };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { granted: false };
  }
  const token = await Notifications.getExpoPushTokenAsync();
  return { granted: true, token: token.data };
}

export function scheduleLocalNotification(title: string, body: string) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger: null,
  });
}
