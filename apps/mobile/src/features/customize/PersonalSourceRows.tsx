import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CalendarDays, CheckCircle, ChevronDown, ChevronRight, Mail } from 'lucide-react-native';
import type { ConnectorPersonalSource } from '@agiworkforce/cloud-contracts';

import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  browsePersonalSourceListings,
  fetchConnectorDirectory,
  type ConnectedConnector,
  type ConnectorListing,
} from '@/services/connectors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { getCalendarPermissionStatus } from '@/src/features/integrations/services/deviceIntegrations';
import { useCapability } from '@/src/lib/Capabilities';
import { ErrorBanner, LoadingRows, MetaText } from '@/src/shared/components/cloud-screen';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

import {
  buildPersonalSourceRow,
  personalSourceOptionLabel,
  type PersonalSourceOption,
  type PersonalSourceRowModel,
} from './personalSources';

const SOURCES: readonly ConnectorPersonalSource[] = ['email', 'calendar'];
const DEVICE_INTEGRATIONS_ROUTE = '/(app)/settings/integrations';
const LOAD_FAILED = 'Could not load your email and calendar sources.';

const ICONS = { email: Mail, calendar: CalendarDays } as const;

interface LoadedSources {
  listings: ConnectorListing[];
  connections: ConnectedConnector[];
  deviceCalendarGranted: boolean;
}

function usePersonalSourceData(enabled: boolean) {
  const [data, setData] = useState<LoadedSources | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    requestRef.current += 1;
    const request = requestRef.current;
    const isCurrent = () => request === requestRef.current && isCloudAccountEpochCurrent(account);
    setLoading(true);
    setFailed(false);
    try {
      const [directory, emailListings, calendarListings, deviceStatus] = await Promise.all([
        fetchConnectorDirectory(),
        browsePersonalSourceListings('email'),
        browsePersonalSourceListings('calendar'),
        getCalendarPermissionStatus().catch(() => 'undetermined' as const),
      ]);
      if (!isCurrent()) return;
      setData({
        listings: [...emailListings, ...calendarListings],
        connections: directory.connectors,
        deviceCalendarGranted: deviceStatus === 'granted',
      });
    } catch {
      if (!isCurrent()) return;
      setFailed(true);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) return;
    requestRef.current += 1;
    setData(null);
    setFailed(false);
    setLoading(false);
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (enabled) void load();
    }, [enabled, load]),
  );

  return { data, failed, loading, retry: load };
}

function SourceRow({
  row,
  expanded,
  onPress,
}: {
  row: PersonalSourceRowModel;
  expanded: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Icon = ICONS[row.source];
  const single = row.options.length === 1;
  const statusText = row.connected ? 'Connected' : 'Connect';
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole={single ? 'link' : 'button'}
      accessibilityLabel={`${row.title}. ${statusText}`}
      accessibilityState={single ? undefined : { expanded }}
      style={{
        minHeight: 64,
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon size={20} color={colors.textPrimary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {row.title}
        </Text>
        <MetaText>{statusText}</MetaText>
      </View>
      {row.connected ? <CheckCircle size={18} color={colors.agentSuccess} /> : null}
      {single || !expanded ? (
        <ChevronRight size={18} color={colors.textMuted} />
      ) : (
        <ChevronDown size={18} color={colors.textMuted} />
      )}
    </PressableBox>
  );
}

function OptionRow({
  option,
  title,
  onPress,
}: {
  option: PersonalSourceOption;
  title: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const label = personalSourceOptionLabel(option.state);
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${title}: ${option.name}. ${label}`}
      style={{
        minHeight: 48,
        marginLeft: 32,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>{option.name}</Text>
        <MetaText>{label}</MetaText>
      </View>
      <ChevronRight size={17} color={colors.textMuted} />
    </PressableBox>
  );
}

export function PersonalSourceRows() {
  const router = useRouter();
  const isCloudMode = useChatAppModeStore((s) => s.appMode === 'cloud');
  const isSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const connectorsAllowed = useCapability('canUseConnectors');
  const enabled = FEATURES.connectors && isCloudMode && isSignedIn && connectorsAllowed;
  const { data, failed, loading, retry } = usePersonalSourceData(enabled);
  const [expanded, setExpanded] = useState<ConnectorPersonalSource | null>(null);

  const openOption = useCallback(
    (option: PersonalSourceOption) => {
      const target =
        option.kind === 'device'
          ? DEVICE_INTEGRATIONS_ROUTE
          : { pathname: '/(app)/connectors/[id]', params: { id: option.routeId } };
      router.push(target as unknown as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  if (!enabled) return null;
  if (failed) return <ErrorBanner message={LOAD_FAILED} onRetry={() => void retry()} />;
  if (!data) {
    return loading ? <LoadingRows count={2} /> : null;
  }

  const rows = SOURCES.map((source) => buildPersonalSourceRow({ source, ...data })).filter(
    (row): row is PersonalSourceRowModel => row !== null,
  );

  return (
    <>
      {rows.map((row) => (
        <View key={row.source} style={{ gap: 8 }}>
          <SourceRow
            row={row}
            expanded={expanded === row.source}
            onPress={() => {
              const only = row.options.length === 1 ? row.options[0] : undefined;
              if (only) openOption(only);
              else setExpanded((current) => (current === row.source ? null : row.source));
            }}
          />
          {expanded === row.source
            ? row.options.map((option) => (
                <OptionRow
                  key={option.key}
                  option={option}
                  title={row.title}
                  onPress={() => openOption(option)}
                />
              ))
            : null}
        </View>
      ))}
    </>
  );
}
