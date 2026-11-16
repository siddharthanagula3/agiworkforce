import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import {
  Plug,
  Link,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Compass,
  X,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';
import { CONNECTORS_COMING_SOON_LABEL, connectorReleased } from '@agiworkforce/types';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { BottomSearchBar, useBottomSearchBarSpace } from '@/src/shared/components/BottomSearchBar';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { toUserMessage } from '@/services/userMessage';
import { AddCustomConnectorModal } from './AddCustomConnectorModal';
import { ApprovalPolicySummary } from './ApprovalPolicySummary';
import { ConnectorLogo } from './ConnectorLogo';
import { connectionStatus, formatConnectorName } from './connectorStatus';
import { connectorAuthorizationNotice } from './connectorAuthorizationOutcome';
import { connectorFailureMessage } from './connectorFailureMessage';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTierStore } from '@/src/features/billing/store';
import { CapabilityUnavailable, useCapabilityDenialReason } from '@/src/lib/Capabilities';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  authorizeConnectorInApp,
  browseConnectorListings,
  fetchConnectorDirectory,
  linkBankAccountsInApp,
  startConnectorOAuth,
  type ConnectedConnector,
  type ConnectorDirectory,
  type ConnectorListing,
  type ConnectorListingCategory,
} from '@/services/connectors';
import {
  BANK_ACCOUNTS_CONNECTOR_ID,
  CONNECTOR_DIRECTORY_CATEGORIES,
  connectorOutcomeNotice,
  type ConnectorOutcomeNotice,
} from '@agiworkforce/cloud-contracts';

const BANK_LINK_LABEL = 'Link a bank account';
const BANK_LINK_HINT = 'Read-only US bank balances and transactions via Plaid. Can’t move money.';

const ALL_FILTER = 'All';
const CONNECTED_FILTER = 'Connected';
const CUSTOM_FILTER = 'Custom';
const CUSTOM_CONNECTOR_DESCRIPTION = 'Your encrypted remote MCP endpoint';

function requestedCategoryFilter(
  value: string | string[] | undefined,
): ConnectorListingCategory | null {
  const requested = Array.isArray(value) ? value[0] : value;
  return CONNECTOR_DIRECTORY_CATEGORIES.find((category) => category === requested) ?? null;
}

function keepRequestedCategory(
  categories: ConnectorListingCategory[],
  requested: ConnectorListingCategory | null,
  previous: readonly ConnectorListingCategory[],
): ConnectorListingCategory[] {
  if (requested === null || categories.includes(requested)) return categories;
  const position = previous.indexOf(requested);
  if (position === -1) return [...categories, requested];
  const precedingCount = previous
    .slice(0, position)
    .filter((category) => categories.includes(category)).length;
  return [...categories.slice(0, precedingCount), requested, ...categories.slice(precedingCount)];
}

interface ConnectorRow {
  key: string;
  routeId: string;
  name: string;
  publisher: string | null;
  description: string;
  connection: ConnectedConnector | null;
}

function listingRow(
  listing: ConnectorListing,
  connection: ConnectedConnector | null,
): ConnectorRow {
  return {
    key: connection ? `connection:${connection.id}` : `listing:${listing.id}`,
    routeId: connection?.connectorId ?? listing.id,
    name: listing.name,
    publisher: listing.publisher || null,
    description: listing.description,
    connection,
  };
}

function connectionRow(
  connection: ConnectedConnector,
  listing: ConnectorListing | undefined,
): ConnectorRow {
  if (listing) return listingRow(listing, connection);
  return {
    key: `connection:${connection.id}`,
    routeId: connection.connectorId,
    name: connection.name || formatConnectorName(connection.connectorId),
    publisher: null,
    description: connection.source === 'custom' ? CUSTOM_CONNECTOR_DESCRIPTION : '',
    connection,
  };
}

const ROW_PADDING_X = 16;
const ROW_PADDING_Y = 13;
const ROW_ICON_SIZE = 40;
const ROW_ICON_GAP = 12;
const ROW_DIVIDER_INSET = ROW_PADDING_X + ROW_ICON_SIZE + ROW_ICON_GAP;

