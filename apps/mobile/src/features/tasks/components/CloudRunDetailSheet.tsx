import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Modal, ScrollView, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Flag, X } from 'lucide-react-native';
import {
  TOOL_APPROVAL_NO_PARAMETERS,
  toolApprovalParameterRows,
  type CloudAgentPendingApproval,
  type ManagedCloudAgentRunApprovalDecision,
} from '@agiworkforce/cloud-contracts';
import {
  TOOL_APPROVAL_ACTION_LABELS,
  creditsFromCents,
  formatCredits,
  getToolDisplayLabel,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  cloudRunStateColor,
  cloudRunTimeLabel,
  isCloudRunSteerable,
  CLOUD_RUN_ORIGIN_LABELS,
  CLOUD_RUN_STATE_LABELS,
  CLOUD_RUN_WORK_MODE_LABELS,
  type CloudRunActivityTone,
  CLOUD_RUN_PLAN_STATUS_LABELS,
} from '../runPresentation';
import { CloudRunSteerSection } from './CloudRunSteerSection';
import { CloudRunInputForm } from './CloudRunInputForm';
import { CloudRunFilesSection } from './CloudRunFilesSection';
import { useCloudTaskStore, type CloudRunDetail } from '../store';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { ReportSheet, type ReportTarget } from '@/src/features/chat/components/ReportFlagButton';
import { TOOL_MONOSPACE } from '@/src/features/chat/components/ToolFileDiffBlock';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';

const DEVICE_STEP_NOTE =
  'Open the AGI Cloud app on that computer to carry this out, or stop the task below.';

const REPORT_THIS_TASK = 'Report this task';

const CITATION_SEPARATOR = '(?:[\\uE200-\\uE204\\u{1F300}-\\u{1FAFF}]\\uFE0F?)';
const CITATION_REFERENCE = 'turn\\d+[a-z]+\\d+';
const PROVIDER_CITATION_TOKEN = new RegExp(
  `${CITATION_SEPARATOR}?cite(?:${CITATION_SEPARATOR}+${CITATION_REFERENCE})+${CITATION_SEPARATOR}?`,
  'gu',
);
const PRIVATE_USE_CITATION_SPAN = /\uE200cite\uE202[^\s\uE200\uE201\uE203\uE204]{0,505}\uE201/g;
const PRIVATE_USE_MARKUP_SPAN =
  /\uE200(?!cite\uE202)[a-z_]{1,32}\uE202[^\n\uE200\uE201]{0,477}\uE201/g;
const PRIVATE_USE_CITATION_HEADER = /\uE200(?:cite\uE202[A-Za-z0-9_\uE202]*|c(?:i(?:te?)?)?$)/g;
const PRIVATE_USE_MARKUP = new RegExp(
  [
    PRIVATE_USE_CITATION_SPAN.source,
    PRIVATE_USE_MARKUP_SPAN.source,
    PRIVATE_USE_CITATION_HEADER.source,
  ].join('|'),
  'g',
);
const STRAY_CITATION_MARK = /[\uE200-\uE204]/g;

export function stripProviderCitationTokens(text: string): string {
  return text
    .replace(PRIVATE_USE_MARKUP, '')
    .replace(PROVIDER_CITATION_TOKEN, '')
    .replace(STRAY_CITATION_MARK, '');
}

function cloudRunReportTarget(detail: CloudRunDetail): ReportTarget {
  const reference = `cloud-run:${detail.runId}`;
  const parts = [
    stripProviderCitationTokens(detail.transcript),
    ...detail.plan.map((step) => step.description),
    ...(detail.run?.pendingDeviceStep?.steps.map((step) => step.summary) ?? []),
  ];
  return {
    messageId: reference,
    conversationId: detail.run?.conversationId ?? reference,
    contentExcerpt: parts.filter((part) => part.trim()).join('\n\n'),
    subject: { kind: 'task-run', id: detail.runId },
  };
}

function hasReportableOutput(detail: CloudRunDetail | null): detail is CloudRunDetail {
  if (!detail) return false;
  return (
    detail.transcript.trim().length > 0 ||
    detail.plan.length > 0 ||
    (detail.run?.pendingDeviceStep?.steps.length ?? 0) > 0
  );
}

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
        fontSize: typeScale.caption,
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
      <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, width: 96 }}>
        {label}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

type PendingApprovalCall = CloudAgentPendingApproval['toolCalls'][number];

