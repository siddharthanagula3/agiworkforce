import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Globe } from 'lucide-react-native';
import type { ManagedCloudPublishedArtifact } from '@agiworkforce/cloud-contracts';

import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SITE_VISIBILITY_LABELS, listPublishedSites, siteName } from './service';

export const SITES_ROUTE = '/(app)/sites';

export function SitesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const [sites, setSites] = useState<ManagedCloudPublishedArtifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    setError(null);
    try {
      const list = await listPublishedSites(signal);
      if (isCloudAccountEpochCurrent(account)) setSites(list.sites);
    } catch (loadError) {
      if (signal?.aborted || !isCloudAccountEpochCurrent(account)) return;
      setSites((current) => current ?? []);
      setError(cloudActionError(loadError, 'Could not load your published sites.'));
    }
  }, []);

  useEffect(() => {
    if (!access.ready) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [access.ready, load]);

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Published sites"
        feature="Published sites"
        description="Published sites live in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title="Published sites" onBack={goBack} />
      {sites === null ? (
        <LoadingRows />
      ) : (
        <FlatList
          data={sites}
          keyExtractor={(site) => site.token}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 4 }}>
              <MetaText>
                Everything of yours that is published right now. Unpublishing is the only way a page
                comes down.
              </MetaText>
              {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
            </View>
          }
          renderItem={({ item }) => (
            <PressableBox
              onPress={() =>
                router.push({
                  pathname: '/(app)/sites/[token]' as const,
                  params: { token: item.token },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`${siteName(item)}. ${SITE_VISIBILITY_LABELS[item.visibility]}`}
              style={{
                borderRadius: 16,
                borderCurve: 'continuous',
                padding: 14,
                gap: 4,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
              >
                {siteName(item)}
              </Text>
              <MetaText>
                {[
                  SITE_VISIBILITY_LABELS[item.visibility],
                  item.version > 0 ? `Version ${item.version}` : null,
                  `Updated ${new Date(item.updatedAt).toLocaleDateString()}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </MetaText>
            </PressableBox>
          )}
          ListEmptyComponent={
            <EmptyState
              Icon={Globe}
              title="Nothing published"
              body="Open an artifact in a Cloud chat and publish it to give it a link people can open."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={colors.textPrimary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
