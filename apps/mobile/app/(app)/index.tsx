import { Redirect } from 'expo-router';

/**
 * Root index for (app) group -- redirects to the Chat tab.
 * Chat is the default landing screen when the drawer opens.
 */
export default function AppIndex() {
  return <Redirect href={{ pathname: '/(app)/(tabs)/chat' as const }} />;
}