function approvalCallParameters(argsPreview: string): Record<string, unknown> | null {
  if (!argsPreview.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(argsPreview);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function PendingApprovalCallRows({ call }: { call: PendingApprovalCall }) {
  const colors = useThemeColors();
  const parameters = approvalCallParameters(call.argsPreview);
  const rows = parameters ? toolApprovalParameterRows(parameters) : [];

  return (
    <View testID={`cloud-run-approval-call-${call.toolCallId}`} style={{ gap: 4 }}>
      <Text
        numberOfLines={2}
        style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
      >
        {getToolDisplayLabel(call.name).displayName}
      </Text>
      {parameters === null ? (
        <Text
          selectable
          numberOfLines={4}
          style={{
            color: colors.textSecondary,
            fontFamily: TOOL_MONOSPACE,
            fontSize: typeScale.caption,
          }}
        >
          {call.argsPreview}
        </Text>
      ) : rows.length > 0 ? (
        <View style={{ gap: 3 }}>
          {rows.map((row) => (
            <View key={row.key} style={{ flexDirection: 'row', gap: 10 }}>
              <Text
                numberOfLines={1}
                style={{
                  maxWidth: '40%',
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                  color: colors.textMuted,
                }}
              >
                {row.key}
              </Text>
              <Text
                selectable
                style={{
                  flex: 1,
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                  color: colors.textPrimary,
                }}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {TOOL_APPROVAL_NO_PARAMETERS}
        </Text>
      )}
    </View>
  );
}

const STOPPED_SHORT_STATES = new Set(['partial', 'timed_out', 'cancelled', 'failed']);

export function CloudRunDetailSheet({
  detail,
  title,
  onClose,
  onResolveApproval,
  onStop,
  onOpenConversation,
  onMakeRoutine,
  onRerun,
  onShare,
  rerunning = false,
  onPause,
  onResume,
}: {
  detail: CloudRunDetail | null;
  title: string;
  onClose: () => void;
  onResolveApproval: (decision: ManagedCloudAgentRunApprovalDecision) => void;
  onStop: () => void;
  onOpenConversation: (conversationId: string) => void;
  onMakeRoutine?: () => void;
  onRerun?: () => void;
  onShare?: () => void;
  rerunning?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const colors = useThemeColors();
  const answerInput = useCloudTaskStore((state) => state.answerInput);
  const run = detail?.run ?? null;
  const busy = detail?.pendingAction != null;
  const conversationId = run?.conversationId ?? null;
  const [reportingRunId, setReportingRunId] = useState<string | null>(null);
  const reportTarget = hasReportableOutput(detail) ? cloudRunReportTarget(detail) : null;
  const output = detail ? stripProviderCitationTokens(detail.transcript) : '';

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
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '700',
            }}
          >
            {title}
          </Text>
          {reportTarget ? (
            <PressableBox
              testID="cloud-run-report"
              onPress={() => setReportingRunId(detail?.runId ?? null)}
              accessibilityRole="button"
              accessibilityLabel={REPORT_THIS_TASK}
              style={{
                width: FULL_SCREEN_TOUCH_TARGET,
                height: FULL_SCREEN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Flag size={18} color={colors.textSecondary} />
            </PressableBox>
          ) : null}
          <PressableBox
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close task"
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={colors.textSecondary} />
          </PressableBox>
        </View>

        {detail?.status === 'loading' && !run ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <LoadingIndicator />
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
                <Text
                  selectable
                  style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
                >
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
                      fontSize: typeScale.footnote,
                      fontWeight: '700',
                    }}
                  >
                    {CLOUD_RUN_STATE_LABELS[run.state]}
                  </Text>
                  {detail?.status === 'live' ? (
                    <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                      · Following live
                    </Text>
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
                      label="Cost"
                      value={
                        run.usage.costCents === null
                          ? 'Metered against your free trial allowance'
                          : formatCredits(creditsFromCents(run.usage.costCents), {
                              maximumFractionDigits: 2,
                            })
                      }
                    />
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
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.subhead,
                    fontWeight: '700',
                  }}
                >
                  Waiting for your approval
                </Text>
                {run.pendingApproval.toolCalls.map((call) => (
                  <PendingApprovalCallRows key={call.toolCallId} call={call} />
                ))}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title={TOOL_APPROVAL_ACTION_LABELS.approve}
                    accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.approve} this task`}
                    loading={detail?.pendingAction === 'approve'}
                    disabled={busy}
                    onPress={() => onResolveApproval('approved')}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={TOOL_APPROVAL_ACTION_LABELS.deny}
                    variant="outline"
                    accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.deny} this task`}
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
                <CloudRunInputForm
                  key={run.pendingInput.requestedAt}
                  pendingInput={run.pendingInput}
                  busy={detail?.pendingAction === 'answer'}
                  onSubmit={(answers) => void answerInput(answers)}
                />
              </View>
            ) : null}

            {run?.pendingDeviceStep ? (
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
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.subhead,
                    fontWeight: '700',
                  }}
                >
                  {`Waiting for ${run.pendingDeviceStep.deviceName}`}
                </Text>
                {run.pendingDeviceStep.steps.map((step) => (
                  <Text
                    key={step.toolCallId}
                    numberOfLines={2}
                    style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
                  >
                    {step.summary}
                  </Text>
                ))}
                <Text
                  style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 18 }}
                >
                  {DEVICE_STEP_NOTE}
                </Text>
              </View>
            ) : null}

            {run && detail && detail.plan.length > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionTitle label={`Plan · ${detail.plan.length}`} />
                {detail.plan.map((step) => {
                  const live = detail.status === 'live';
                  const status = step.status === 'running' && !live ? 'stopped' : step.status;
                  return (
                    <Text
                      key={step.ordinal}
                      accessibilityLabel={`Step ${step.ordinal}, ${step.description}, ${CLOUD_RUN_PLAN_STATUS_LABELS[status]}`}
                      style={{
                        color:
                          status === 'completed'
                            ? colors.textPrimary
                            : status === 'failed'
                              ? colors.agentError
                              : colors.textSecondary,
                        fontSize: typeScale.footnote,
                        lineHeight: 19,
                      }}
                    >
                      {`${step.ordinal}. ${step.description} · ${CLOUD_RUN_PLAN_STATUS_LABELS[status]}`}
                    </Text>
                  );
                })}
                {STOPPED_SHORT_STATES.has(run.workState ?? run.state) ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: typeScale.footnote,
                      lineHeight: 19,
                    }}
                  >
                    {`Done ${detail.plan.filter((step) => step.status === 'completed').length} of ${detail.plan.length} steps before it stopped.`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {output.trim() ? (
              <View style={{ gap: 8 }}>
                <SectionTitle label="Latest output" />
                <View style={{ minWidth: 0 }}>
                  {renderMarkdownContent(output, colors, {
                    highlightCode: detail?.status !== 'live',
                    streaming: detail?.status === 'live',
                  })}
                </View>
              </View>
            ) : null}

            {detail && detail.files.length > 0 ? (
              <CloudRunFilesSection files={detail.files} />
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
                      fontSize: typeScale.footnote,
                      lineHeight: 19,
                    }}
                  >
                    {line.label}
                  </Text>
                ))}
              </View>
            ) : null}

            {run ? <CloudRunSteerSection key={run.id} run={run} /> : null}

            {conversationId ? (
              <Button
                title="Open conversation"
                variant="outline"
                accessibilityLabel="Open the conversation this task belongs to"
                onPress={() => onOpenConversation(conversationId)}
              />
            ) : null}

            {run && onResume && run.state === 'paused' ? (
              <Button
                title="Resume this task"
                loading={detail?.pendingAction === 'resume'}
                disabled={busy}
                onPress={onResume}
              />
            ) : null}

            {run && onPause && run.state === 'running' ? (
              <Button
                title="Pause this task"
                variant="outline"
                accessibilityHint="Stops work after the current step. You can resume it later."
                loading={detail?.pendingAction === 'pause'}
                disabled={busy}
                onPress={onPause}
              />
            ) : null}

            {onRerun ? (
              <Button
                title="Run again"
                variant="outline"
                loading={rerunning}
                accessibilityHint="Opens a new task with the original request, ready to review before it starts"
                onPress={onRerun}
              />
            ) : null}

            {onShare ? (
              <Button
                title="Share task"
                variant="outline"
                accessibilityHint="Creates a link anyone can open to read this task's chat"
                onPress={onShare}
              />
            ) : null}

            {onMakeRoutine ? (
              <Button
                title="Make it a routine"
                variant="outline"
                accessibilityHint="Opens a new schedule that runs this task's prompt on a timer"
                onPress={onMakeRoutine}
              />
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
      {reportTarget && reportingRunId === detail?.runId ? (
        <ReportSheet
          visible
          onClose={() => setReportingRunId(null)}
          title={REPORT_THIS_TASK}
          target={reportTarget}
        />
      ) : null}
    </Modal>
  );
}
