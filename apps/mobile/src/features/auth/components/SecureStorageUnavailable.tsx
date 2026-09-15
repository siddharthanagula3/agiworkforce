import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';

// Shown when the encrypted store cannot be opened. Running on the unavailable
// store instead reads every key as empty and drops every write, which reads to
// the user as a wiped app: onboarding restarts and open chats disappear.
export function SecureStorageUnavailable({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();

  return (
    <View
      testID="secure-storage-unavailable"
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <ShieldAlert size={44} color={colors.agentError} />
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        Secure storage unavailable
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        AGI Workforce keeps your chats encrypted on this device and cannot open that store right
        now. Nothing has been deleted. Unlock this device and try again.
      </Text>
      <Pressable
        testID="secure-storage-retry"
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={[styles.button, { backgroundColor: colors.teal }]}
      >
        <Text style={[styles.buttonLabel, { color: colors.accentText }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: {
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonLabel: { fontWeight: '600' },
});
