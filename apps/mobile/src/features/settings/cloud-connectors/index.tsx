import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  Plug,
  Link,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react-native';
import { toolApprovalPolicyOption } from '@agiworkforce/types';
import { useRouter } from 'expo-router';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { BottomSearchBar, useBottomSearchBarSpace } from '@/src/shared/components/BottomSearchBar';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { toUserMessage } from '@/services/userMessage';
import { AddCustomConnectorModal } from './AddCustomConnectorModal';
import { ConnectorLogo } from './ConnectorLogo';
import { connectionStatus, formatConnectorName } from './connectorStatus';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTierStore } from '@/src/features/billing/store';
import { CapabilityUnavailable, useCapability } from '@/src/lib/capabilities';
import { useAuthStore } from '@/src/features/auth/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  browseConnectorListings,
  connectorListingIconUrl,
  fetchConnectorDirectory,
  linkBankAccountsInApp,
  type ConnectedConnector,
  type ConnectorDirectory,
  type ConnectorListing,
  type ConnectorListingCategory,
} from '@/services/connectors';

const BANK_ACCOUNTS_CONNECTOR_ID = 'bank-accounts';
const BANK_LINK_LABEL = 'Link a bank account';
const BANK_LINK_HINT =
  'Read-only balances and transactions from US banks, linked through Plaid. Nothing can move money.';

const ALL_FILTER = 'All';
const CONNECTED_FILTER = 'Connected';
const CUSTOM_FILTER = 'Custom';
const CUSTOM_CONNECTOR_DESCRIPTION = 'Your encrypted remote MCP endpoint';

interface ConnectorRow {
  key: string;
  routeId: string;
  logoId: string;
  name: string;
  publisher: string | null;
  description: string;
  iconUrl: string | null;
  connection: ConnectedConnector | null;
}

function listingRow(
  listing: ConnectorListing,
  connection: ConnectedConnector | null,
): ConnectorRow {
  return {
    key: connection ? `connection:${connection.id}` : `listing:${listing.id}`,
    routeId: connection?.connectorId ?? listing.id,
    logoId: listing.id,
    name: listing.name,
    publisher: listing.publisher || null,
    description: listing.description,
    iconUrl: connectorListingIconUrl(listing),
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
    logoId: connection.connectorId,
    name: connection.name || formatConnectorName(connection.connectorId),
    publisher: null,
    description: connection.source === 'custom' ? CUSTOM_CONNECTOR_DESCRIPTION : '',
    iconUrl: null,
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
  const detail = statusLabel ?? row.description;

  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}${row.publisher ? `, ${row.publisher}` : ''}. ${statusLabel ?? 'Not connected'}`}
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
            <ConnectorLogo id={row.logoId} name={row.name} iconUrl={row.iconUrl} />
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
        Connect Gmail, GitHub, Notion, Slack, and 80+ services to AGI Cloud. Available with cloud
        access.
      </Text>
    </View>
  );
}

export default function CloudConnectorsScreen({
  backHref = '/(app)/(tabs)/settings',
}: {
  backHref?: string;
} = {}) {
  const colors = useThemeColors();
  const bottomSearchSpace = useBottomSearchBarSpace();
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';
  const connectorsSwitchedOn = useCapability('canUseConnectors');
  const canUseConnectors = useTierStore((s) => s.grantedCapabilities.includes('canUseConnectors'));
  const isTierRefreshing = useTierStore((s) => s.isRefreshing);
  const lastTierRefreshAt = useTierStore((s) => s.lastRefreshedAt);
  const refreshTier = useTierStore((s) => s.refreshTier);
  const toolApprovalPolicy = useSettingsStore((s) => s.toolApprovalPolicy);
  const capabilityRefreshOwnerRef = useRef<string | null>(null);
  const capabilityHandshakePending =
    isClerkSignedIn && isCloudModeActive && (isTierRefreshing || lastTierRefreshAt === null);

  const [directory, setDirectory] = useState<ConnectorDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>(ALL_FILTER);
  const [search, setSearch] = useState('');
  const [listingSearch, setListingSearch] = useState('');
  const [addCustomVisible, setAddCustomVisible] = useState(false);
  const [listings, setListings] = useState<ConnectorListing[]>([]);
  const [knownListings, setKnownListings] = useState<ReadonlyMap<string, ConnectorListing>>(
    () => new Map(),
  );
  const [listingCategories, setListingCategories] = useState<ConnectorListingCategory[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
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
    setActiveFilter(ALL_FILTER);
    setSearch('');
    setListingSearch('');
    setAddCustomVisible(false);
    setListings([]);
    setKnownListings(new Map());
    setListingCategories([]);
    setNextCursor(null);
    setListingsLoading(false);
    setListingsError(null);
  }, [clerkUserId]);

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
    () => listingCategories.find((category) => category === activeFilter) ?? null,
    [activeFilter, listingCategories],
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
        setListingCategories(page.categories);
        setNextCursor(page.nextCursor);
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

  const connections = directory?.connectors ?? null;
  const bankLinkOffered =
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

  const filters = useMemo(
    () => [
      ALL_FILTER,
      CONNECTED_FILTER,
      ...(connections?.some((connector) => connector.source === 'custom') ? [CUSTOM_FILTER] : []),
      ...listingCategories,
    ],
    [connections, listingCategories],
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
    const listedRows = listings.map((listing) => listingRow(listing, connectionFor(listing.id)));
    return activeFilter === ALL_FILTER
      ? [...connectedRows, ...listedRows.filter((row) => row.connection === null)]
      : listedRows;
  }, [activeFilter, connectionFor, connections, knownListings, listings, search]);

  const listingsPending =
    connections === null || (browsesListings && (listingsLoading || listingsError !== null));

  const handleSignIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent('cloud-connectors'));
  }, [router]);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Connectors" backHref={backHref}>
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={handleSignIn} />
      </SettingsScreenShell>
    );
  }

  if (!connectorsSwitchedOn) {
    return (
      <SettingsScreenShell title="Connectors" backHref={backHref}>
        <CapabilityUnavailable label="Connectors" />
      </SettingsScreenShell>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SettingsScreenShell title="Connectors" backHref={backHref}>
        <SettingsInfo
          title="Connect your tools to AGI Cloud"
          body="Open a connector to see what it can do before you connect it. Custom MCP tokens are encrypted and never shown again."
          icon={Plug}
        />

        {FEATURES.connectors && (
          <SettingsGroup>
            <SettingsRow
              label="Action approvals"
              value={toolApprovalPolicyOption(toolApprovalPolicy).shortLabel}
              icon={ShieldCheck}
              onPress={() => router.push('/(app)/settings/auto-approve')}
              isLast
            />
            <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                Choose when AGI asks before a connected tool acts.
              </Text>
            </View>
          </SettingsGroup>
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
            <ActivityIndicator size="large" color={colors.teal} />
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
              <ActivityIndicator size="large" color={colors.teal} />
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
                  No connectors found
                </Text>
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
                <ActivityIndicator color={colors.teal} />
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
