import { Redirect } from 'expo-router';

export default function HomeTabRedirect() {
  return <Redirect href={{ pathname: '/(app)/(tabs)/chat' as const }} />;
}
