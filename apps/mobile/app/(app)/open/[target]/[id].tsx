import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { isProductLinkId, isProductLinkTarget } from '@agiworkforce/types';
import {
  nativeRouteForProductLink,
  productLinkWebFallbackUrl,
} from '@/src/features/notifications/productLinks';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useGoBack } from '@/src/shared/hooks/useGoBack';

export default function ProductLinkRoute() {
  const router = useRouter();
  const colors = useThemeColors();
  const handleCancel = useGoBack('/(app)');
  const { target, id } = useLocalSearchParams<{ target?: string; id?: string }>();

  useEffect(() => {
    if (!isProductLinkTarget(target) || !isProductLinkId(id)) {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
      return;
    }
    const link = { target, id };
    const nativeRoute = nativeRouteForProductLink(link);
    if (nativeRoute) {
      router.replace(nativeRoute as Parameters<typeof router.replace>[0]);
      return;
    }
    router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    void openUntrustedUrlInAppBrowser(productLinkWebFallbackUrl(link));
  }, [id, router, target]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
      }}
      accessibilityLabel="Opening the link"
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
