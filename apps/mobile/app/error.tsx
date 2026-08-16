import { View, Pressable, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/src/ui/theme';

interface ErrorBoundaryProps {
  error: Error;
  retry: () => void;
}

export default function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text
          style={[
            styles.emoji,
            { backgroundColor: colors.dangerSurface, color: colors.agentError },
          ]}
        >
          !
        </Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Something went wrong</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          An unexpected error occurred. Please try again.
        </Text>
        <Text style={[styles.errorText, { color: colors.textMuted }]} numberOfLines={3}>
          {error.message}
        </Text>

        <Pressable
          onPress={retry}
          style={[styles.retryButton, { backgroundColor: colors.teal }]}
          accessibilityLabel="Try again"
          accessibilityRole="button"
        >
          <Text style={[styles.retryText, { color: colors.accentText }]}>Try Again</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
          }}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={[styles.backText, { color: colors.textMuted }]}>Go Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 48,
    fontWeight: '700',
    width: 80,
    height: 80,
    lineHeight: 80,
    textAlign: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backText: {
    fontSize: 14,
  },
});
