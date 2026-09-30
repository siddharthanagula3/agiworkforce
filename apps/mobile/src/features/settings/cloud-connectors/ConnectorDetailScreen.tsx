import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Globe,
  KeyRound,
  LifeBuoy,
  Link2,
  Plug,
  RotateCcw,
  Shield,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import {
  BANK_ACCOUNTS_CONNECTOR_ID,
  connectorCategoryToolName,
  connectorCredentialsPath,
  isConnectorCategoryToolName,
  type ConnectorToolCategory,
} from '@agiworkforce/cloud-contracts';

import { Text } from '@/components/ui/text';
import { ConnectorCallLog } from './ConnectorCallLog';
import { LinkedBanks } from './LinkedBanks';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  connectConnector,
  connectorListingIconUrl,
  deleteCustomConnector,
  disconnectConnector,
  fetchConnectorCapabilities,
  fetchConnectorDirectory,
  fetchConnectorListing,
  fetchConnectorToolPermissions,
  resetConnectorToolPermission,
  setConnectorToolPermission,
  startConnectorOAuth,
  authorizeConnectorInApp,
  type InAppConnectorAuthorization,
  type ConnectedConnector,
  type ConnectorCapabilityCatalog,
  type ConnectorListing,
  type ConnectorToolPermission,
  type ConnectorToolPermissionLevel,
} from '@/services/connectors';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { CapabilityUnavailable, useCapability } from '@/src/lib/capabilities';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { ConnectorApiKeySheet } from './ConnectorApiKeySheet';
import { connectorFailureMessage } from './connectorFailureMessage';
import { ConnectorLogo } from './ConnectorLogo';
import { connectionStatus, formatConnectorName } from './connectorStatus';

const PERMISSION_OPTIONS: {
  level: ConnectorToolPermissionLevel;
  label: string;
}[] = [
  { level: 'allow', label: 'Allow' },
  { level: 'ask', label: 'Ask' },
  { level: 'deny', label: 'Block' },
];

const SIGN_IN_LABELS: Record<ConnectorListing['authMode'], string> = {
  oauth: 'Account sign-in',
  'api-key': 'API key',
  none: 'Not needed',
  unknown: 'Checked on connect',
};

const CONNECTABLE_NOW: ReadonlySet<ConnectorListing['connectable']> = new Set([
  'connect',
  'api-key-form',
]);

const TOOL_GROUPS: { category: ConnectorToolCategory; title: string; note: string }[] = [
  { category: 'read_only', title: 'Read-only tools', note: 'Set for all read-only tools' },
  { category: 'write', title: 'Write and delete tools', note: 'Set for all write tools' },
];

function unavailableNotice(
  mode: ConnectorListing['connectable'],
  name: string,
): { title: string; body: string } {
  if (mode === 'desktop-and-cli') {
    return {
      title: 'Desktop and CLI',
      body: `${name} runs on your computer, so connect it from AGI Workforce Desktop or the CLI.`,
    };
  }
  if (mode === 'needs-setup') {
    return { title: 'Needs setup', body: `${name} is not set up on this server yet.` };
  }
  return { title: 'Not available yet', body: `${name} cannot be connected yet.` };
}

function listingLinks(
  listing: ConnectorListing,
): { label: string; url: string; icon: LucideIcon }[] {
  return [
    { label: 'Documentation', url: listing.documentationUrl, icon: BookOpen },
    { label: 'Website', url: listing.websiteUrl, icon: Globe },
    { label: 'Support', url: listing.supportUrl, icon: LifeBuoy },
    { label: 'Privacy policy', url: listing.privacyPolicyUrl, icon: Shield },
  ].flatMap((link) => (link.url ? [{ ...link, url: link.url }] : []));
}

function formatAuthType(authType: string): string {
  if (authType === 'github_app') return 'GitHub App';
  if (authType === 'custom_mcp') return 'Remote MCP';
  if (authType === 'oauth') return 'OAuth';
  return authType.replace(/_/g, ' ');
}

