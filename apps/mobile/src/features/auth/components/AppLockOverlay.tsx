import { StyleSheet, View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';

// Renders ABOVE the mounted app instead of replacing it. Swapping the tree for
// a lock screen unmounted the navigator, so every resume through the gate threw
// away the open conversation and restarted routing at the root.
export function AppLockOverlay({
  onUnlock,
  onReset,
  variant = 'locked',
}: {
  onUnlock: () => void;
  // A user whose biometrics changed, or whose device lost its enrolment, can
  // never satisfy the gate again. Without this the only way out is a reinstall,
  // which deletes every Local Mode conversation on the device.
  onReset?: () => void;
  variant?: 'locked' | 'cover';
}) {
  const { colors } = useTheme();

  // While the app is merely leaving the foreground there is nothing to ask the
  // user for, so the cover is the background and nothing else.
  if (variant === 'cover') {
    return (
      <View
        testID="app-screen-cover"
        style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.background }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  return (
    <View
      testID="app-lock-overlay"
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
      accessibilityLabel="AGI Workforce is locked"
    >
      <Fingerprint size={48} color={colors.teal} />
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        Locked
      </Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Authenticate to continue</Text>
      <Pressable
        testID="app-lock-unlock"
        onPress={onUnlock}
        accessibilityRole="button"
        accessibilityLabel="Unlock"
        style={[styles.button, { backgroundColor: colors.teal }]}
      >
        <Text style={[styles.buttonLabel, { color: colors.accentText }]}>Unlock</Text>
      </Pressable>
      {onReset ? (
        <Pressable
          testID="app-lock-reset"
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel="Reset app lock and sign out"
          style={styles.resetButton}
        >
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Can&apos;t unlock? Reset app lock and sign out
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 10_000 },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontSize: 14 },
  button: {
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonLabel: { fontWeight: '600' },
  resetButton: {
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
