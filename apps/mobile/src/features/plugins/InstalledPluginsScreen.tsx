import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Blocks, ChevronRight, Search } from 'lucide-react-native';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import type {
  PluginDirectoryEntryWire,
  PluginInstallationWire,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { ApprovalPolicySummary } from '@/src/features/settings/cloud-connectors/ApprovalPolicySummary';
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
import { BottomSearchBar, useBottomSearchBarSpace } from '@/src/shared/components/BottomSearchBar';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { ROW_LABEL_TEXT_SCALE_LIMIT, typeScale } from '@/src/ui/theme/tokens';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import { SCREEN_GUTTER } from './InstalledPluginTiles';
import { addedPluginRows, type AddedPluginRow } from './pluginsModel';
import { fetchPluginInstallations } from './service';
import { useInstalledPluginDetails } from './useInstalledPluginDetails';

const PLUGINS_HREF = '/(app)/plugins';
const NO_KNOWN_ENTRIES: ReadonlyMap<string, PluginDirectoryEntryWire> = new Map();

const ROW_PADDING = 14;
const ROW_ICON_SIZE = 40;
const ROW_GAP = 12;
const ROW_DIVIDER_INSET = ROW_PADDING + ROW_ICON_SIZE + ROW_GAP;
const SEARCH_BAR_CLEARANCE = 16;

function AddedPluginRowView({
  row,
  onOpen,
}: {
  row: AddedPluginRow;
  onOpen: (id: string) => void;
}) {
  const colors = useThemeColors();
  const stacked = useLargeTextRows();
  return (
    <PressableBox
      onPress={() => onOpen(row.id)}
      accessibilityRole="button"
      accessibilityLabel={row.meta ? `${row.name}. ${row.meta}` : row.name}
      style={({ pressed }) => ({
        minHeight: ROW_ICON_SIZE + ROW_PADDING * 2,
        padding: ROW_PADDING,
        flexDirection: 'row',
        alignItems: 'center',
        gap: ROW_GAP,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
    >
      <View
        style={{
          width: ROW_ICON_SIZE,
          height: ROW_ICON_SIZE,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.neutralSurface,
        }}
      >
        <Blocks size={18} color={colors.textPrimary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          {...(stacked
            ? { maxFontSizeMultiplier: ROW_LABEL_TEXT_SCALE_LIMIT }
            : { numberOfLines: 1 })}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {row.name}
        </Text>
        {row.meta ? <MetaText>{row.meta}</MetaText> : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </PressableBox>
  );
}

export function InstalledPluginsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack(PLUGINS_HREF);
  const searchSpace = useBottomSearchBarSpace();
  const [search, setSearch] = useState('');
  const [installations, setInstallations] = useState<PluginInstallationWire[] | null>(null);
  const [pulling, setPulling] = useState(false);
  const [listShown, setListShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const focusedBefore = useRef(false);

  useEffect(() => {
    if (!access.ready) return;
    const account = captureCloudAccountEpoch();
    if (!account) {
      setPulling(false);
      return;
    }
    const controller = new AbortController();
    setFailed(false);
    fetchPluginInstallations(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setInstallations(loaded);
      })
      .catch(() => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && isCloudAccountEpochCurrent(account)) setPulling(false);
      });
    return () => controller.abort();
  }, [access.ready, access.ownerId, reload]);

  const accessReady = useRef(access.ready);
  useEffect(() => {
    accessReady.current = access.ready;
  }, [access.ready]);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      if (accessReady.current) setReload((value) => value + 1);
    }, []),
  );

  const ids = useMemo(
    () => (installations ?? []).map((installation) => installation.pluginId),
    [installations],
  );
  const { details, settled } = useInstalledPluginDetails(ids, NO_KNOWN_ENTRIES, reload);
  const rows = useMemo(
    () =>
      addedPluginRows(
        (installations ?? []).filter((installation) => details.has(installation.pluginId)),
        details,
        search,
      ),
    [details, installations, search],
  );
  useEffect(() => {
    if (installations !== null && settled) setListShown(true);
  }, [installations, settled]);
  const retry = useCallback(() => setReload((value) => value + 1), []);
  const refresh = useCallback(() => {
    setPulling(true);
    setReload((value) => value + 1);
  }, []);
  const openPlugin = useCallback(
    (id: string) => router.push({ pathname: '/(app)/plugins/[id]' as const, params: { id } }),
    [router],
  );

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Added"
        feature="Plugins"
        description="Plugins live in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const loadingList = installations === null ? !failed : !settled && !listShown;
  const empty = installations !== null && installations.length === 0;
  const searchable = installations !== null && installations.length > 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title="Added" onBack={goBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: SCREEN_GUTTER,
          paddingBottom: searchSpace + SEARCH_BAR_CLEARANCE,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={refresh} tintColor={colors.textPrimary} />
        }
      >
        <ApprovalPolicySummary
          label="Permissions"
          helper={`Choose when ${PRODUCT_BRAND} asks before a plugin acts.`}
        />
        {failed ? <ErrorBanner message="Could not load your plugins." onRetry={retry} /> : null}
        {empty ? (
          <EmptyState
            Icon={Blocks}
            title="No plugins added yet"
            body="Plugins you add appear here."
            action={
              <Button
                title="Browse plugins"
                variant="outline"
                onPress={() => router.push(PLUGINS_HREF as Parameters<typeof router.push>[0])}
              />
            }
          />
        ) : loadingList ? (
          <LoadingRows />
        ) : searchable && rows.length === 0 ? (
          <EmptyState Icon={Search} title="No matching plugins" body="Try a different name." />
        ) : searchable ? (
          <>
            <Text
              accessibilityRole="header"
              style={{
                paddingTop: 14,
                color: colors.textPrimary,
                fontSize: typeScale.headline,
                fontWeight: '600',
              }}
            >
              Added
            </Text>
            <View
              style={{
                borderRadius: cardRadius,
                borderCurve: 'continuous',
                backgroundColor: colors.surfaceElevated,
                overflow: 'hidden',
              }}
            >
              {rows.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? (
                    <View
                      style={{
                        height: 1,
                        backgroundColor: colors.border,
                        marginLeft: ROW_DIVIDER_INSET,
                      }}
                    />
                  ) : null}
                  <AddedPluginRowView row={row} onOpen={openPlugin} />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      {searchable ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <BottomSearchBar
            testID="added-plugins-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search plugins"
            accessibilityLabel="Search plugins"
            clearAccessibilityLabel="Clear plugin search"
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
