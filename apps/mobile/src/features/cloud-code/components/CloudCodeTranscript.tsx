import { useState } from 'react';
import { ActivityIndicator, Alert, Share, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Check, ChevronRight, Copy, Share2, TriangleAlert } from 'lucide-react-native';
import type { CloudCodeChanges, CodeTranscriptItem } from '@agiworkforce/cloud-contracts';
import {
  CLOUD_CODE_SESSION_COPY,
  CLOUD_CODE_STOP_REASON_LABELS,
  cloudCodeCommandRanLabel,
  cloudCodeStopReasonIsFailure,
  type CloudCodeAgentStep,
  type CloudCodeAgentStopReason,
  type CloudCodeTerminalEntry,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CLOUD_CODE_REPLY_COPY } from '../presentation';
import { CloudCodeChangesCard } from './CloudCodeChangesCard';

const EXIT_CODE_OK = 0;
const CHEVRON_SIZE = 14;
const EXPANDED_ROTATION = '90deg';
const REPLY_ACTION_ICON_SIZE = 16;
const SHARE_FAILED_TITLE = 'Could not share';
const SHARE_FAILED_BODY = 'Sharing is not available right now. Try again, or copy the reply.';

function firstLine(output: string): string {
  return output.split('\n')[0]?.trim() ?? '';
}

