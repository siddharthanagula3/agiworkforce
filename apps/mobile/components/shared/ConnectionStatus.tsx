import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Wifi, WifiOff, Loader2, Monitor } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useConnectionStore, type ConnectionStatus } from '@/stores/connectionStore';
import { colors } from '@/lib/theme';

interface StatusConfig {
  icon: typeof Wifi;
  label: string;
  color: string;
  bgColor: string;
}

function getConfig(status: ConnectionStatus, desktopName: string | null): StatusConfig {
  switch (status) {
    case 'connected':
      return {
        icon: Monitor,
        label: desktopName ? `Connected to ${desktopName}` : 'Desktop connected',
        color: colors.agentSuccess,
        bgColor: 'rgba(16, 185, 129, 0.08)',
      };
    case 'connecting':
      return {
        icon: Loader2,
        label: 'Connecting...',
        color: colors.agentWarning,
        bgColor: 'rgba(245, 158, 11, 0.08)',
      };
    case 'error':
      return {
        icon: WifiOff,
        label: 'Connection error',
        color: colors.agentError,
        bgColor: 'rgba(239, 68, 68, 0.08)',
      };
    case 'disconnected':
    default:
      return {
        icon: WifiOff,
        label: 'Desktop not connected',
        color: colors.textMuted,
        bgColor: 'rgba(255, 255, 255, 0.03)',
      };
  }
}

/**
 * ConnectionStatusBar -- Shows current desktop connection state.
 * Tapping navigates to the companion/pairing screen.
 * Use this anywhere you need to show connection status.
 */
export function ConnectionStatusBar() {
  const router = useRouter();
  const status = useConnectionStore((s) => s.status);
  const desktopName = useConnectionStore((s) => s.desktopName);

  const config = getConfig(status, desktopName);
  const Icon = config.icon;

  return (
    <Pressable
      onPress={() => router.push('/(app)/companion' as Parameters<typeof router.push>[0])}
      className="flex-row items-center gap-2 py-2 px-3 rounded-lg active:opacity-80"
      style={{ backgroundColor: config.bgColor }}
      accessibilityLabel={`Desktop status: ${config.label}. Tap to manage connection.`}
      accessibilityRole="button"
    >
      <View className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
      <Icon size={14} color={config.color} />
      <Text className="text-[12px] flex-1" style={{ color: config.color }}>
        {config.label}
      </Text>
    </Pressable>
  );
}

/**
 * ConnectionDot -- Minimal dot indicator for connection status.
 * Suitable for headers or compact layouts.
 */
export function ConnectionDot() {
  const status = useConnectionStore((s) => s.status);
  const desktopName = useConnectionStore((s) => s.desktopName);
  const config = getConfig(status, desktopName);

  return (
    <View
      className="w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: config.color }}
      accessibilityLabel={`Desktop: ${config.label}`}
    />
  );
}
