import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Plus, Sparkles } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { installSkill } from '@/src/features/skills/service';
import { useCapability } from '@/src/lib/Capabilities';
import { ErrorBanner, MetaText } from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { ConnectorLogo } from '@/src/features/settings/cloud-connectors/ConnectorLogo';

import {
  buildDiscoverGroups,
  type DiscoverGroups,
  type DiscoverRow,
  type DiscoverSources,
} from './discoverSuggestions';
import { useDiscoverSuggestions } from './useDiscoverSuggestions';

const CONNECTORS_ROUTE = '/(app)/connectors';
const ICON_SIZE = 40;
const TAP_SIZE = 44;
const SKELETON_ROWS = 3;
const LOAD_FAILED = 'Could not load suggestions';
const ADD_FAILED = 'Could not add. Try again.';
const DEFAULT_BODY = 'Add tools and skills that fit how you work';
const GATE_BODY = 'Tools and skills run in AGI Cloud; switching won’t upload your local chats.';

type RouterPush = ReturnType<typeof useRouter>['push'];

function businessCategory(groups: DiscoverGroups, sources: DiscoverSources): string | null {
  const first = groups.business[0];
  const listing = first
    ? sources.listings?.find((candidate) => `connector:${candidate.id}` === first.key)
    : undefined;
  return listing?.categories.find((category) => sources.workCategories.includes(category)) ?? null;
}

function SkillIcon() {
  const colors = useThemeColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: ICON_SIZE / 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSurface,
      }}
    >
      <Sparkles size={ICON_SIZE / 2} color={colors.textPrimary} />
    </View>
  );
}

