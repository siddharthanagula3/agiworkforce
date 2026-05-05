import { Redirect } from 'expo-router';

export default function SettingsIndex() {
  return <Redirect href={'/(app)/(tabs)/settings' as Parameters<typeof Redirect>[0]['href']} />;
}
