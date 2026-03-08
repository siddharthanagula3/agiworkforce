import { useEffect, useState } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { Text } from './text';

/**
 * Shows a red "Offline" badge when the device has no network connectivity.
 * Uses @react-native-community/netinfo for reliable network state detection
 * in React Native (navigator.onLine is not reliable on native platforms).
 * Returns null when online, so it renders nothing in the normal case.
 */
export function NetworkBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initial fetch of network state
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    return unsubscribe;
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
