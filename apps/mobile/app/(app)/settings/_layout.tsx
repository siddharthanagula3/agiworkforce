import { useEffect } from 'react';
import { Stack, useNavigation } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';
import { useTheme } from '@/src/ui/theme';

const SETTINGS_ROUTE = 'settings';

export const unstable_settings = { anchor: 'index' };

export default function SettingsLayout() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();

  // A settings page opened from a chat must go Back to that chat, so each visit
  // starts with an empty stack instead of the pages the last visit left behind.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        navigation.dispatch((state) =>
          CommonActions.reset({
            ...state,
            routes: state.routes.map((route) =>
              route.name === SETTINGS_ROUTE ? { key: route.key, name: route.name } : route,
            ),
          }),
        );
      }),
    [navigation],
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: isDark ? colors.background : colors.surfaceBase },
      }}
    />
  );
}