function formatConnectedAt(value: string): string {
  if (!value) return 'Connected';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Connected';
  return timestamp.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatToolName(toolName: string): string {
  return toolName.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function SectionHeading({ title, body }: { title: string; body?: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '700' }}>
        {title}
      </Text>
      {body ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typeScale.caption,
            lineHeight: 18,
            marginTop: 5,
          }}
        >
          {body}
        </Text>
      ) : null}
    </View>
  );
}

function PermissionRow({
  toolName,
  title,
  description,
  level,
  note,
  saved,
  saving,
  onChange,
  onReset,
}: {
  toolName: string;
  title: string;
  description?: string | undefined;
  level: ConnectorToolPermissionLevel | null;
  note: string | null;
  saved: boolean;
  saving: boolean;
  onChange: (level: ConnectorToolPermissionLevel) => void;
  onReset: () => void;
}) {
  const colors = useThemeColors();
  const levelLabel =
    PERMISSION_OPTIONS.find((option) => option.level === level)?.label ?? 'Not set';

  return (
    <View
      style={{
        padding: 14,
        gap: 11,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: saving ? 0.65 : 1,
      }}
      accessibilityLabel={`${toolName} permission. ${levelLabel}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '700' }}
          >
            {title}
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{
              color: colors.textMuted,
              fontSize: typeScale.caption,
              marginTop: 3,
              fontFamily: 'monospace',
            }}
          >
            {toolName}
          </Text>
          {description ? (
            <Text
              numberOfLines={2}
              style={{
                color: colors.textSecondary,
                fontSize: typeScale.caption,
                lineHeight: 17,
                marginTop: 5,
              }}
            >
              {description}
            </Text>
          ) : null}
          {note ? (
            <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 5 }}>
              {note}
            </Text>
          ) : null}
        </View>
        {saved ? (
          <Pressable
            disabled={saving}
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel={`Reset ${toolName} to default`}
            hitSlop={8}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <RotateCcw size={16} color={colors.textMuted} />
            )}
          </Pressable>
        ) : saving ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : null}
      </View>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={`Policy for ${toolName}`}
        style={{ flexDirection: 'row', gap: 8 }}
      >
        {PERMISSION_OPTIONS.map((option) => {
          const selected = level === option.level;
          return (
            <Pressable
              key={option.level}
              disabled={saving}
              onPress={() => onChange(option.level)}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label} ${toolName}`}
              accessibilityState={{ checked: selected, disabled: saving }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selected ? colors.accentBorder : colors.border,
                backgroundColor: selected ? colors.accentSurface : colors.neutralSurface,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  color: selected ? colors.textPrimary : colors.textSecondary,
                  fontSize: typeScale.caption,
                  fontWeight: selected ? '700' : '600',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function announceInAppAuthorization(name: string, outcome: InAppConnectorAuthorization): void {
  if (outcome === 'connected' || outcome === 'dismissed') return;
  if (outcome === 'denied') {
    Alert.alert(
      `${name} was not connected`,
      'The authorization was declined. Nothing was connected.',
    );
    return;
  }
  Alert.alert(
    `Could not connect ${name}`,
    'The authorization did not finish. Nothing was connected. Try again in a moment.',
  );
}

export default function ConnectorDetailScreen({ connectorId }: { connectorId: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const connectorsSwitchedOn = useCapability('canUseConnectors');
  const [connection, setConnection] = useState<ConnectedConnector | null>(null);
  const [listing, setListing] = useState<ConnectorListing | null>(null);
  const [permissions, setPermissions] = useState<ConnectorToolPermission[] | null>(null);
  const [catalog, setCatalog] = useState<ConnectorCapabilityCatalog | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsFailed, setToolsFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTool, setSavingTool] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [credentialsPath, setCredentialsPath] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const toolsRequestRef = useRef(0);

  const validConnectorId = connectorId.length > 0 && connectorId.length <= 200 ? connectorId : null;
  const isCloudModeActive = appMode === 'cloud';
  const accountEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? 'AGI Cloud account';
  const connectorName =
    connection?.name || listing?.name || formatConnectorName(validConnectorId ?? connectorId);
  const status = connection ? connectionStatus(connection) : null;
  const keyCredentialsPath =
    connection?.source === 'custom' && connection.directoryId && listing?.authMode === 'api-key'
      ? connectorCredentialsPath(connection.directoryId)
      : null;
  const permissionConnectorId = connection
    ? (catalog?.connectorId ?? connection.toolConnectorId ?? connection.connectorId)
    : null;

  const isActionCurrent = useCallback((account: CloudAccountEpoch | null) => {
    return (
      isCloudAccountEpochCurrent(account) && useChatAppModeStore.getState().appMode === 'cloud'
    );
  }, []);

  const loadTools = useCallback(
    async (target: ConnectedConnector) => {
      const account = captureCloudAccountEpoch();
      if (!account || !isActionCurrent(account)) return;
      toolsRequestRef.current += 1;
      const request = toolsRequestRef.current;
      setToolsLoading(true);
      setToolsFailed(false);
      const [catalogResult, permissionsResult] = await Promise.allSettled([
        fetchConnectorCapabilities(target.connectorId),
        fetchConnectorToolPermissions(),
      ]);
      if (request !== toolsRequestRef.current || !isActionCurrent(account)) return;
      setCatalog(catalogResult.status === 'fulfilled' ? catalogResult.value : null);
      setPermissions(permissionsResult.status === 'fulfilled' ? permissionsResult.value : null);
      setToolsFailed(
        catalogResult.status === 'rejected' || permissionsResult.status === 'rejected',
      );
      setToolsLoading(false);
    },
    [isActionCurrent],
  );

  const load = useCallback(async (): Promise<{ connection: ConnectedConnector | null } | null> => {
    if (!validConnectorId) {
      setLoaded(true);
      setConnection(null);
      setListing(null);
      setError('This connector link is invalid.');
      return null;
    }
    const account = captureCloudAccountEpoch();
    if (!account || !isActionCurrent(account)) return null;
    setLoading(true);
    setError(null);
    try {
      const [directoryResult, listingResult] = await Promise.allSettled([
        fetchConnectorDirectory(),
        fetchConnectorListing(validConnectorId),
      ]);
      if (!isActionCurrent(account)) return null;
      if (directoryResult.status === 'rejected') throw directoryResult.reason;
      const nextConnection =
        directoryResult.value.connectors.find((item) => item.connectorId === validConnectorId) ??
        null;
      if (!nextConnection && listingResult.status === 'rejected') throw listingResult.reason;
      setConnection(nextConnection);
      setListing(listingResult.status === 'fulfilled' ? listingResult.value : null);
      setLoaded(true);
      if (nextConnection) {
        void loadTools(nextConnection);
      } else {
        toolsRequestRef.current += 1;
        setCatalog(null);
        setPermissions(null);
        setToolsLoading(false);
        setToolsFailed(false);
      }
      return { connection: nextConnection };
    } catch {
      if (!isActionCurrent(account)) return null;
      setError('Could not load this connector. Retry.');
      setLoaded(true);
      return null;
    } finally {
      if (isActionCurrent(account)) setLoading(false);
    }
  }, [isActionCurrent, loadTools, validConnectorId]);

  useEffect(() => {
    toolsRequestRef.current += 1;
    setConnection(null);
    setListing(null);
    setPermissions(null);
    setCatalog(null);
    setToolsLoading(false);
    setToolsFailed(false);
    setLoaded(false);
    setError(null);
    setSavingTool(null);
    setConnecting(false);
    setCredentialsPath(null);
    setDisconnecting(false);
    setReconnecting(false);
    if (FEATURES.connectors && isClerkSignedIn && isCloudModeActive) {
      void load();
    }
  }, [clerkUserId, isClerkSignedIn, isCloudModeActive, load, validConnectorId]);

  const savedLevels = useMemo(() => {
    const levels = new Map<string, ConnectorToolPermissionLevel>();
    for (const permission of permissions ?? []) {
      if (permission.connectorId === permissionConnectorId) {
        levels.set(permission.toolName, permission.level);
      }
    }
    return levels;
  }, [permissionConnectorId, permissions]);

  const toolGroups = useMemo(() => {
    if (!catalog) return [];
    return TOOL_GROUPS.map((group) => ({
      ...group,
      level: savedLevels.get(connectorCategoryToolName(group.category)) ?? null,
      tools: catalog.tools
        .filter((tool) => tool.readOnly === (group.category === 'read_only'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.tools.length > 0);
  }, [catalog, savedLevels]);

  const savedToolNames = useMemo(
    () =>
      [...savedLevels.keys()]
        .filter((toolName) => !isConnectorCategoryToolName(toolName))
        .sort((a, b) => a.localeCompare(b)),
    [savedLevels],
  );

  const updatePermission = useCallback(
    async (targetConnectorId: string, toolName: string, level: ConnectorToolPermissionLevel) => {
      if (savedLevels.get(toolName) === level) return;
      const account = captureCloudAccountEpoch();
      if (!account || !isActionCurrent(account)) return;
      setSavingTool(toolName);
      try {
        await setConnectorToolPermission(targetConnectorId, toolName, level);
        if (!isActionCurrent(account)) return;
        setPermissions((current) => [
          ...(current ?? []).filter(
            (item) => !(item.connectorId === targetConnectorId && item.toolName === toolName),
          ),
          { connectorId: targetConnectorId, toolName, level },
        ]);
      } catch {
        if (isActionCurrent(account)) {
          Alert.alert('Could not update permission', 'The saved tool policy was not changed.');
        }
      } finally {
        if (isActionCurrent(account)) setSavingTool(null);
      }
    },
    [isActionCurrent, savedLevels],
  );

  const resetPermission = useCallback(
    async (targetConnectorId: string, toolName: string) => {
      const account = captureCloudAccountEpoch();
      if (!account || !isActionCurrent(account)) return;
      setSavingTool(toolName);
      try {
        await resetConnectorToolPermission(targetConnectorId, toolName);
        if (!isActionCurrent(account)) return;
        setPermissions((current) =>
          (current ?? []).filter(
            (item) => !(item.connectorId === targetConnectorId && item.toolName === toolName),
          ),
        );
      } catch {
        if (isActionCurrent(account)) {
          Alert.alert('Could not reset permission', 'The saved tool policy was not changed.');
        }
      } finally {
        if (isActionCurrent(account)) setSavingTool(null);
      }
    },
    [isActionCurrent],
  );

  const connect = useCallback(() => {
    if (!validConnectorId || connecting) return;
    const account = captureCloudAccountEpoch();
    if (!account || !isActionCurrent(account)) return;
    const targetConnectorId = validConnectorId;
    const name = connectorName;
    setConnecting(true);
    void (async () => {
      try {
        const result = await connectConnector(targetConnectorId);
        if (!isActionCurrent(account)) return;
        if (result.kind === 'connected') {
          await load();
          return;
        }
        if (result.kind === 'credentials-required') {
          setCredentialsPath(result.credentialsPath);
          return;
        }
        if (result.appReturn) {
          const outcome = await authorizeConnectorInApp(result.authorizeUrl);
          if (!isActionCurrent(account)) return;
          const refreshed = await load();
          if (!isActionCurrent(account) || refreshed?.connection) return;
          announceInAppAuthorization(name, outcome);
          return;
        }
        const opened = await openUntrustedUrlInAppBrowser(result.authorizeUrl);
        if (!isActionCurrent(account)) return;
        if (!opened) {
          Alert.alert(
            `Could not open ${name} authorization`,
            'No browser was available to complete the authorization. Nothing was connected.',
          );
          return;
        }
        const refreshed = await load();
        if (!isActionCurrent(account) || !refreshed || refreshed.connection) return;
        Alert.alert(
          `${name} is not connected yet`,
          'The authorization was not completed. If the browser asked you to sign in to AGI Cloud, finish signing in there and try again.',
        );
      } catch (connectError) {
        if (!isActionCurrent(account)) return;
        Alert.alert(`Could not connect ${name}`, connectorFailureMessage(connectError, 'connect'));
      } finally {
        if (isActionCurrent(account)) setConnecting(false);
      }
    })();
  }, [connecting, connectorName, isActionCurrent, load, validConnectorId]);

  const handleKeySaved = useCallback(() => {
    setCredentialsPath(null);
    void load();
  }, [load]);

  const openLink = useCallback(async (url: string) => {
    const opened = await openUntrustedUrlInAppBrowser(url);
    if (!opened) {
      Alert.alert('Could not open this page', 'No browser was available to open the link.');
    }
  }, []);

  const reconnect = useCallback(() => {
    if (!connection || connection.source !== 'oauth' || reconnecting) return;
    const account = captureCloudAccountEpoch();
    if (!account || !isActionCurrent(account)) return;
    const targetConnectorId = connection.connectorId;
    setReconnecting(true);
    void (async () => {
      try {
        const start = await startConnectorOAuth(targetConnectorId);
        if (!isActionCurrent(account)) return;
        if (start.appReturn) {
          const outcome = await authorizeConnectorInApp(start.authorizeUrl);
          if (!isActionCurrent(account)) return;
          await load();
          if (!isActionCurrent(account) || outcome === 'invalid_state') return;
          announceInAppAuthorization(connectorName, outcome);
          return;
        }
        const opened = await openUntrustedUrlInAppBrowser(start.authorizeUrl);
        if (!isActionCurrent(account)) return;
        if (!opened) {
          Alert.alert(
            'Could not open authorization',
            'No browser was available to complete the authorization. Nothing changed.',
          );
          return;
        }
        await load();
      } catch (reconnectError) {
        if (!isActionCurrent(account)) return;
        Alert.alert(
          'Could not reauthorize',
          connectorFailureMessage(reconnectError, 'reauthorize'),
        );
      } finally {
        if (isActionCurrent(account)) setReconnecting(false);
      }
    })();
  }, [connection, connectorName, isActionCurrent, load, reconnecting]);

  const disconnect = useCallback(() => {
    if (!connection || disconnecting) return;
    const account = captureCloudAccountEpoch();
    if (!account || !isActionCurrent(account)) return;
    Alert.alert(
      `Disconnect ${connectorName}?`,
      'This removes the connection and its saved tool permissions from your AGI Cloud account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            if (!isActionCurrent(account)) return;
            setDisconnecting(true);
            const operation =
              connection.source === 'custom'
                ? deleteCustomConnector(connection.id)
                : disconnectConnector(connection.connectorId);
            operation
              .then(() => {
                if (!isActionCurrent(account)) return;
                router.replace('/(app)/connectors' as Parameters<typeof router.replace>[0]);
              })
              .catch(() => {
                if (isActionCurrent(account)) {
                  Alert.alert('Could not disconnect', 'The connector is still connected.');
                }
              })
              .finally(() => {
                if (isActionCurrent(account)) setDisconnecting(false);
              });
          },
        },
      ],
    );
  }, [connection, connectorName, disconnecting, isActionCurrent, router]);

  const signIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent('cloud-connectors'));
  }, [router]);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Connector" backHref="/(app)/connectors">
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={signIn} />
      </SettingsScreenShell>
    );
  }

  if (!connectorsSwitchedOn) {
    return (
      <SettingsScreenShell title="Connector" backHref="/(app)/connectors">
        <CapabilityUnavailable label="Connectors" />
      </SettingsScreenShell>
    );
  }

  const links = listing ? listingLinks(listing) : [];
  const linksGroup =
    links.length > 0 ? (
      <SettingsGroup>
        {links.map((link, index) => (
          <SettingsRow
            key={link.label}
            label={link.label}
            icon={link.icon}
            onPress={() => void openLink(link.url)}
            isLast={index === links.length - 1}
          />
        ))}
      </SettingsGroup>
    ) : null;

  return (
    <SettingsScreenShell title={connectorName || 'Connector'} backHref="/(app)/connectors">
      {!FEATURES.connectors ? (
        <SettingsInfo
          title="Connectors are unavailable"
          body="This build does not include the Managed Cloud connector capability."
          icon={Plug}
        />
      ) : !isCloudModeActive ? (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      ) : loading && !loaded ? (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 36 }}>
          <ActivityIndicator size="large" color={colors.teal} />
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
            Loading connector…
          </Text>
        </View>
      ) : error ? (
        <View
          style={{
            borderRadius: cardRadius,
            padding: 16,
            gap: 12,
            backgroundColor: colors.dangerSurface,
            borderWidth: 1,
            borderColor: colors.dangerBorder,
          }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '700' }}
          >
            Could not load connector
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading connector"
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.footnote, fontWeight: '700' }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : loaded && !connection && !listing ? (
        <SettingsInfo
          title="Connector not found"
          body="This connection may have been removed on another device. Return to Connectors to refresh the directory."
          icon={Link2}
        />
      ) : connection ? (
        <>
          <SettingsInfo
            title="Connected to AGI Cloud"
            body="Review this connection and choose how each of its tools runs."
            icon={ShieldCheck}
          />

          {status === 'not-responding' ? (
            <View
              style={{
                borderRadius: cardRadius,
                padding: 14,
                gap: 6,
                marginBottom: 18,
                backgroundColor: colors.warningSurface,
                borderWidth: 1,
                borderColor: colors.warningBorder,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color={colors.agentWarning} />
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.subhead,
                    fontWeight: '700',
                  }}
                >
                  Not responding
                </Text>
              </View>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
              >
                {connectorName} has not answered its recent requests, so its tools may fail. If this
                continues, reconnect it.
              </Text>
              <Pressable
                disabled={loading}
                onPress={() => void load()}
                accessibilityRole="button"
                accessibilityLabel={`Check ${connectorName} again`}
                accessibilityState={{ disabled: loading }}
                style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
              >
                <Text
                  style={{ color: colors.teal, fontSize: typeScale.footnote, fontWeight: '700' }}
                >
                  {loading ? 'Checking…' : 'Check again'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {status === 'needs-reauthorization' && connection.source !== 'oauth' ? (
            <View
              style={{
                borderRadius: cardRadius,
                padding: 14,
                gap: 6,
                marginBottom: 18,
                backgroundColor: colors.dangerSurface,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '700',
                }}
              >
                Needs to be reconnected
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
              >
                {keyCredentialsPath
                  ? `${connectorName} tools will not run until it has a working key. Replace its API key below.`
                  : `${connectorName} tools will not run until it is connected again. Disconnect it here, then add it again.`}
              </Text>
            </View>
          ) : null}

          <SettingsGroup>
            <SettingsRow label="Account" value={accountEmail} icon={UserRound} />
            {listing?.publisher ? (
              <SettingsRow label="Publisher" value={listing.publisher} icon={Building2} />
            ) : null}
            <SettingsRow
              label="Connection method"
              value={formatAuthType(connection.authType)}
              icon={KeyRound}
            />
            <SettingsRow
              label="Connected"
              value={formatConnectedAt(connection.connectedAt)}
              icon={Link2}
              isLast={!(connection.scopes && connection.scopes.length > 0)}
            />
            {connection.scopes && connection.scopes.length > 0 ? (
              <SettingsRow
                label="Granted access"
                value={connection.scopes.join(', ')}
                icon={ShieldCheck}
                isLast
              />
            ) : null}
          </SettingsGroup>

          {connection.source === 'oauth' ? (
            <View style={{ marginBottom: 18, gap: 10 }}>
              {status === 'needs-reauthorization' ? (
                <View
                  style={{
                    borderRadius: cardRadius,
                    padding: 14,
                    gap: 6,
                    backgroundColor: colors.dangerSurface,
                    borderWidth: 1,
                    borderColor: colors.dangerBorder,
                  }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.subhead,
                      fontWeight: '700',
                    }}
                  >
                    Authorization expired
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.footnote,
                      lineHeight: 18,
                    }}
                  >
                    This grant can no longer be renewed, so {connectorName} tools will not run until
                    you authorize it again.
                  </Text>
                </View>
              ) : null}
              <Pressable
                disabled={reconnecting}
                onPress={reconnect}
                accessibilityRole="button"
                accessibilityLabel={`Reauthorize ${connectorName}`}
                accessibilityState={{ disabled: reconnecting }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: colors.neutralSurface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed || reconnecting ? 0.7 : 1,
                })}
              >
                {reconnecting ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : (
                  <RotateCcw size={17} color={colors.teal} />
                )}
                <Text
                  style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '700' }}
                >
                  {reconnecting ? 'Opening authorization…' : 'Reauthorize'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {keyCredentialsPath ? (
            <Pressable
              onPress={() => setCredentialsPath(keyCredentialsPath)}
              accessibilityRole="button"
              accessibilityLabel={`Replace the ${connectorName} API key`}
              style={({ pressed }) => ({
                minHeight: 48,
                marginBottom: 18,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                backgroundColor: colors.neutralSurface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <KeyRound size={17} color={colors.teal} />
              <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '700' }}>
                Replace API key
              </Text>
            </Pressable>
          ) : null}

          <SectionHeading
            title="Tool permissions"
            body="Choose how each tool runs. Tools you leave unset follow your Action approvals setting."
          />

          {toolsLoading ? (
            <View
              accessibilityLabel="Loading tools"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}
            >
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                Loading tools…
              </Text>
            </View>
          ) : null}

          {!toolsLoading && toolsFailed ? (
            <View
              style={{
                borderRadius: cardRadius,
                padding: 14,
                gap: 6,
                marginBottom: 18,
                backgroundColor: colors.dangerSurface,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '700',
                }}
              >
                Could not load the tool list
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
              >
                The tools for {connectorName} did not load. Try again.
              </Text>
              <Pressable
                onPress={() => void loadTools(connection)}
                accessibilityRole="button"
                accessibilityLabel="Retry loading tools"
                style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
              >
                <Text
                  style={{ color: colors.teal, fontSize: typeScale.footnote, fontWeight: '700' }}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!toolsLoading && permissionConnectorId && permissions && catalog
            ? toolGroups.map((group) => (
                <View key={group.category}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.footnote,
                      fontWeight: '700',
                      marginBottom: 8,
                    }}
                  >
                    {group.title}
                  </Text>
                  <SettingsGroup>
                    {group.tools.map((tool) => {
                      const savedLevel = savedLevels.get(tool.name) ?? null;
                      return (
                        <PermissionRow
                          key={tool.name}
                          toolName={tool.name}
                          title={tool.title ?? formatToolName(tool.name)}
                          description={tool.description}
                          level={savedLevel ?? group.level}
                          note={savedLevel ? null : group.level ? group.note : 'Not set'}
                          saved={savedLevel !== null}
                          saving={savingTool === tool.name}
                          onChange={(level) =>
                            void updatePermission(permissionConnectorId, tool.name, level)
                          }
                          onReset={() => void resetPermission(permissionConnectorId, tool.name)}
                        />
                      );
                    })}
                  </SettingsGroup>
                </View>
              ))
            : null}

          {!toolsLoading && catalog && catalog.tools.length === 0 ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: typeScale.footnote,
                lineHeight: 19,
                marginBottom: 24,
              }}
            >
              {connectorName} does not list any tools yet.
            </Text>
          ) : null}

          {!toolsLoading &&
          !catalog &&
          permissionConnectorId &&
          permissions &&
          savedToolNames.length > 0 ? (
            <SettingsGroup>
              {savedToolNames.map((toolName) => (
                <PermissionRow
                  key={toolName}
                  toolName={toolName}
                  title={formatToolName(toolName)}
                  level={savedLevels.get(toolName) ?? null}
                  note={null}
                  saved
                  saving={savingTool === toolName}
                  onChange={(level) =>
                    void updatePermission(permissionConnectorId, toolName, level)
                  }
                  onReset={() => void resetPermission(permissionConnectorId, toolName)}
                />
              ))}
            </SettingsGroup>
          ) : null}

          {connection.connectorId === BANK_ACCOUNTS_CONNECTOR_ID ? (
            <LinkedBanks onChanged={() => void load()} />
          ) : null}

          {permissionConnectorId ? <ConnectorCallLog connectorId={permissionConnectorId} /> : null}

          {linksGroup}

          <Pressable
            disabled={disconnecting}
            onPress={disconnect}
            accessibilityRole="button"
            accessibilityLabel={`Disconnect ${connectorName}`}
            accessibilityState={{ disabled: disconnecting }}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              backgroundColor: colors.dangerSurface,
              borderWidth: 1,
              borderColor: colors.dangerBorder,
              opacity: pressed || disconnecting ? 0.7 : 1,
            })}
          >
            {disconnecting ? (
              <ActivityIndicator size="small" color={colors.agentError} />
            ) : (
              <Trash2 size={17} color={colors.agentError} />
            )}
            <Text
              style={{ color: colors.agentError, fontSize: typeScale.subhead, fontWeight: '700' }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Text>
          </Pressable>
        </>
      ) : listing ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <ConnectorLogo
              id={listing.id}
              name={listing.name}
              iconUrl={connectorListingIconUrl(listing)}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.headline,
                  fontWeight: '700',
                }}
              >
                {listing.name}
              </Text>
              {listing.publisher ? (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    marginTop: 2,
                  }}
                >
                  By {listing.publisher}
                </Text>
              ) : null}
            </View>
          </View>

          {listing.description ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: typeScale.subhead,
                lineHeight: 20,
                marginBottom: 18,
              }}
            >
              {listing.description}
            </Text>
          ) : null}

          {CONNECTABLE_NOW.has(listing.connectable) ? (
            <Pressable
              disabled={connecting}
              onPress={connect}
              accessibilityRole="button"
              accessibilityLabel={`Connect ${listing.name}`}
              accessibilityState={{ disabled: connecting }}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                marginBottom: 24,
                backgroundColor: colors.teal,
                opacity: pressed || connecting ? 0.8 : 1,
              })}
            >
              {connecting ? <ActivityIndicator size="small" color={colors.accentText} /> : null}
              <Text
                style={{ color: colors.accentText, fontSize: typeScale.body, fontWeight: '700' }}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </Text>
            </Pressable>
          ) : (
            <SettingsInfo {...unavailableNotice(listing.connectable, listing.name)} icon={Plug} />
          )}

          <SettingsGroup>
            <SettingsRow
              label="Sign-in"
              value={SIGN_IN_LABELS[listing.authMode]}
              icon={KeyRound}
              isLast
            />
          </SettingsGroup>

          <SectionHeading
            title="What it can do"
            body={
              listing.toolNames.length > 0
                ? undefined
                : `${listing.name} lists its tools once it is connected.`
            }
          />
          {listing.toolNames.length > 0 ? (
            <SettingsGroup>
              {listing.toolNames.map((toolName, index) => (
                <View
                  key={toolName}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: index === listing.toolNames.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>
                    {formatToolName(toolName)}
                  </Text>
                </View>
              ))}
            </SettingsGroup>
          ) : null}

          {linksGroup}
        </>
      ) : null}

      <ConnectorApiKeySheet
        credentialsPath={credentialsPath}
        connectorName={connectorName}
        onClose={() => setCredentialsPath(null)}
        onConnected={handleKeySaved}
      />
    </SettingsScreenShell>
  );
}
