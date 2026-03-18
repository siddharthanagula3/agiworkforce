import { View, Pressable, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

/**
 * Catch-all 404 screen for unknown routes.
 * Uses inline styles only (no NativeWind) for reliability.
 * Required for App Store review — prevents crashes on invalid deep links.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.code}>404</Text>
        <Text style={styles.heading}>Page Not Found</Text>
        <Text style={styles.description}>The page you are looking for does not exist.</Text>

        <Pressable
          onPress={() => router.replace('/(app)')}
          style={styles.homeButton}
          accessibilityLabel="Go to home screen"
          accessibilityRole="button"
        >
          <Text style={styles.homeText}>Go Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
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
    color: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 8,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  homeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#14b8a6',
    borderRadius: 12,
  },
  homeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
