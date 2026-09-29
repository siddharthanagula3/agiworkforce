import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, X } from 'lucide-react-native';
import {
  CLOUD_CODE_TURN_STEP_BOUNDS,
  formatUsageResetIn,
  getModelMetadataById,
  managedUsageBucketLabel,
  type CloudCodeSession,
  type CloudCodeTurnMode,
  type CloudCodeTurnStepBound,
} from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import {
  CLOUD_CODE_OPTIONS_COPY as COPY,
  CLOUD_CODE_TURN_MODE_OPTIONS,
  CLOUD_CODE_TURN_STEP_HINTS,
} from '../presentation';

const PERCENT = 100;
const NEAR_LIMIT_PERCENT = 90;

export function cloudCodeContextPercent(
  session: Pick<CloudCodeSession, 'contextInputTokens' | 'contextOutputTokens'>,
  model: string,
): number | null {
  const window = getModelMetadataById(model)?.contextWindow;
  if (!window) return null;
  const used = session.contextInputTokens + session.contextOutputTokens;
  return Math.min(PERCENT, Math.round((used / window) * PERCENT));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 4 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Choice({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}. ${description}`}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>{description}</Text>
      </View>
      {selected ? <Check size={16} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

function UsageRow({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string | null;
}) {
  const colors = useThemeColors();
  const clamped = Math.min(PERCENT, Math.max(0, percent));
  return (
    <View style={{ gap: 6, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>{label}</Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
        >{`${Math.round(clamped)}%`}</Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: PERCENT, now: Math.round(clamped) }}
        style={{
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: colors.progressTrack,
        }}
      >
        <View
          style={{
            height: 6,
            width: `${clamped}%`,
            backgroundColor: clamped >= NEAR_LIMIT_PERCENT ? colors.agentError : colors.teal,
          }}
        />
      </View>
      {detail ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>{detail}</Text>
      ) : null}
    </View>
  );
}

export function CloudCodeTaskOptionsSheet({
  visible,
  session,
  model,
  turnControls,
  mode,
  steps,
  onModeChange,
  onStepsChange,
  onClose,
}: {
  visible: boolean;
  session: CloudCodeSession;
  model: string;
  turnControls: boolean;
  mode: CloudCodeTurnMode;
  steps: CloudCodeTurnStepBound;
  onModeChange: (mode: CloudCodeTurnMode) => void;
  onStepsChange: (steps: CloudCodeTurnStepBound) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const ownerId = useCloudUsageStore((state) => state.ownerId);
  const cached = useCloudUsageStore((state) => state.snapshot);
  const loading = useCloudUsageStore((state) => state.loading);
  const refresh = useCloudUsageStore((state) => state.refresh);
  const snapshot = ownerId === clerkUserId ? cached : null;
  const contextPercent = cloudCodeContextPercent(session, model);

  useEffect(() => {
    if (visible) void refresh();
  }, [refresh, visible]);

  const openUsage = () => {
    onClose();
    router.push('/(app)/settings/cloud-usage' as Parameters<typeof router.push>[0]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      accessibilityViewIsModal
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.surfaceBase, padding: dialogPadding }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
            }}
          >
            {COPY.heading}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={COPY.close}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 32 }}>
          {turnControls ? (
            <>
              <Section title={COPY.mode}>
                <View accessibilityRole="radiogroup">
                  {CLOUD_CODE_TURN_MODE_OPTIONS.map((option) => (
                    <Choice
                      key={option.id}
                      label={option.label}
                      description={option.description}
                      selected={mode === option.id}
                      onPress={() => onModeChange(option.id)}
                    />
                  ))}
                </View>
              </Section>
              <Section title={COPY.steps}>
                <View accessibilityRole="radiogroup">
                  {CLOUD_CODE_TURN_STEP_BOUNDS.map((bound) => (
                    <Choice
                      key={bound}
                      label={`${bound} ${COPY.stepsUnit}`}
                      description={CLOUD_CODE_TURN_STEP_HINTS[bound]}
                      selected={steps === bound}
                      onPress={() => onStepsChange(bound)}
                    />
                  ))}
                </View>
              </Section>
            </>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, lineHeight: 19 }}>
              {COPY.ownAgent}
            </Text>
          )}

          <Section title={COPY.usage}>
            {contextPercent !== null ? (
              <UsageRow label={COPY.contextWindow} percent={contextPercent} detail={null} />
            ) : null}
            {snapshot ? (
              <>
                {snapshot.sessionResetAt !== null ? (
                  <UsageRow
                    label={managedUsageBucketLabel('session')}
                    percent={snapshot.sessionUsagePercentage}
                    detail={formatUsageResetIn(snapshot.sessionResetAt)}
                  />
                ) : null}
                {snapshot.weeklyResetAt !== null ? (
                  <UsageRow
                    label={managedUsageBucketLabel('weekly')}
                    percent={snapshot.weeklyUsagePercentage}
                    detail={formatUsageResetIn(snapshot.weeklyResetAt)}
                  />
                ) : null}
                {snapshot.flagshipWeeklyResetAt !== null ? (
                  <UsageRow
                    label={managedUsageBucketLabel('weeklyFlagship')}
                    percent={snapshot.flagshipWeeklyUsagePercentage}
                    detail={formatUsageResetIn(snapshot.flagshipWeeklyResetAt)}
                  />
                ) : null}
                <UsageRow
                  label={managedUsageBucketLabel('period')}
                  percent={snapshot.usagePercentage}
                  detail={formatUsageResetIn(snapshot.usageResetAt)}
                />
              </>
            ) : loading ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                {COPY.usageUnavailable}
              </Text>
            )}
            <Pressable
              onPress={openUsage}
              accessibilityRole="link"
              accessibilityLabel={COPY.usageDetail}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text
                style={{
                  flex: 1,
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                }}
              >
                {COPY.usageDetail}
              </Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}