function Disclosure({
  label,
  expanded,
  failed,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  failed: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();

  return (
    <PressableBox
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={label}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Text
        variant="mono"
        numberOfLines={1}
        style={{
          flex: 1,
          color: failed ? colors.agentError : colors.textSecondary,
          fontSize: typeScale.footnote,
        }}
      >
        {label}
      </Text>
      <View style={{ transform: [{ rotate: expanded ? EXPANDED_ROTATION : '0deg' }] }}>
        <ChevronRight size={CHEVRON_SIZE} color={colors.textMuted} />
      </View>
    </PressableBox>
  );
}

function OutputBlock({ text, failed }: { text: string; failed: boolean }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        borderRadius: radii.md,
        padding: 10,
        backgroundColor: colors.surfaceHover,
      }}
    >
      <Text
        variant="mono"
        selectable
        style={{
          color: failed ? colors.agentError : colors.textSecondary,
          fontSize: typeScale.caption,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function StepRow({ step }: { step: CloudCodeAgentStep }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const summary = firstLine(step.output);

  return (
    <View>
      <Disclosure
        label={step.label ?? step.toolName}
        expanded={expanded}
        failed={step.isError}
        onToggle={() => setExpanded((open) => !open)}
      />
      {!expanded && summary ? (
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {summary}
        </Text>
      ) : null}
      {expanded && step.output ? <OutputBlock text={step.output} failed={step.isError} /> : null}
    </View>
  );
}

function CommandRow({ entry }: { entry: CloudCodeTerminalEntry }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const failed = entry.exitCode !== EXIT_CODE_OK;
  const summary = firstLine(entry.stdout || entry.stderr);

  return (
    <View>
      <Disclosure
        label={entry.command}
        expanded={expanded}
        failed={failed}
        onToggle={() => setExpanded((open) => !open)}
      />
      {!expanded && summary ? (
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {summary}
        </Text>
      ) : null}
      {expanded ? (
        <View style={{ gap: 6 }}>
          {entry.stdout ? <OutputBlock text={entry.stdout} failed={false} /> : null}
          {entry.stderr ? <OutputBlock text={entry.stderr} failed /> : null}
          <Text
            variant="mono"
            style={{
              color: failed ? colors.agentError : colors.textMuted,
              fontSize: typeScale.caption,
            }}
          >
            {`exit ${entry.exitCode}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function CommandGroup({ entries }: { entries: CloudCodeTerminalEntry[] }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const failed = entries.filter((entry) => entry.exitCode !== EXIT_CODE_OK);

  return (
    <View>
      <Disclosure
        label={cloudCodeCommandRanLabel(entries.length)}
        expanded={expanded}
        failed={false}
        onToggle={() => setExpanded((open) => !open)}
      />
      {!expanded
        ? failed.map((entry) => (
            <Text key={entry.id} style={{ color: colors.agentError, fontSize: typeScale.caption }}>
              {`${entry.command} exited ${entry.exitCode}`}
            </Text>
          ))
        : entries.map((entry) => <CommandRow key={entry.id} entry={entry} />)}
    </View>
  );
}

export function CloudCodeTaskBubble({ text }: { text: string }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '85%',
        borderRadius: radii['2xl'],
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: colors.surfaceHover,
      }}
    >
      <Text
        selectable
        style={{ color: colors.textPrimary, fontSize: typeScale.callout, lineHeight: 24 }}
      >
        {text}
      </Text>
    </View>
  );
}

function ReplyActionButton({
  label,
  icon: Icon,
  color,
  onPress,
}: {
  label: string;
  icon: typeof Copy;
  color: string;
  onPress: () => void;
}) {
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={REPLY_ACTION_ICON_SIZE} color={color} />
    </PressableBox>
  );
}

function ReplyActions({ text }: { text: string }) {
  const colors = useThemeColors();
  const { status, copy } = useCopyAction();
  const copyColor =
    status === 'copied'
      ? colors.agentSuccess
      : status === 'failed'
        ? colors.agentError
        : colors.textMuted;

  const share = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      Alert.alert(SHARE_FAILED_TITLE, SHARE_FAILED_BODY);
    }
  };

  return (
    <View
      accessibilityLabel={CLOUD_CODE_REPLY_COPY.actions}
      style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}
    >
      <ReplyActionButton
        label={copyControlLabel(status, CLOUD_CODE_REPLY_COPY.copy)}
        icon={status === 'copied' ? Check : status === 'failed' ? TriangleAlert : Copy}
        color={copyColor}
        onPress={() => void copy(text)}
      />
      <ReplyActionButton
        label={CLOUD_CODE_REPLY_COPY.share}
        icon={Share2}
        color={colors.textMuted}
        onPress={() => void share()}
      />
    </View>
  );
}

function Reply({
  text,
  stopReason,
}: {
  text: string;
  stopReason: CloudCodeAgentStopReason | null;
}) {
  const colors = useThemeColors();

  return (
    <View style={{ gap: 6 }}>
      {text ? <View>{renderMarkdownContent(text, colors)}</View> : null}
      {stopReason ? (
        <Text
          style={{
            color: cloudCodeStopReasonIsFailure(stopReason) ? colors.agentError : colors.textMuted,
            fontSize: typeScale.footnote,
          }}
        >
          {CLOUD_CODE_STOP_REASON_LABELS[stopReason]}
        </Text>
      ) : null}
      {text.trim() ? <ReplyActions text={text} /> : null}
    </View>
  );
}

export function CloudCodeWorkingRow({
  label = CLOUD_CODE_SESSION_COPY.agentWorking,
}: {
  label?: string;
}) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <ActivityIndicator size="small" color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>{label}</Text>
    </View>
  );
}

export function CloudCodeTranscript({
  items,
  changes,
  onOpenChanges,
}: {
  items: CodeTranscriptItem[];
  changes?: CloudCodeChanges | null;
  onOpenChanges?: () => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      {items.map((item) => {
        if (item.kind === 'commands') return <CommandGroup key={item.id} entries={item.entries} />;
        if (item.kind === 'task') return <CloudCodeTaskBubble key={item.id} text={item.text} />;
        if (item.kind === 'steps') {
          return (
            <View key={item.id}>
              {item.steps.map((step) => (
                <StepRow key={step.index} step={step} />
              ))}
            </View>
          );
        }
        return <Reply key={item.id} text={item.text} stopReason={item.stopReason} />;
      })}
      {changes && onOpenChanges ? (
        <CloudCodeChangesCard changes={changes} onOpen={onOpenChanges} />
      ) : null}
    </View>
  );
}
