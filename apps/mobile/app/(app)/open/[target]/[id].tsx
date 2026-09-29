import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isProductLinkId, isProductLinkTarget } from '@agiworkforce/types';
import {
  nativeRouteForProductLink,
  productLinkWebFallbackUrl,
} from '@/src/features/notifications/productLinks';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';

export default function ProductLinkRoute() {
  const router = useRouter();
  const colors = useThemeColors();
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
    </SafeAreaView>
  );
}
