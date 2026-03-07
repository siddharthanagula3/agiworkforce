import { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Text } from './text';

/**
 * Shows a red "Offline" badge when the device has no network connectivity.
 * Uses the browser-standard navigator.onLine API (available in React Native's
 * JS environment) with AppState to re-check when the app comes to foreground.
 * Returns null when online, so it renders nothing in the normal case.
 */
export function NetworkBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const check = () => setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    check();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => subscription.remove();
  }, []);

  if (isOnline) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(239,68,68,0.15)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
      }}
    >
      <WifiOff size={12} color="#ef4444" />
      <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '500' }}>Offline</Text>
    </View>
  );
}
