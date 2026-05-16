import { Redirect } from 'expo-router';

/**
 * Home tab -- redirects to Chat.
 *
 * The Home/Dashboard screen has been merged into Chat as the default
 * landing screen. This redirect ensures any existing navigation to
 * the Home tab still works correctly.
 */
export default function HomeTabRedirect() {
  return <Redirect href={{ pathname: '/(app)/(tabs)/chat' as const }} />;
}