function ConnectorCard({ row, onPress }: { row: ConnectorRow; onPress: () => void }) {
  const colors = useThemeColors();
  const status = row.connection ? connectionStatus(row.connection) : null;
  const connectedAt = row.connection?.connectedAt;
  const statusLabel =
    status === 'needs-reauthorization'
      ? 'Authorization expired, reconnect'
      : status === 'not-responding'
        ? 'Not responding'
        : status === 'connected'
          ? connectedAt
            ? `Connected ${new Date(connectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : 'Connected'
          : null;
  const statusColor =
    status === 'needs-reauthorization'
      ? colors.agentError
      : status === 'not-responding'
        ? colors.agentWarning
        : colors.textMuted;
  const comingSoon = !row.connection && !connectorReleased(row.routeId);
  const detail = statusLabel ?? (comingSoon ? CONNECTORS_COMING_SOON_LABEL : row.description);

  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}${row.publisher ? `, ${row.publisher}` : ''}. ${
        statusLabel ?? (comingSoon ? CONNECTORS_COMING_SOON_LABEL : 'Not connected')
      }`}
    >
      {({ pressed }) => (
        <View
          style={{
            paddingHorizontal: ROW_PADDING_X,
            paddingVertical: ROW_PADDING_Y,
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ROW_ICON_GAP }}>
            <ConnectorLogo />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
              >
                {row.name}
              </Text>
              {row.publisher ? (
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textSecondary, fontSize: typeScale.caption, marginTop: 1 }}
                >
                  {row.publisher}
                </Text>
              ) : null}
              {detail ? (
                <Text
                  numberOfLines={1}
                  style={{ color: statusColor, fontSize: typeScale.caption, marginTop: 2 }}
                >
                  {detail}
                </Text>
              ) : null}
            </View>
            {status ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      status === 'needs-reauthorization'
                        ? colors.dangerSurface
                        : status === 'not-responding'
                          ? colors.warningSurface
                          : colors.successSurface,
                    borderWidth: 1,
                    borderColor:
                      status === 'needs-reauthorization'
                        ? colors.dangerBorder
                        : status === 'not-responding'
                          ? colors.warningBorder
                          : colors.successBorder,
                  }}
                >
                  {status === 'needs-reauthorization' ? (
                    <RefreshCw size={15} color={colors.agentError} />
                  ) : status === 'not-responding' ? (
                    <AlertTriangle size={15} color={colors.agentWarning} />
                  ) : (
                    <CheckCircle size={15} color={colors.agentSuccess} />
                  )}
                </View>
                <ChevronRight size={17} color={colors.textMuted} />
              </View>
            ) : (
              <ChevronRight size={17} color={colors.textMuted} />
            )}
          </View>
        </View>
      )}
    </PressableBox>
  );
}

const announcedConnectorNotices = new Set<string>();

interface ConnectorHealthNotice {
  key: string;
  connection: ConnectedConnector;
  name: string;
  expired: boolean;
}

const CONNECTOR_HEALTH_NOTICE_TOOL = 'its last request';

function connectorHealthNoticeOutcome(notice: ConnectorHealthNotice): ConnectorOutcomeNotice {
  return connectorOutcomeNotice({
    connectorId: notice.connection.connectorId,
    connectorLabel: notice.name,
    toolName: CONNECTOR_HEALTH_NOTICE_TOOL,
    failure: notice.expired ? 'authorization' : 'unavailable',
  });
}

function connectorHealthNoticeBody(
  notice: ConnectorHealthNotice,
  outcome: ConnectorOutcomeNotice,
): string {
  if (notice.expired && notice.connection.source !== 'oauth') {
    return 'Its authorization expired. Open it to disconnect it, then add it again.';
  }
  return outcome.detail;
}

