import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Globe } from 'lucide-react-native';
import type { ManagedCloudPublishedArtifact } from '@agiworkforce/cloud-contracts';

import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
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
import { useSitesListLifetime, type SitesListLifetime } from './useSitesListLifetime';

interface SitesListState {
  view: SitesListLifetime;
  sites: ManagedCloudPublishedArtifact[] | null;
  error: string | null;
  refreshing: boolean;
  canOpen: () => boolean;
}

export const SITES_ROUTE = '/(app)/sites';

export function SitesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const view = useSitesListLifetime(access);
  const [state, setState] = useState<SitesListState | null>(null);
  const visible = state?.view === view && view.isCurrent() ? state : null;
  const displayed = useRef<SitesListState | null>(null);
  displayed.current = visible;
  const sites = visible?.sites ?? null;
  const error = visible?.error ?? null;
  const refreshing = visible?.refreshing ?? false;

  const load = useCallback(async (refresh = false) => {
    const read = view.beginRead();
    if (!read) return;
    setState((current) => read.isCurrent() ? {
      view,
      sites: current?.view === view ? current.sites : null,
      error: null,
      refreshing: refresh,
      canOpen: read.isCurrent,
    } : current);
    try {
      const list = await listPublishedSites(read.authority.signal, read.authority);
      if (!read.isCurrent()) return;
      setState((current) => read.isCurrent()
        ? { view, sites: list.sites, error: null, refreshing: false, canOpen: read.isCurrent }
        : current);
    } catch (loadError) {
      if (!read.isCurrent()) return;
      const message = cloudActionError(loadError, 'Could not load your published sites.');
      setState((current) => read.isCurrent() ? {
        view,
        sites: current?.view === view ? current.sites ?? [] : [],
        error: message,
        refreshing: false,
        canOpen: read.isCurrent,
      } : current);
    }
  }, [view]);

  useEffect(() => {
    void load();
    return () => view.cancelRead();
  }, [load, view]);

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
              onPress={() => {
                if (!view.isCurrent() || displayed.current !== visible || !visible?.canOpen()) return;
                router.push({
                  pathname: '/(app)/sites/[token]' as const,
                  params: { token: item.token },
                });
              }}
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
              onRefresh={() => void load(true)}
              tintColor={colors.textPrimary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
