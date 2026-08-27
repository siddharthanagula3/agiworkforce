import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { ManagedCloudAgentRunApprovalDecision } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import {
  cloudRunStateColor,
  cloudRunTimeLabel,
  isCloudRunSteerable,
  CLOUD_RUN_ORIGIN_LABELS,
  CLOUD_RUN_STATE_LABELS,
  CLOUD_RUN_WORK_MODE_LABELS,
  type CloudRunActivityTone,
} from '../runPresentation';
import type { CloudRunDetail } from '../store';

const CONNECTOR_INPUT_NOTE =
  'Connector questions are answered where the task was started. You can still stop it here.';

function activityToneColor(tone: CloudRunActivityTone, colors: ColorScheme): string {
  if (tone === 'error') return colors.agentError;
  if (tone === 'success') return colors.agentSuccess;
  return colors.textSecondary;
}

function SectionTitle({ label }: { label: string }) {
  const colors = useThemeColors();

  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {label}
    </Text>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, width: 96 }}>{label}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{value}</Text>
    </View>
  );
}

export function CloudRunDetailSheet({
  detail,
  title,
  onClose,
  onResolveApproval,
  onStop,
}: {
  detail: CloudRunDetail | null;
  title: string;
  onClose: () => void;
  onResolveApproval: (decision: ManagedCloudAgentRunApprovalDecision) => void;
  onStop: () => void;
}) {
  const colors = useThemeColors();
  const run = detail?.run ?? null;
  const busy = detail?.pendingAction != null;

  return (
    <Modal
      visible={detail !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <View
          style={{
            minHeight: 52,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}
          >
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close task"
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {detail?.status === 'loading' && !run ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={{ color: colors.textMuted }}>Opening this task…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 18 }}
            showsVerticalScrollIndicator={false}
          >
            {detail?.error ? (
              <View
                accessibilityRole="alert"
                style={{
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  padding: 12,
                  backgroundColor: colors.dangerSurface,
                  borderWidth: 1,
                  borderColor: colors.dangerBorder,
                }}
              >
                <Text selectable style={{ color: colors.agentError, fontSize: 13, lineHeight: 19 }}>
                  {detail.error}
                </Text>
              </View>
            ) : null}

            {run ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: cloudRunStateColor(run.state, colors),
                    }}
                  />
                  <Text
                    style={{
                      color: cloudRunStateColor(run.state, colors),
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {CLOUD_RUN_STATE_LABELS[run.state]}
                  </Text>
                  {detail?.status === 'live' ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>· Following live</Text>
                  ) : null}
                </View>

                <View style={{ gap: 6 }}>
                  <MetadataRow
                    label="Started on"
                    value={CLOUD_RUN_ORIGIN_LABELS[run.originSurface]}
                  />
                  <MetadataRow label="Mode" value={CLOUD_RUN_WORK_MODE_LABELS[run.workMode]} />
                  <MetadataRow label="Model" value={getManagedDisplayName(run.model)} />
                  {cloudRunTimeLabel(run) ? (
                    <MetadataRow label="Activity" value={cloudRunTimeLabel(run)} />
                  ) : null}
                  {run.usage ? (
                    <MetadataRow
                      label="Usage"
                      value={`${run.usage.providerCalls} calls · ${run.usage.inputTokens + run.usage.outputTokens} tokens`}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}

            {run?.pendingApproval ? (
              <View
                style={{
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  padding: 15,
                  gap: 12,
                  backgroundColor: colors.warningSurface,
                  borderWidth: 1,
                  borderColor: colors.warningBorder,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                  Waiting for your approval
                </Text>
                {run.pendingApproval.toolCalls.map((call) => (
                  <View key={call.toolCallId} style={{ gap: 3 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 13 }}>
                      {call.name}
                    </Text>
                    <Text
                      selectable
                      numberOfLines={4}
                      style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}
                    >
                      {call.argsPreview}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title="Approve"
                    accessibilityLabel="Approve this task"
                    loading={detail?.pendingAction === 'approve'}
                    disabled={busy}
                    onPress={() => onResolveApproval('approved')}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Deny"
                    variant="outline"
                    accessibilityLabel="Deny this task"
                    loading={detail?.pendingAction === 'reject'}
                    disabled={busy}
                    onPress={() => onResolveApproval('rejected')}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}

            {run?.pendingInput ? (
              <View
                style={{
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  padding: 15,
                  gap: 10,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                  Waiting for connector input
                </Text>
                {run.pendingInput.toolCalls.map((call) => (
                  <View key={call.toolCallId} style={{ gap: 3 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 13 }}>
                      {call.name}
                    </Text>
                    <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 12 }}>
                      {Object.keys(call.inputRequests).join(', ')}
                    </Text>
                  </View>
                ))}
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  {CONNECTOR_INPUT_NOTE}
                </Text>
              </View>
            ) : null}

            {detail?.transcript ? (
              <View style={{ gap: 8 }}>
                <SectionTitle label="Latest output" />
                <Text
                  selectable
                  style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}
                >
                  {detail.transcript}
                </Text>
              </View>
            ) : null}

            {detail && detail.activity.length > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionTitle label="Activity" />
                {detail.activity.map((line) => (
                  <Text
                    key={line.id}
                    numberOfLines={3}
                    style={{
                      color: activityToneColor(line.tone, colors),
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {line.label}
                  </Text>
                ))}
              </View>
            ) : null}

            {run && isCloudRunSteerable(run) ? (
              <Button
                title="Stop this task"
                variant="destructive"
                accessibilityLabel="Stop this task"
                loading={detail?.pendingAction === 'cancel'}
                disabled={busy}
                onPress={onStop}
              />
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