function RowTrailing({
  row,
  adding,
  onAdd,
  onOpen,
}: {
  row: DiscoverRow;
  adding: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  const style = ({ pressed }: { pressed: boolean }) => ({
    width: TAP_SIZE,
    height: TAP_SIZE,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: pressed ? 0.5 : 1,
  });
  if (adding) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Adding ${row.title}`}
        accessibilityState={{ busy: true }}
        style={style({ pressed: false })}
      >
        <ActivityIndicator size="small" color={colors.textSecondary} />
      </View>
    );
  }
  if (row.state === 'added') {
    return (
      <PressableBox
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`${row.title}, ${row.kind === 'skill' ? 'added' : 'connected'}`}
        accessibilityHint="Opens details"
        style={style}
      >
        <Check size={20} color={colors.agentSuccess} />
      </PressableBox>
    );
  }
  return (
    <PressableBox
      onPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={`${row.kind === 'skill' ? 'Add' : 'Connect'} ${row.title}`}
      style={style}
    >
      <Plus size={22} color={colors.textSecondary} />
    </PressableBox>
  );
}

function DiscoverRowItem({
  row,
  adding,
  failed,
  onAdd,
  onOpen,
}: {
  row: DiscoverRow;
  adding: boolean;
  failed: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <PressableBox
          onPress={onOpen}
          accessibilityRole="link"
          accessibilityLabel={row.description ? `${row.title}. ${row.description}` : row.title}
          accessibilityHint="Opens details"
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {row.kind === 'skill' ? <SkillIcon /> : <ConnectorLogo size={ICON_SIZE} />}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text
              numberOfLines={2}
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              {row.title}
            </Text>
            {row.description ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}
              >
                {row.description}
              </Text>
            ) : null}
          </View>
        </PressableBox>
        <RowTrailing row={row} adding={adding} onAdd={onAdd} onOpen={onOpen} />
      </View>
      {failed ? (
        <Text
          accessibilityRole="alert"
          style={{
            marginLeft: ICON_SIZE + 12,
            color: colors.agentError,
            fontSize: typeScale.caption,
            lineHeight: 17,
          }}
        >
          {ADD_FAILED}
        </Text>
      ) : null}
    </View>
  );
}

function GroupHeading({ title, onOpen }: { title: string; onOpen: (() => void) | null }) {
  const colors = useThemeColors();
  const label = (
    <Text
      accessibilityRole="header"
      style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}
    >
      {title}
    </Text>
  );
  if (!onOpen)
    return <View style={{ minHeight: TAP_SIZE, justifyContent: 'center' }}>{label}</View>;
  return (
    <PressableBox
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint="Opens connectors"
      style={({ pressed }) => ({
        minHeight: TAP_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {label}
      <ChevronRight size={18} color={colors.textMuted} />
    </PressableBox>
  );
}

function SkeletonRows() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading suggestions"
      accessibilityState={{ busy: true }}
      style={{ gap: 12 }}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={ICON_SIZE} height={ICON_SIZE} borderRadius={ICON_SIZE / 4} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="45%" height={14} />
            <Skeleton width="80%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

function SectionHeading({ body = DEFAULT_BODY }: { body?: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 2 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '700' }}
      >
        Customize your chats
      </Text>
      <MetaText>{body}</MetaText>
    </View>
  );
}

function DiscoverGate({ signedIn, onContinue }: { signedIn: boolean; onContinue: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeading body={GATE_BODY} />
      <Button
        title={signedIn ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
        variant="outline"
        onPress={onContinue}
        accessibilityHint="Opens AGI Cloud without sending Local Mode data"
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}

export function DiscoverSection() {
  const router = useRouter();
  const access = useCloudFeatureAccess();
  const connectorsAllowed = useCapability('canUseConnectors');
  const connectors = FEATURES.connectors && connectorsAllowed;
  const skills = FEATURES.skills;
  const { sources, status, retry, applyInstalled } = useDiscoverSuggestions({
    connectors: access.ready && connectors,
    skills: access.ready && skills,
    ownerId: access.ready ? access.ownerId : null,
  });
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const groups = useMemo(() => (sources ? buildDiscoverGroups(sources) : null), [sources]);

  useEffect(() => {
    setAddingKey(null);
    setFailedKey(null);
  }, [access.ownerId]);

  const open = useCallback(
    (row: DiscoverRow) => {
      const target =
        row.kind === 'skill'
          ? { pathname: '/(app)/skills/[name]', params: { name: row.routeId } }
          : { pathname: '/(app)/connectors/[id]', params: { id: row.routeId } };
      router.push(target as unknown as Parameters<RouterPush>[0]);
    },
    [router],
  );

  const add = useCallback(
    async (row: DiscoverRow) => {
      if (row.kind === 'connector') {
        open(row);
        return;
      }
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== access.ownerId || addingKey) return;
      setAddingKey(row.key);
      setFailedKey(null);
      try {
        const installed = await installSkill(row.routeId);
        if (!isCloudAccountEpochCurrent(account)) return;
        applyInstalled(installed);
      } catch {
        if (!isCloudAccountEpochCurrent(account)) return;
        setFailedKey(row.key);
      } finally {
        if (isCloudAccountEpochCurrent(account)) setAddingKey(null);
      }
    },
    [access.ownerId, addingKey, applyInstalled, open],
  );

  const openConnectors = useCallback(
    (category: string | null = null) =>
      router.push(
        (category
          ? { pathname: CONNECTORS_ROUTE, params: { category } }
          : CONNECTORS_ROUTE) as Parameters<RouterPush>[0],
      ),
    [router],
  );

  if (!connectors && !skills) return null;
  if (!access.ready) {
    return <DiscoverGate signedIn={access.signedIn} onContinue={access.continueToCloud} />;
  }
  if (status === 'ready' && groups && groups.everyday.length + groups.business.length === 0) {
    return null;
  }

  const renderRows = (rows: DiscoverRow[]) =>
    rows.map((row) => (
      <DiscoverRowItem
        key={row.key}
        row={row}
        adding={addingKey === row.key}
        failed={failedKey === row.key}
        onAdd={() => void add(row)}
        onOpen={() => open(row)}
      />
    ));

  return (
    <View style={{ gap: 6 }}>
      <SectionHeading />
      {status === 'loading' ? <SkeletonRows /> : null}
      {status === 'failed' ? (
        <ErrorBanner message={LOAD_FAILED} onRetry={() => void retry()} />
      ) : null}
      {status === 'ready' && groups ? (
        <>
          {groups.everyday.length > 0 ? (
            <View>
              <GroupHeading
                title="Everyday tools"
                onOpen={connectors ? () => openConnectors() : null}
              />
              {renderRows(groups.everyday)}
            </View>
          ) : null}
          {groups.business.length > 0 ? (
            <View>
              <GroupHeading
                title="Business essentials"
                onOpen={() => openConnectors(sources ? businessCategory(groups, sources) : null)}
              />
              {renderRows(groups.business)}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
