import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { GITHUB_INSTALL_APP_RETURN_URL } from '@agiworkforce/cloud-contracts';
import { completeGitHubInstall } from '@/src/features/cloud-code/githubInstall';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useGoBack } from '@/src/shared/hooks/useGoBack';

export default function GitHubInstallReturnRoute() {
  const router = useRouter();
  const colors = useThemeColors();
  const handleCancel = useGoBack('/(app)/cloud-code');
  const params = useLocalSearchParams<{
    state?: string;
    code?: string;
    error?: string;
  }>();

  useEffect(() => {
    let cancelled = false;
    const returned = new URL(GITHUB_INSTALL_APP_RETURN_URL);
    for (const key of ['state', 'code', 'error'] as const) {
      const value = params[key];
      if (typeof value === 'string' && value) returned.searchParams.set(key, value);
    }
    void completeGitHubInstall(returned.toString())
      .catch((error: unknown) => {
        console.warn('[cloud-code] finishing the GitHub install failed', error);
      })
      .finally(() => {
        if (!cancelled) router.replace('/(app)/cloud-code' as Parameters<typeof router.replace>[0]);
      });
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
      }}
      accessibilityLabel="Finishing the GitHub connection"
    >
      <ActivityIndicator color={colors.textPrimary} />
      <Pressable
        onPress={handleCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={{ marginTop: 24, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}
