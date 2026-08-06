import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import {
  KeyRound,
  Link2,
  Plug,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  deleteCustomConnector,
  disconnectConnector,
  fetchConnectorDirectory,
  fetchConnectorToolPermissions,
  resetConnectorToolPermission,
  setConnectorToolPermission,
  startConnectorOAuth,
  type ConnectedConnector,
  type ConnectorToolPermission,
  type ConnectorToolPermissionLevel,
} from '@/services/connectors';
// Provider-hosted consent screen — third-party host, so the untrusted-URL
// in-app browser helper (scheme allowlist + system-browser fallback), matching
// the directory's connect flow.
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { cardRadius, useThemeColors } from '@/src/ui/theme';

const PERMISSION_OPTIONS: {
  level: ConnectorToolPermissionLevel;
  label: string;
}[] = [
  { level: 'allow', label: 'Allow' },
  { level: 'ask', label: 'Ask' },
  { level: 'deny', label: 'Block' },
];

function formatConnectorName(connectorId: string): string {
  if (connectorId === 'github') return 'GitHub';
  return connectorId
    .replace(/^custom-/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function PermissionRow({
  permission,
  saving,
  onChange,
  onReset,
}: {
  permission: ConnectorToolPermission;
  saving: boolean;
  onChange: (level: ConnectorToolPermissionLevel) => void;
  onReset: () => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        padding: 14,
        gap: 11,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: saving ? 0.65 : 1,
      }}
      accessibilityLabel={`${permission.toolName} permission. ${permission.level}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
            {formatToolName(permission.toolName)}
          </Text>
          <Text
            selectable
            numberOfLines={1}
            style={{
              color: colors.textMuted,
              fontSize: 11,
              marginTop: 3,
              fontFamily: 'monospace',
            }}
          >
            {permission.toolName}
          </Text>
        </View>
        <Pressable
          disabled={saving}
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel={`Reset ${permission.toolName} to default`}
          hitSlop={8}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <RotateCcw size={16} color={colors.textMuted} />
          )}
        </Pressable>
      </View>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={`Policy for ${permission.toolName}`}
        style={{ flexDirection: 'row', gap: 8 }}
      >
        {PERMISSION_OPTIONS.map((option) => {
          const selected = permission.level === option.level;
          return (
            <Pressable
              key={option.level}
              disabled={saving}
              onPress={() => onChange(option.level)}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label} ${permission.toolName}`}
              accessibilityState={{ checked: selected, disabled: saving }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 36,
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
                  fontSize: 12,
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

export default function ConnectorDetailScreen({ connectorId }: { connectorId: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const [connection, setConnection] = useState<ConnectedConnector | null>(null);
  const [permissions, setPermissions] = useState<ConnectorToolPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingTool, setSavingTool] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const validConnectorId = connectorId.length > 0 && connectorId.length <= 200 ? connectorId : null;
  const isCloudModeActive = appMode === 'cloud';
  const accountEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? 'AGI Cloud account';
  const connectorName = connection?.name || formatConnectorName(validConnectorId ?? connectorId);

  const isActionCurrent = useCallback((account: CloudAccountEpoch | null) => {
    return (
      isCloudAccountEpochCurrent(account) && useChatAppModeStore.getState().appMode === 'cloud'
    );
  }, []);

  const load = useCallback(async () => {
    if (!validConnectorId) {
      setLoaded(true);
      setConnection(null);
      setPermissions([]);
      setError('This connector link is invalid.');
      return;
    }
    const account = captureCloudAccountEpoch();
    if (!account || !isActionCurrent(account)) return;
    setLoading(true);
    setError(null);
    try {
      const [directory, savedPermissions] = await Promise.all([
        fetchConnectorDirectory(),
        fetchConnectorToolPermissions(),
      ]);
      if (!isActionCurrent(account)) return;
      setConnection(
        directory.connectors.find((item) => item.connectorId === validConnectorId) ?? null,
      );
      setPermissions(
        savedPermissions.filter((permission) => permission.connectorId === validConnectorId),
      );
      setLoaded(true);
    } catch (loadError) {
      if (!isActionCurrent(account)) return;
      setError(loadError instanceof Error ? loadError.message : 'Could not load this connector.');
      setLoaded(true);
    } finally {
      if (isActionCurrent(account)) setLoading(false);
    }
  }, [isActionCurrent, validConnectorId]);

  useEffect(() => {
    setConnection(null);
    setPermissions([]);
    setLoaded(false);
    setError(null);
    setSavingTool(null);
    setDisconnecting(false);
    setReconnecting(false);
    if (FEATURES.connectors && isClerkSignedIn && isCloudModeActive) {
      void load();
    }
  }, [clerkUserId, isClerkSignedIn, isCloudModeActive, load, validConnectorId]);

  const updatePermission = useCallback(
    async (permission: ConnectorToolPermission, level: ConnectorToolPermissionLevel) => {
      if (permission.level === level) return;
      const account = captureCloudAccountEpoch();
      if (!account || !isActionCurrent(account)) return;
      setSavingTool(permission.toolName);
      try {
        await setConnectorToolPermission(permission.connectorId, permission.toolName, level);
        if (!isActionCurrent(account)) return;
        setPermissions((current) =>
          current.map((item) =>
            item.toolName === permission.toolName ? { ...item, level } : item,
          ),
        );
      } catch {
        if (isActionCurrent(account)) {
          Alert.alert('Could not update permission', 'The saved tool policy was not changed.');
        }
      } finally {
        if (isActionCurrent(account)) setSavingTool(null);
      }
    },
    [isActionCurrent],
  );

  const resetPermission = useCallback(
    async (permission: ConnectorToolPermission) => {
      const account = captureCloudAccountEpoch();
      if (!account || !isActionCurrent(account)) return;
      setSavingTool(permission.toolName);
      try {
        await resetConnectorToolPermission(permission.connectorId, permission.toolName);
        if (!isActionCurrent(account)) return;
        setPermissions((current) =>
          current.filter((item) => item.toolName !== permission.toolName),
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

  /**
   * Re-run the hosted authorization-code flow for an OAuth grant.
   *
   * Only the server can turn a completed consent into a grant, so this never
   * reports success on its own: it opens the provider's consent screen, and
   * when the browser sheet closes it re-reads `/api/connectors`. If the grant
   * still reports `needsReauthorization`, the banner below simply stays up.
   */
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
          reconnectError instanceof Error
            ? reconnectError.message
            : 'The connector was not reauthorized.',
        );
      } finally {
        if (isActionCurrent(account)) setReconnecting(false);
      }
    })();
  }, [connection, isActionCurrent, load, reconnecting]);

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

  const sortedPermissions = useMemo(
    () => [...permissions].sort((a, b) => a.toolName.localeCompare(b.toolName)),
    [permissions],
  );

  const signIn = useCallback(() => {
    router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Connector" backHref="/(app)/connectors">
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={signIn} />
      </SettingsScreenShell>
    );
  }

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
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Loading connector…</Text>
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
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
            Could not load connector
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading connector"
          >
            <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '700' }}>Try again</Text>
          </Pressable>
        </View>
      ) : loaded && !connection ? (
        <SettingsInfo
          title="Connector not found"
          body="This connection may have been removed on another device. Return to Connectors to refresh the directory."
          icon={Link2}
        />
      ) : connection ? (
        <>
          <SettingsInfo
            title="Connected to AGI Cloud"
            body="Review real connection metadata and saved policies for tools this account has encountered."
            icon={ShieldCheck}
          />

          <SettingsGroup>
            <SettingsRow label="Account" value={accountEmail} icon={UserRound} />
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
              // The scopes the provider actually granted, straight from the
              // grant row — not the scopes the deployment asked for.
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
              {connection.needsReauthorization ? (
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
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                    Authorization expired
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
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
                <Text style={{ color: colors.teal, fontSize: 14, fontWeight: '700' }}>
                  {reconnecting ? 'Opening authorization…' : 'Reauthorize'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
              Tool permissions
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                lineHeight: 18,
                marginTop: 5,
              }}
            >
              Only policies saved from real approval cards appear here. Tools not listed continue
              through the default approval flow.
            </Text>
          </View>

          <SettingsGroup>
            {sortedPermissions.length > 0 ? (
              sortedPermissions.map((permission) => (
                <PermissionRow
                  key={permission.toolName}
                  permission={permission}
                  saving={savingTool === permission.toolName}
                  onChange={(level) => void updatePermission(permission, level)}
                  onReset={() => void resetPermission(permission)}
                />
              ))
            ) : (
              <View style={{ padding: 16, gap: 5 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                  No saved tool policies
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  When a connector tool asks for approval, a saved Allow, Ask, or Block decision
                  will appear here.
                </Text>
              </View>
            )}
          </SettingsGroup>

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
            <Text style={{ color: colors.agentError, fontSize: 14, fontWeight: '700' }}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Text>
          </Pressable>
        </>
      ) : null}
    </SettingsScreenShell>
  );
}
