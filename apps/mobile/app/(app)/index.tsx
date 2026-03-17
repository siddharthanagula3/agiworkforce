import { Redirect } from 'expo-router';

/**
 * Root index for (app) group -- redirects to the tab navigator.
 * This ensures navigating to /(app) always lands on the Home tab.
 *
 * The cast is necessary because Expo Router typed routes does not
 * automatically expose route group paths like /(app)/(tabs).
 */
export default function AppIndex() {
  return <Redirect href={'/(app)/(tabs)' as '/(app)'} />;
}
