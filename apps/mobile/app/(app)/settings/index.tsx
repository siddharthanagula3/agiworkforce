import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Redirect from stack-pushed /settings to the settings tab.
 * The full settings implementation lives in (tabs)/settings.tsx.
 */
export default function SettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return null;
}
