import { useCallback } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';

/**
 * There is no Dispatch-specific safety document under `apps/web/app` today.
 * verified 2026-08-01: the route list has no `dispatch/`, `pairing/` or
 * `safety/` directory. `/security` is the closest page that actually exists and
 * actually answers the question ("Sandboxed by default", "Approval flow",
 * "Audit trail"), so it is what this links to. Repoint this constant if a
 * dedicated pairing-safety page ships.
 */
export const DISPATCH_SAFETY_URL = 'https://agiworkforce.com/security';

export function PairingRiskDisclosure({ className }: { className?: string }) {
  const colors = useThemeColors();

  const handleOpenSafetyGuide = useCallback(async () => {
    const opened = await openExternalUrl(DISPATCH_SAFETY_URL);
    if (!opened) {
      Alert.alert('Error', 'Could not open the link. Please try again.');
    }
  }, []);

  return (
    <View className={`w-full${className ? ` ${className}` : ''}`}>
      <View className="flex-row items-start gap-2">
        <ShieldAlert size={14} color={colors.agentWarning} style={{ marginTop: 2 }} />
        <Text className="text-xs text-white/60 leading-5 flex-1">
          AGI Workforce will use your desktop to run the tasks you send from this phone. That can
          read and change files on that computer. Only pair devices you trust and keep them with
          you.
        </Text>
      </View>
      <Pressable
        onPress={() => void handleOpenSafetyGuide()}
        className="self-start mt-2 py-1"
        accessibilityRole="link"
        accessibilityLabel="Learn how to use Dispatch safely. Opens agiworkforce.com in your browser."
      >
        <Text className="text-xs font-medium" style={{ color: colors.teal }}>
          Learn how to use this safely
        </Text>
      </Pressable>
    </View>
  );
}
