import { View, Pressable, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/src/ui/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.code, { color: colors.border }]}>404</Text>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Page Not Found</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          The page you are looking for does not exist.
        </Text>

        <Pressable
          onPress={() => router.replace({ pathname: '/(app)' as const })}
          style={[styles.homeButton, { backgroundColor: colors.teal }]}
          accessibilityLabel="Go to home screen"
          accessibilityRole="button"
        >
          <Text style={[styles.homeText, { color: colors.accentText }]}>Go Home</Text>
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
  code: {
    fontSize: 64,
    fontWeight: '800',
    marginBottom: 8,
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
    marginBottom: 32,
  },
  homeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  homeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