function ConnectorHealthNoticeCard({
  notice,
  reconnecting,
  onReconnect,
  onRetry,
  onOpen,
  onDismiss,
}: {
  notice: ConnectorHealthNotice;
  reconnecting: boolean;
  onReconnect: () => void;
  onRetry: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const outcome = connectorHealthNoticeOutcome(notice);
  const canReconnect = notice.expired && notice.connection.source === 'oauth';
  const canRetry = !notice.expired && outcome.actionLabel !== null;
  const actionName =
    (canReconnect || canRetry ? outcome.actionLabel : null) ??
    (canReconnect ? 'Reconnect' : 'Open');
  const actionLabel = canReconnect && reconnecting ? 'Opening authorization…' : actionName;
  const onAction = canReconnect ? onReconnect : canRetry ? onRetry : onOpen;
  const actionAccessibilityLabel = `${actionName} ${notice.name}`;
  return (
    <View
      testID="connector-health-notice"
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderRadius: 12,
        backgroundColor: notice.expired ? colors.dangerSurface : colors.warningSurface,
        borderWidth: 1,
        borderColor: notice.expired ? colors.dangerBorder : colors.warningBorder,
        paddingLeft: 12,
        paddingTop: 12,
        marginBottom: 14,
      }}
    >
      <View style={{ paddingTop: 2 }}>
        {notice.expired ? (
          <RefreshCw size={15} color={colors.agentError} />
        ) : (
          <AlertTriangle size={15} color={colors.agentWarning} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          {outcome.title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
          {connectorHealthNoticeBody(notice, outcome)}
        </Text>
        <PressableBox
          onPress={onAction}
          disabled={reconnecting}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel}
          accessibilityState={{ disabled: reconnecting }}
          style={{ alignSelf: 'flex-start', minHeight: 44, minWidth: 44, justifyContent: 'center' }}
        >
          <Text
            style={{
              color: notice.expired ? colors.agentError : colors.agentWarning,
              fontSize: typeScale.footnote,
              fontWeight: '600',
            }}
          >
            {actionLabel}
          </Text>
        </PressableBox>
      </View>
      <PressableBox
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss the notice about ${notice.name}`}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={16} color={colors.textMuted} />
      </PressableBox>
    </View>
  );
}

function WaitlistPlaceholder() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 20,
        alignItems: 'center',
        gap: 12,
        marginBottom: 18,
      }}
    >
      <Link size={32} color={colors.textMuted} />
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typeScale.body,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        Connectors, AGI Cloud
      </Text>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.footnote,
          lineHeight: 18,
          textAlign: 'center',
        }}
      >
        Connect your apps and services. Needs AGI Cloud access.
      </Text>
    </View>
  );
}

const DIRECTORY_INDEXING_NOTE = 'The directory is still being indexed. Try again shortly.';
const NONE_CONNECTED_COPY = 'No connectors connected yet.';
const NO_CONNECTORS_FOUND = 'No connectors found';

export default function CloudConnectorsScreen({
  backHref = '/(app)/settings',
}: {
  backHref?: string;
} = {}) {
  const colors = useThemeColors();
  const bottomSearchSpace = useBottomSearchBarSpace();
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string | string[] }>();
  const requestedCategory = requestedCategoryFilter(categoryParam);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';
  const connectorsDenial = useCapabilityDenialReason('canUseConnectors');
  const connectorsSwitchedOn = connectorsDenial === null;
  const canUseConnectors = useTierStore((s) => s.grantedCapabilities.includes('canUseConnectors'));
  const isTierRefreshing = useTierStore((s) => s.isRefreshing);
  const lastTierRefreshAt = useTierStore((s) => s.lastRefreshedAt);
  const refreshTier = useTierStore((s) => s.refreshTier);
  const connectorDiscoveryEnabled = useCloudSettingsStore((s) => s.connectorDiscoveryEnabled);
  const setConnectorDiscoveryEnabled = useCloudSettingsStore((s) => s.setConnectorDiscoveryEnabled);
  const capabilityRefreshOwnerRef = useRef<string | null>(null);
  const capabilityHandshakePending =
    isClerkSignedIn && isCloudModeActive && (isTierRefreshing || lastTierRefreshAt === null);

  const [directory, setDirectory] = useState<ConnectorDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>(requestedCategory ?? ALL_FILTER);
  const filterOwnerRef = useRef(clerkUserId);
  const [search, setSearch] = useState('');
  const [listingSearch, setListingSearch] = useState('');
  const [addCustomVisible, setAddCustomVisible] = useState(false);
  const [listings, setListings] = useState<ConnectorListing[]>([]);
  const [knownListings, setKnownListings] = useState<ReadonlyMap<string, ConnectorListing>>(
    () => new Map(),
  );
  const [listingCategories, setListingCategories] = useState<ConnectorListingCategory[]>([]);
  const [categoriesWithListings, setCategoriesWithListings] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [directoryIndexing, setDirectoryIndexing] = useState(false);
  const [healthNotices, setHealthNotices] = useState<ConnectorHealthNotice[]>([]);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const listingRequestRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const nextDirectory = await fetchConnectorDirectory();
      if (!isCloudAccountEpochCurrent(account)) return;
      setDirectory(nextDirectory);
    } catch {
      if (!isCloudAccountEpochCurrent(account)) return;
      setError('Could not load connectors. Retry.');
    } finally {
      if (isCloudAccountEpochCurrent(account)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    listingRequestRef.current += 1;
    setDirectory(null);
    setLoading(false);
    setError(null);
    if (filterOwnerRef.current && filterOwnerRef.current !== clerkUserId) {
      setActiveFilter(ALL_FILTER);
    }
    filterOwnerRef.current = clerkUserId;
    setSearch('');
    setListingSearch('');
    setAddCustomVisible(false);
    setListings([]);
    setKnownListings(new Map());
    setListingCategories([]);
    setCategoriesWithListings(new Set());
    setNextCursor(null);
    setListingsLoading(false);
    setListingsError(null);
    setHealthNotices([]);
    setReconnectingId(null);
  }, [clerkUserId]);

  const appliedCategoryRef = useRef(requestedCategory);
  useEffect(() => {
    if (appliedCategoryRef.current === requestedCategory) return;
    appliedCategoryRef.current = requestedCategory;
    setActiveFilter(requestedCategory ?? ALL_FILTER);
  }, [requestedCategory]);

  useEffect(() => {
    const timer = setTimeout(() => setListingSearch(search.trim()), SEARCH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!FEATURES.connectors || !isClerkSignedIn || !clerkUserId || !isCloudModeActive) {
      capabilityRefreshOwnerRef.current = null;
      return;
    }
    if (
      lastTierRefreshAt === null &&
      !isTierRefreshing &&
      capabilityRefreshOwnerRef.current !== clerkUserId
    ) {
      capabilityRefreshOwnerRef.current = clerkUserId;
      void refreshTier();
    }
  }, [
    clerkUserId,
    isClerkSignedIn,
    isCloudModeActive,
    isTierRefreshing,
    lastTierRefreshAt,
    refreshTier,
  ]);

  useEffect(() => {
    if (
      FEATURES.connectors &&
      isClerkSignedIn &&
      isCloudModeActive &&
      !capabilityHandshakePending &&
      canUseConnectors
    ) {
      void load();
    }
  }, [
    clerkUserId,
    load,
    isClerkSignedIn,
    isCloudModeActive,
    capabilityHandshakePending,
    canUseConnectors,
  ]);

  const directoryVisible =
    FEATURES.connectors &&
    isClerkSignedIn &&
    Boolean(clerkUserId) &&
    isCloudModeActive &&
    !capabilityHandshakePending &&
    canUseConnectors &&
    !error;

  const listingCategory = useMemo(
    () =>
      listingCategories.find((category) => category === activeFilter) ??
      (activeFilter === requestedCategory ? requestedCategory : null),
    [activeFilter, listingCategories, requestedCategory],
  );
  const browsesListings = activeFilter === ALL_FILTER || listingCategory !== null;

  const loadListings = useCallback(
    async (cursor: string | null) => {
      const account = captureCloudAccountEpoch();
      if (!account) return;
      listingRequestRef.current += 1;
      const request = listingRequestRef.current;
      const isCurrent = () =>
        request === listingRequestRef.current && isCloudAccountEpochCurrent(account);
      setListingsLoading(true);
      setListingsError(null);
      try {
        const page = await browseConnectorListings({
          search: listingSearch,
          category: listingCategory,
          cursor,
        });
        if (!isCurrent()) return;
        setListings((current) => (cursor ? [...current, ...page.entries] : page.entries));
        setKnownListings(
          (current) =>
            new Map([...current, ...page.entries.map((entry) => [entry.id, entry] as const)]),
        );
        setListingCategories((current) =>
          keepRequestedCategory(page.categories, listingCategory, current),
        );
        if (listingCategory === null && !cursor && !listingSearch) {
          setCategoriesWithListings(
            new Set(
              page.nextCursor === null
                ? page.entries.flatMap((entry) => entry.categories)
                : page.categories,
            ),
          );
        }
        setNextCursor(page.nextCursor);
        if (!cursor) setDirectoryIndexing(page.stats?.bootstrapComplete === false);
      } catch {
        if (!isCurrent()) return;
        setListingsError('Could not load the connector directory. Retry.');
      } finally {
        if (isCurrent()) setListingsLoading(false);
      }
    },
    [listingCategory, listingSearch],
  );

  useEffect(() => {
    if (!directoryVisible || !browsesListings) return;
    setListings([]);
    setNextCursor(null);
    void loadListings(null);
  }, [browsesListings, clerkUserId, directoryVisible, loadListings]);

  const connections = useMemo(
    () =>
      directory?.connectors.filter(
        (connection) =>
          FEATURES.bankLinking || connection.connectorId !== BANK_ACCOUNTS_CONNECTOR_ID,
      ) ?? null,
    [directory],
  );
  useEffect(() => {
    if (!connections || !clerkUserId) return;
    const fresh: ConnectorHealthNotice[] = [];
    for (const connection of connections) {
      const status = connectionStatus(connection);
      if (status === 'connected') continue;
      const key = `${clerkUserId}:${connection.id}:${status}`;
      if (announcedConnectorNotices.has(key)) continue;
      announcedConnectorNotices.add(key);
      fresh.push({
        key,
        connection,
        name: connection.name || formatConnectorName(connection.connectorId),
        expired: status === 'needs-reauthorization',
      });
    }
    if (fresh.length > 0) setHealthNotices((current) => [...current, ...fresh]);
  }, [clerkUserId, connections]);

  const dismissHealthNotice = useCallback((key: string) => {
    setHealthNotices((current) => current.filter((notice) => notice.key !== key));
  }, []);

  const retryFromNotice = useCallback(
    (notice: ConnectorHealthNotice) => {
      dismissHealthNotice(notice.key);
      announcedConnectorNotices.delete(notice.key);
      void load();
    },
    [dismissHealthNotice, load],
  );

  const bankLinkOffered =
    FEATURES.bankLinking &&
    (directory?.available.includes(BANK_ACCOUNTS_CONNECTOR_ID) ?? false) &&
    !(connections ?? []).some((c) => c.connectorId === BANK_ACCOUNTS_CONNECTOR_ID);

  const openBankLinking = useCallback(async () => {
    try {
      const outcome = await linkBankAccountsInApp();
      if (outcome === 'connected') await load();
    } catch (error) {
      Alert.alert(
        'Bank not linked',
        toUserMessage(error, 'The bank link did not finish. Try again.'),
      );
    }
  }, [load]);

  const connectionFor = useCallback(
    (listingId: string) =>
      connections?.find((c) => c.connectorId === listingId || c.directoryId === listingId) ?? null,
    [connections],
  );

  const isConnectorActionCurrent = useCallback((account: CloudAccountEpoch | null) => {
    return (
      isCloudAccountEpochCurrent(account) && useChatAppModeStore.getState().appMode === 'cloud'
    );
  }, []);

  const openConnector = useCallback(
    (row: ConnectorRow) => {
      if (!isConnectorActionCurrent(captureCloudAccountEpoch())) return;
      router.push({
        pathname: '/(app)/connectors/[id]',
        params: { id: row.routeId },
      } as unknown as Parameters<typeof router.push>[0]);
    },
    [isConnectorActionCurrent, router],
  );

  const reconnectFromNotice = useCallback(
    (notice: ConnectorHealthNotice) => {
      if (reconnectingId) return;
      const account = captureCloudAccountEpoch();
      if (!account || !isConnectorActionCurrent(account)) return;
      setReconnectingId(notice.key);
      void (async () => {
        try {
          const start = await startConnectorOAuth(notice.connection.connectorId);
          if (!isConnectorActionCurrent(account)) return;
          if (start.appReturn) {
            const outcome = await authorizeConnectorInApp(start.authorizeUrl);
            if (!isConnectorActionCurrent(account)) return;
            if (outcome === 'connected') dismissHealthNotice(notice.key);
            await load();
            const announced = connectorAuthorizationNotice(notice.name, outcome);
            if (announced && isConnectorActionCurrent(account)) {
              Alert.alert(announced.title, announced.body);
            }
            return;
          }
          const opened = await openUntrustedUrlInAppBrowser(start.authorizeUrl);
          if (!isConnectorActionCurrent(account)) return;
          if (!opened) {
            Alert.alert(
              'Could not open authorization',
              'No browser was available to complete the authorization. Nothing changed.',
            );
            return;
          }
          await load();
        } catch (reconnectError) {
          if (!isConnectorActionCurrent(account)) return;
          Alert.alert(
            'Could not reauthorize',
            connectorFailureMessage(reconnectError, 'reauthorize'),
          );
        } finally {
          if (isCloudAccountEpochCurrent(account)) setReconnectingId(null);
        }
      })();
    },
    [dismissHealthNotice, isConnectorActionCurrent, load, reconnectingId],
  );

  const filters = useMemo(
    () => [
      ALL_FILTER,
      CONNECTED_FILTER,
      ...(connections?.some((connector) => connector.source === 'custom') ? [CUSTOM_FILTER] : []),
      ...listingCategories.filter(
        (category) => category === activeFilter || categoriesWithListings.has(category),
      ),
    ],
    [activeFilter, categoriesWithListings, connections, listingCategories],
  );

  const visibleRows = useMemo(() => {
    if (!connections) return [];
    const q = search.trim().toLowerCase();
    const matches = (row: ConnectorRow) =>
      !q ||
      [row.name, row.publisher ?? '', row.description].some((value) =>
        value.toLowerCase().includes(q),
      );
    const connectedRows = connections
      .map((connection) =>
        connectionRow(
          connection,
          knownListings.get(connection.connectorId) ??
            (connection.directoryId ? knownListings.get(connection.directoryId) : undefined),
        ),
      )
      .filter(matches);
    if (activeFilter === CONNECTED_FILTER) return connectedRows;
    if (activeFilter === CUSTOM_FILTER) {
      return connectedRows.filter((row) => row.connection?.source === 'custom');
    }
    const listedRows = listings
      .filter((listing) => FEATURES.bankLinking || listing.id !== BANK_ACCOUNTS_CONNECTOR_ID)
      .map((listing) => listingRow(listing, connectionFor(listing.id)));
    return activeFilter === ALL_FILTER
      ? [...connectedRows, ...listedRows.filter((row) => row.connection === null)]
      : listedRows;
  }, [activeFilter, connectionFor, connections, knownListings, listings, search]);

  const listingsPending =
    connections === null || (browsesListings && (listingsLoading || listingsError !== null));
  const emptyTitle =
    activeFilter === CONNECTED_FILTER && !search.trim() && connections?.length === 0
      ? NONE_CONNECTED_COPY
      : NO_CONNECTORS_FOUND;

  const handleSignIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent('cloud-connectors'));
  }, [router]);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell
        title="Connectors"
        backHref={backHref}
        help={{ docId: 'connectors-and-mcp', label: 'How connectors work' }}
      >
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={handleSignIn} />
      </SettingsScreenShell>
    );
  }

  if (!connectorsSwitchedOn) {
    return (
      <SettingsScreenShell
        title="Connectors"
        backHref={backHref}
        help={{ docId: 'connectors-and-mcp', label: 'How connectors work' }}
      >
        <CapabilityUnavailable label="Connectors" reason={connectorsDenial} />
      </SettingsScreenShell>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SettingsScreenShell
        title="Connectors"
        backHref={backHref}
        help={{ docId: 'connectors-and-mcp', label: 'How connectors work' }}
      >
        <SettingsInfo
          title="Connect your tools to AGI Cloud"
          body="Open a connector to see what it can do before you connect it."
          icon={Plug}
        />

        {FEATURES.connectors && (
          <>
            <ApprovalPolicySummary
              label="Action approvals"
              helper="Choose when AGI asks before a connected tool acts."
            />
            <SettingsGroup>
              <SettingsSwitchRow
                label="Connector discovery"
                description="Suggest connectors you haven’t connected in new chats."
                icon={Compass}
                value={connectorDiscoveryEnabled}
                onValueChange={setConnectorDiscoveryEnabled}
                testID="connector-discovery-switch"
                isLast
              />
            </SettingsGroup>
          </>
        )}

        {!FEATURES.connectors && <WaitlistPlaceholder />}

        {FEATURES.connectors && !isCloudModeActive && (
          <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
        )}

        {FEATURES.connectors && capabilityHandshakePending && (
          <View
            accessibilityLabel="Checking connector access"
            style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}
          >
            <LoadingIndicator size="large" />
            <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
              Checking connector access…
            </Text>
          </View>
        )}

        {FEATURES.connectors &&
          isCloudModeActive &&
          !capabilityHandshakePending &&
          !canUseConnectors && (
            <View
              style={{
                borderRadius: 12,
                backgroundColor: colors.neutralSurface,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                marginBottom: 18,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                Connectors are not available for this account.
              </Text>
            </View>
          )}

        {FEATURES.connectors &&
          isCloudModeActive &&
          !capabilityHandshakePending &&
          canUseConnectors &&
          loading &&
          !connections && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <LoadingIndicator size="large" />
            </View>
          )}

        {FEATURES.connectors &&
          isCloudModeActive &&
          !capabilityHandshakePending &&
          canUseConnectors &&
          error && (
            <View
              style={{
                borderRadius: 12,
                backgroundColor: colors.dangerSurface,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
                padding: 12,
                marginBottom: 18,
              }}
            >
              <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
                {error}
              </Text>
              <PressableBox
                hitSlop={{ top: 6, bottom: 6 }}
                onPress={() => void load()}
                disabled={loading}
                accessibilityLabel="Retry loading connectors"
                accessibilityRole="button"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  minHeight: 32,
                }}
              >
                <RefreshCw size={14} color={colors.agentError} />
                <Text
                  style={{
                    color: colors.agentError,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  {loading ? 'Retrying…' : 'Retry'}
                </Text>
              </PressableBox>
            </View>
          )}

        {directoryVisible && (
          <>
            {healthNotices.map((notice) => (
              <ConnectorHealthNoticeCard
                key={notice.key}
                notice={notice}
                reconnecting={reconnectingId === notice.key}
                onReconnect={() => reconnectFromNotice(notice)}
                onRetry={() => retryFromNotice(notice)}
                onOpen={() => {
                  dismissHealthNotice(notice.key);
                  openConnector({
                    key: notice.key,
                    routeId: notice.connection.connectorId,
                    name: notice.name,
                    publisher: null,
                    description: '',
                    connection: notice.connection,
                  });
                }}
                onDismiss={() => dismissHealthNotice(notice.key)}
              />
            ))}

            <PressableBox
              onPress={() => setAddCustomVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Add custom MCP connector"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: 'dashed',
                paddingVertical: 12,
                marginBottom: 14,
              }}
            >
              <Link size={16} color={colors.teal} />
              <Text
                style={{ color: colors.textPrimary, fontWeight: '600', fontSize: typeScale.body }}
              >
                Add custom MCP
              </Text>
            </PressableBox>

            {bankLinkOffered ? (
              <PressableBox
                onPress={() => void openBankLinking()}
                accessibilityRole="button"
                accessibilityLabel={BANK_LINK_LABEL}
                accessibilityHint={BANK_LINK_HINT}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginBottom: 14,
                  gap: 4,
                }}
              >
                <Text
                  style={{ color: colors.textPrimary, fontWeight: '600', fontSize: typeScale.body }}
                >
                  {BANK_LINK_LABEL}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    lineHeight: 18,
                  }}
                >
                  {BANK_LINK_HINT}
                </Text>
              </PressableBox>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2, marginBottom: 14 }}
            >
              {filters.map((f) => {
                const active = f === activeFilter;
                return (
                  <PressableBox
                    hitSlop={{ top: 5, bottom: 5 }}
                    key={f}
                    onPress={() => setActiveFilter(f)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${f} connectors`}
                    style={{
                      paddingHorizontal: 14,
                      height: 34,
                      borderRadius: 17,
                      justifyContent: 'center',
                      backgroundColor: active ? colors.textPrimary : colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: active ? colors.textPrimary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? colors.background : colors.textSecondary,
                        fontSize: typeScale.footnote,
                        fontWeight: '600',
                      }}
                    >
                      {f}
                    </Text>
                  </PressableBox>
                );
              })}
            </ScrollView>

            {visibleRows.length === 0 && !listingsPending ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <Link size={28} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: typeScale.subhead }}>
                  {emptyTitle}
                </Text>
                {directoryIndexing && browsesListings ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: typeScale.footnote,
                      textAlign: 'center',
                      paddingHorizontal: 24,
                    }}
                  >
                    {DIRECTORY_INDEXING_NOTE}
                  </Text>
                ) : null}
              </View>
            ) : visibleRows.length > 0 ? (
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                {visibleRows.map((row, idx) => (
                  <View key={row.key}>
                    {idx > 0 && (
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border,
                          marginLeft: ROW_DIVIDER_INSET,
                        }}
                      />
                    )}
                    <ConnectorCard row={row} onPress={() => openConnector(row)} />
                  </View>
                ))}
              </View>
            ) : null}

            {browsesListings && listingsError ? (
              <View
                style={{
                  borderRadius: 12,
                  backgroundColor: colors.dangerSurface,
                  borderWidth: 1,
                  borderColor: colors.dangerBorder,
                  padding: 12,
                  marginTop: 14,
                }}
              >
                <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
                  {listingsError}
                </Text>
                <PressableBox
                  onPress={() => void loadListings(listings.length > 0 ? nextCursor : null)}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading the connector directory"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 6,
                    minHeight: 44,
                  }}
                >
                  <RefreshCw size={14} color={colors.agentError} />
                  <Text
                    style={{
                      color: colors.agentError,
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                    }}
                  >
                    Retry
                  </Text>
                </PressableBox>
              </View>
            ) : browsesListings && listingsLoading ? (
              <View
                accessibilityLabel="Loading connectors"
                style={{ alignItems: 'center', paddingVertical: 24 }}
              >
                <LoadingIndicator />
              </View>
            ) : browsesListings && nextCursor ? (
              <PressableBox
                onPress={() => void loadListings(nextCursor)}
                accessibilityRole="button"
                accessibilityLabel="Show more connectors"
                style={({ pressed }) => ({
                  minHeight: 44,
                  marginTop: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                  }}
                >
                  Show more
                </Text>
              </PressableBox>
            ) : null}

            <View style={{ height: bottomSearchSpace }} />
          </>
        )}

        <AddCustomConnectorModal
          visible={addCustomVisible}
          onClose={() => setAddCustomVisible(false)}
          onAdded={() => {
            setAddCustomVisible(false);
            void load();
          }}
        />
      </SettingsScreenShell>

      {directoryVisible ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <BottomSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search connectors"
            accessibilityLabel="Search connectors"
            clearAccessibilityLabel="Clear connector search"
            testID="connectors-search"
          />
        </View>
      ) : null}
    </View>
  );
}
