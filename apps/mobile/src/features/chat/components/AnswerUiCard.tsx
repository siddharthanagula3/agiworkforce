import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, Platform, ScrollView, Share, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  ExternalLink,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileBraces,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Share2,
  TriangleAlert,
} from 'lucide-react-native';
import {
  ANSWER_UI_LIMITS,
  answerUiChecklistText,
  answerUiControls,
  answerUiInitialValues,
  formatAnswerUiSliderValue,
  renderAnswerUiTemplate,
  type AnswerUiActionButton,
  type AnswerUiBlock,
  type AnswerUiCalloutTone,
  type AnswerUiCardBody,
  type AnswerUiChartBlock,
  type AnswerUiChecklistBlock,
  type AnswerUiChoiceBlock,
  type AnswerUiControlBlock,
  type AnswerUiInputBlock,
  type AnswerUiSliderBlock,
  type AnswerUiStatusTone,
  type AnswerUiValue,
  type AnswerUiValues,
} from '@agiworkforce/types';
import {
  ANSWER_UI_CHART_DATA_LABEL,
  answerUiChartSpec,
} from '@agiworkforce/unified-chat/answer-ui';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { StatusPill } from './AnswerSurfaceKit';
import { useAnswerDraft } from './answerDraftStore';
import { useReportUnsavedAnswerEdit } from './AssistantDraftScope';
import { MarkdownImage } from './MarkdownImage';
import { renderMarkdownContent } from './MessageContentRenderer';
import { SideScroller } from './SideScroller';
import { ReportChart } from './ReportChart';
import { AnswerUiMap } from './cards/AnswerUiMap';
import { AnswerUiScatter } from './cards/AnswerUiScatter';
import {
  ANSWER_UI_SEND_FAILED_MESSAGE,
  answerUiChartTable,
  answerUiFileKind,
  answerUiMermaidChart,
  answerUiScatterSeries,
  answerUiValuesChanged,
  type AnswerUiFileKind,
} from './cards/answer-ui';
import type { TileAccess } from '../services/mapTiles';

const TARGET = 44;

export const ANSWER_UI_CHECKLIST_RESET_LABEL = 'Reset';
export const ANSWER_UI_CHECKLIST_COPY_LABEL = 'Copy checklist';
export const ANSWER_UI_FILE_EXAMPLE_LABEL = 'Example';
export const ANSWER_UI_COPY_READY_LABEL = 'Copy-ready';

export interface AnswerUiSendState {
  canSend: boolean;
  blockedReason?: string;
  onSend?: (actionId: string, values: Record<string, AnswerUiValue>) => Promise<void>;
}

interface Scope {
  values: AnswerUiValues;
  controls: ReadonlyMap<string, AnswerUiControlBlock>;
  setValue: (id: string, value: AnswerUiValue) => void;
  resetValues: (ids?: readonly string[]) => void;
  send: AnswerUiSendState;
  pendingAction: string | null;
  runSend: (actionId: string) => void;
  colors: ColorScheme;
  tileBaseUrl: string;
  tileAccess: TileAccess;
}

function shareText(text: string): void {
  void Share.share({ message: text }).catch(() => undefined);
}

function useCopyOrShare() {
  const copyAction = useCopyAction();
  const copyOrShare = useCallback(
    async (text: string) => {
      if (!(await copyAction.copy(text))) shareText(text);
    },
    [copyAction],
  );
  return { status: copyAction.status, copyOrShare };
}

function Label({ children, colors }: { children: ReactNode; colors: ColorScheme }) {
  return (
    <Text style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}>
      {children}
    </Text>
  );
}

function Frame({
  children,
  colors,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  colors: ColorScheme;
  testID: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={{
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radii.xl,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      {children}
    </View>
  );
}

function Readout({ template, scope }: { template?: string; scope: Scope }) {
  if (!template) return null;
  return (
    <Text
      testID="answer-ui-readout"
      accessibilityLiveRegion="polite"
      style={{ fontSize: typeScale.subhead, color: scope.colors.textSecondary }}
    >
      {renderAnswerUiTemplate(template, scope.controls, scope.values)}
    </Text>
  );
}

function Mark({
  round,
  checked,
  colors,
}: {
  round: boolean;
  checked: boolean;
  colors: ColorScheme;
}) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        marginTop: 1,
        borderRadius: round ? 10 : radii.sm,
        borderWidth: 1.5,
        borderColor: checked ? colors.teal : colors.textSecondary,
        backgroundColor: checked && !round ? colors.teal : colors.transparent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && round ? (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal }} />
      ) : null}
      {checked && !round ? <Check size={14} color={colors.background} strokeWidth={3} /> : null}
    </View>
  );
}

function ChoiceControl({ block, scope }: { block: AnswerUiChoiceBlock; scope: Scope }) {
  const { colors } = scope;
  const [open, setOpen] = useState(false);
  const selected = (scope.values[block.id] as string[] | undefined) ?? [];

  if (block.style === 'dropdown') {
    const current = block.options.find((option) => option.id === selected[0]);
    return (
      <View testID="answer-ui-choice" style={{ gap: spacing.xs }}>
        <Label colors={colors}>{block.label}</Label>
        <PressableBox
          accessibilityRole="button"
          accessibilityLabel={`${block.label}, ${current?.label ?? 'Choose'}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((shown) => !shown)}
          style={{
            minHeight: TARGET,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceBase,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: typeScale.body,
              color: current ? colors.textPrimary : colors.textMuted,
            }}
          >
            {current?.label ?? 'Choose…'}
          </Text>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <ChevronDown size={18} color={colors.textSecondary} />
          </View>
        </PressableBox>
        {open
          ? block.options.map((option) => (
              <PressableBox
                key={option.id}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: option.id === selected[0] }}
                onPress={() => {
                  scope.setValue(block.id, [option.id]);
                  setOpen(false);
                }}
                style={{
                  minHeight: TARGET,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.sm,
                }}
              >
                <Mark round checked={option.id === selected[0]} colors={colors} />
                <Text style={{ flex: 1, fontSize: typeScale.body, color: colors.textPrimary }}>
                  {option.label}
                </Text>
              </PressableBox>
            ))
          : null}
        <Readout template={block.readout} scope={scope} />
      </View>
    );
  }

  const multiple = block.style === 'checkbox';
  return (
    <View
      testID="answer-ui-choice"
      accessibilityRole={multiple ? undefined : 'radiogroup'}
      accessibilityLabel={block.label}
      style={{ gap: spacing.sm }}
    >
      <Label colors={colors}>{block.label}</Label>
      {block.options.map((option) => {
        const checked = selected.includes(option.id);
        return (
          <PressableBox
            key={option.id}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityLabel={
              option.description ? `${option.label}, ${option.description}` : option.label
            }
            accessibilityState={multiple ? { checked } : { selected: checked }}
            onPress={() =>
              scope.setValue(
                block.id,
                multiple
                  ? checked
                    ? selected.filter((id) => id !== option.id)
                    : [...selected, option.id]
                  : [option.id],
              )
            }
            style={{
              minHeight: TARGET,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: checked ? colors.teal : colors.border,
              backgroundColor: checked ? colors.surfaceHover : colors.transparent,
            }}
          >
            <Mark round={!multiple} checked={checked} colors={colors} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontSize: typeScale.body, fontWeight: '500', color: colors.textPrimary }}
              >
                {option.label}
              </Text>
              {option.description ? (
                <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                  {option.description}
                </Text>
              ) : null}
            </View>
          </PressableBox>
        );
      })}
      <Readout template={block.readout} scope={scope} />
    </View>
  );
}

function SliderControl({ block, scope }: { block: AnswerUiSliderBlock; scope: Scope }) {
  const { colors } = scope;
  const raw = scope.values[block.id];
  const value = typeof raw === 'number' ? raw : block.value;
  const shown = formatAnswerUiSliderValue(block, value);
  return (
    <View testID="answer-ui-slider" style={{ gap: spacing.xs }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <Label colors={colors}>{block.label}</Label>
        <Text
          testID="answer-ui-slider-value"
          style={{
            fontSize: typeScale.subhead,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            color: colors.textPrimary,
          }}
        >
          {shown}
        </Text>
      </View>
      <Slider
        testID="answer-ui-slider-track"
        value={value}
        minimumValue={block.min}
        maximumValue={block.max}
        step={block.step}
        onValueChange={(next: number) => scope.setValue(block.id, next)}
        minimumTrackTintColor={colors.teal}
        maximumTrackTintColor={colors.progressTrack}
        thumbTintColor={colors.teal}
        accessibilityLabel={block.label}
        accessibilityValue={{ text: shown }}
        style={{ height: TARGET }}
      />
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexDirection: 'row', justifyContent: 'space-between' }}
      >
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {formatAnswerUiSliderValue(block, block.min)}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {formatAnswerUiSliderValue(block, block.max)}
        </Text>
      </View>
      <Readout template={block.readout} scope={scope} />
    </View>
  );
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function pickerDate(value: string): Date {
  const match = ISO_DATE.exec(value);
  const now = new Date();
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function DateInput({
  block,
  value,
  scope,
}: {
  block: AnswerUiInputBlock;
  value: string;
  scope: Scope;
}) {
  const { colors } = scope;
  const [open, setOpen] = useState(false);
  const pick = (_event: DateTimePickerChangeEvent, date: Date) =>
    scope.setValue(block.id, isoDate(date));
  const shown = ISO_DATE.test(value)
    ? pickerDate(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  return (
    <>
      <PressableBox
        accessibilityRole="button"
        accessibilityLabel={`${block.label}, ${shown ?? 'not set'}`}
        accessibilityHint="Opens a date picker"
        onPress={() => {
          if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
              value: pickerDate(value),
              mode: 'date',
              onValueChange: pick,
            });
            return;
          }
          setOpen((current) => !current);
        }}
        style={{
          minHeight: TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceBase,
        }}
      >
        <CalendarDays size={16} color={colors.textMuted} />
        <Text
          style={{ fontSize: typeScale.body, color: shown ? colors.textPrimary : colors.textMuted }}
        >
          {shown ?? block.placeholder ?? 'Choose a date'}
        </Text>
      </PressableBox>
      {Platform.OS === 'ios' && open ? (
        <DateTimePicker
          testID="answer-ui-date-picker"
          value={pickerDate(value)}
          mode="date"
          display="inline"
          onValueChange={pick}
        />
      ) : null}
    </>
  );
}

function InputControl({ block, scope }: { block: AnswerUiInputBlock; scope: Scope }) {
  const { colors } = scope;
  const raw = scope.values[block.id];
  const value = typeof raw === 'string' ? raw : block.value;
  return (
    <View testID="answer-ui-input" style={{ gap: spacing.xs }}>
      <Label colors={colors}>{block.label}</Label>
      {block.inputType === 'date' ? (
        <DateInput block={block} value={value} scope={scope} />
      ) : (
        <TextInput
          accessibilityLabel={block.label}
          value={value}
          placeholder={block.placeholder}
          placeholderTextColor={colors.textMuted}
          maxLength={ANSWER_UI_LIMITS.inputValueLength}
          keyboardType={block.inputType === 'number' ? 'decimal-pad' : 'default'}
          onChangeText={(next) => scope.setValue(block.id, next)}
          style={{
            minHeight: TARGET,
            paddingHorizontal: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceBase,
            color: colors.textPrimary,
            fontSize: typeScale.callout,
          }}
        />
      )}
      <Readout template={block.readout} scope={scope} />
    </View>
  );
}

function SecondaryButton({
  label,
  icon,
  onPress,
  colors,
  primary = false,
  disabled = false,
  busy = false,
  accessibilityRole = 'button',
  testID,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  colors: ColorScheme;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityRole?: 'button' | 'link';
  testID?: string;
}) {
  return (
    <PressableBox
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radii.lg,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.teal : colors.surfaceBase,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? <LoadingIndicator /> : icon}
      <Text
        style={{
          fontSize: typeScale.subhead,
          fontWeight: '600',
          color: primary ? colors.accentText : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </PressableBox>
  );
}

function Checklist({ block, scope }: { block: AnswerUiChecklistBlock; scope: Scope }) {
  const { colors } = scope;
  const { status, copyOrShare } = useCopyOrShare();
  const checked = (scope.values[block.id] as string[] | undefined) ?? [];
  const done = block.items.filter((item) => checked.includes(item.id)).length;
  const percent = Math.round((done / block.items.length) * 100);
  const title = block.title ?? 'Checklist';
  return (
    <Frame colors={colors} testID="answer-ui-checklist">
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
        >
          {title}
        </Text>
        <Text
          testID="answer-ui-checklist-progress"
          accessibilityLiveRegion="polite"
          style={{
            fontSize: typeScale.subhead,
            fontVariant: ['tabular-nums'],
            color: colors.textSecondary,
          }}
        >
          {`${done} of ${block.items.length} done · ${percent}%`}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${title} progress`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={{
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: colors.progressTrack,
        }}
      >
        <View
          style={{ width: `${percent}%`, height: 6, borderRadius: 3, backgroundColor: colors.teal }}
        />
      </View>
      {block.items.map((item) => {
        const isChecked = checked.includes(item.id);
        return (
          <PressableBox
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: isChecked }}
            onPress={() =>
              scope.setValue(
                block.id,
                isChecked ? checked.filter((id) => id !== item.id) : [...checked, item.id],
              )
            }
            style={{
              minHeight: TARGET,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Mark round={false} checked={isChecked} colors={colors} />
            <Text
              style={{
                flex: 1,
                fontSize: typeScale.body,
                color: isChecked ? colors.textSecondary : colors.textPrimary,
                textDecorationLine: isChecked ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </Text>
          </PressableBox>
        );
      })}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <SecondaryButton
          label={ANSWER_UI_CHECKLIST_RESET_LABEL}
          icon={<RotateCcw size={16} color={colors.textPrimary} />}
          onPress={() => scope.resetValues([block.id])}
          colors={colors}
        />
        <SecondaryButton
          label={copyControlLabel(status, ANSWER_UI_CHECKLIST_COPY_LABEL)}
          icon={<Copy size={16} color={colors.textPrimary} />}
          onPress={() => void copyOrShare(answerUiChecklistText(block, checked))}
          colors={colors}
        />
      </View>
    </Frame>
  );
}

const CALLOUT_ICONS: Record<AnswerUiCalloutTone, typeof CircleAlert> = {
  info: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
};

function calloutColor(tone: AnswerUiCalloutTone, colors: ColorScheme): string {
  if (tone === 'success') return colors.agentSuccess;
  if (tone === 'warning') return colors.agentWarning;
  if (tone === 'danger') return colors.agentError;
  return colors.teal;
}

function ListTitle({ title, colors }: { title?: string; colors: ColorScheme }) {
  if (!title) return null;
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
    >
      {title}
    </Text>
  );
}

const FILE_ICONS: Record<AnswerUiFileKind, typeof File> = {
  image: FileImage,
  json: FileBraces,
  sheet: FileSpreadsheet,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  file: File,
};

function openCardLink(url: string): void {
  void openUntrustedUrlInAppBrowser(url).then((opened) => {
    if (opened) return;
    Alert.alert('Could not open this link', 'Check your connection and try again.');
  });
}

function Markdown({ source, colors }: { source: string; colors: ColorScheme }) {
  return <View style={{ minWidth: 0 }}>{renderMarkdownContent(source, colors)}</View>;
}

function CopyReady({
  block,
  colors,
}: {
  block: Extract<AnswerUiBlock, { type: 'copy' }>;
  colors: ColorScheme;
}) {
  const { status, copyOrShare } = useCopyOrShare();
  return (
    <Frame
      colors={colors}
      testID="answer-ui-copy"
      accessibilityLabel={block.title ?? ANSWER_UI_COPY_READY_LABEL}
    >
      {block.title || block.badge ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}
        >
          <ListTitle title={block.title} colors={colors} />
          {block.badge ? <StatusPill label={block.badge} tone="neutral" colors={colors} /> : null}
        </View>
      ) : null}
      <ScrollView
        nestedScrollEnabled
        style={{
          maxHeight: 320,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceBase,
        }}
        contentContainerStyle={{ padding: spacing.md }}
      >
        <Text
          selectable
          style={{
            fontFamily: codeFontFamily,
            fontSize: typeScale.footnote,
            color: colors.textPrimary,
          }}
        >
          {block.text}
        </Text>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            primary
            label={copyControlLabel(status, block.buttonLabel)}
            icon={<Copy size={16} color={colors.accentText} />}
            onPress={() => void copyOrShare(block.text)}
            colors={colors}
          />
        </View>
        <SecondaryButton
          label="Share"
          icon={<Share2 size={16} color={colors.textPrimary} />}
          onPress={() => shareText(block.text)}
          colors={colors}
        />
      </View>
    </Frame>
  );
}

function CopyActionButton({ button, scope }: { button: AnswerUiActionButton; scope: Scope }) {
  const { status, copyOrShare } = useCopyOrShare();
  const iconColor = button.primary ? scope.colors.accentText : scope.colors.textPrimary;
  return (
    <SecondaryButton
      primary={button.primary}
      label={copyControlLabel(status, button.label)}
      icon={<Copy size={16} color={iconColor} />}
      onPress={() =>
        void copyOrShare(
          renderAnswerUiTemplate(button.template ?? '', scope.controls, scope.values),
        )
      }
      colors={scope.colors}
    />
  );
}

function BlockedReason({ scope }: { scope: Scope }) {
  if (scope.send.canSend || !scope.send.blockedReason) return null;
  return (
    <Text style={{ fontSize: typeScale.subhead, color: scope.colors.textMuted }}>
      {scope.send.blockedReason}
    </Text>
  );
}

function ActionsRow({ buttons, scope }: { buttons: AnswerUiActionButton[]; scope: Scope }) {
  const { colors } = scope;
  const sendable = scope.send.onSend !== undefined || scope.send.blockedReason !== undefined;
  const shown = buttons.filter((button) => button.action !== 'send' || sendable);
  if (shown.length === 0) return null;
  const hasSend = shown.some((button) => button.action === 'send');
  return (
    <View testID="answer-ui-actions" style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {shown.map((button) => {
          const iconColor = button.primary ? colors.accentText : colors.textPrimary;
          if (button.action === 'link') {
            const url = button.url;
            if (!url) return null;
            return (
              <SecondaryButton
                key={button.id}
                accessibilityRole="link"
                primary={button.primary}
                label={button.label}
                icon={<ExternalLink size={16} color={iconColor} />}
                onPress={() => openCardLink(url)}
                colors={colors}
              />
            );
          }
          if (button.action === 'copy') {
            return <CopyActionButton key={button.id} button={button} scope={scope} />;
          }
          if (button.action === 'reset') {
            return (
              <SecondaryButton
                key={button.id}
                primary={button.primary}
                label={button.label}
                icon={<RotateCcw size={16} color={iconColor} />}
                onPress={() => scope.resetValues()}
                colors={colors}
              />
            );
          }
          return (
            <SecondaryButton
              key={button.id}
              testID={`answer-ui-send-${button.id}`}
              primary={button.primary}
              label={button.label}
              disabled={!scope.send.canSend || scope.pendingAction !== null}
              busy={scope.pendingAction === button.id}
              onPress={() => scope.runSend(button.id)}
              colors={colors}
            />
          );
        })}
      </View>
      {hasSend ? <BlockedReason scope={scope} /> : null}
    </View>
  );
}

function Suggestions({
  block,
  scope,
}: {
  block: Extract<AnswerUiBlock, { type: 'suggestions' }>;
  scope: Scope;
}) {
  const { colors } = scope;
  if (!scope.send.onSend && !scope.send.blockedReason) return null;
  return (
    <View
      testID="answer-ui-suggestions"
      accessibilityLabel="Suggested follow-ups"
      style={{ alignItems: 'flex-start', gap: spacing.sm }}
    >
      {block.items.map((item) => {
        const pending = scope.pendingAction === item.id;
        const disabled = !scope.send.canSend || scope.pendingAction !== null;
        return (
          <PressableBox
            key={item.id}
            testID={`answer-ui-send-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={item.text}
            accessibilityState={{ disabled, busy: pending }}
            disabled={disabled}
            onPress={() => scope.runSend(item.id)}
            style={{
              minHeight: TARGET,
              maxWidth: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radii.full,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {pending ? <LoadingIndicator /> : <ArrowRight size={14} color={colors.textSecondary} />}
            <Text
              style={{
                flexShrink: 1,
                fontSize: typeScale.subhead,
                fontWeight: '500',
                color: colors.textSecondary,
              }}
            >
              {item.text}
            </Text>
          </PressableBox>
        );
      })}
      <BlockedReason scope={scope} />
    </View>
  );
}

function Disclosure({
  block,
  scope,
}: {
  block: Extract<AnswerUiBlock, { type: 'disclosure' }>;
  scope: Scope;
}) {
  const { colors } = scope;
  const [open, setOpen] = useState(block.open);
  return (
    <View
      testID="answer-ui-disclosure"
      style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border }}
    >
      <PressableBox
        accessibilityRole="button"
        accessibilityLabel={block.summary}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{
          minHeight: TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: typeScale.subhead,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
        >
          {block.summary}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={16} color={colors.textSecondary} />
        </View>
      </PressableBox>
      {open ? (
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <BlockList blocks={block.blocks} scope={scope} />
        </View>
      ) : null}
    </View>
  );
}

function TableBlock({
  caption,
  accessibilityLabel,
  header,
  rows,
  colors,
  testID,
}: {
  caption?: string;
  accessibilityLabel?: string;
  header: readonly string[];
  rows: readonly (readonly string[])[];
  colors: ColorScheme;
  testID: string;
}) {
  const cellStyle = {
    minWidth: 96,
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  };
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? caption ?? 'Table'}
      style={{
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {caption ? (
        <Text
          style={{
            paddingHorizontal: spacing.md,
            paddingTop: spacing.md,
            fontSize: typeScale.subhead,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
        >
          {caption}
        </Text>
      ) : null}
      <SideScroller showsHorizontalScrollIndicator={false}>
        <View>
          <View
            accessibilityRole="header"
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: colors.borderLight,
            }}
          >
            {header.map((column, index) => (
              <Text
                key={`${index}:${column}`}
                style={{
                  ...cellStyle,
                  fontSize: typeScale.subhead,
                  fontWeight: '500',
                  color: colors.textSecondary,
                }}
              >
                {column}
              </Text>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{
                flexDirection: 'row',
                borderBottomWidth: rowIndex === rows.length - 1 ? 0 : 1,
                borderBottomColor: colors.borderLight,
              }}
            >
              {row.map((cell, cellIndex) => (
                <Text
                  key={cellIndex}
                  selectable
                  style={{
                    ...cellStyle,
                    fontSize: typeScale.subhead,
                    fontWeight: cellIndex === 0 ? '500' : '400',
                    color: colors.textPrimary,
                  }}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </SideScroller>
    </View>
  );
}

function ChartBlock({ block, scope }: { block: AnswerUiChartBlock; scope: Scope }) {
  const { colors } = scope;
  const spec = useMemo(
    () => answerUiChartSpec(block, scope.controls, scope.values),
    [block, scope.controls, scope.values],
  );
  const chart = answerUiMermaidChart(spec);
  if (chart) {
    return (
      <View testID="answer-ui-chart">
        <ReportChart chart={chart} colors={colors} />
      </View>
    );
  }
  const table = answerUiChartTable(spec);
  const dataTable = (
    <TableBlock
      testID="answer-ui-chart-table"
      accessibilityLabel={ANSWER_UI_CHART_DATA_LABEL}
      header={[table.header, ...table.series]}
      rows={table.rows.map((row) => [row.label, ...row.cells])}
      colors={colors}
    />
  );
  if (block.chart === 'scatter') {
    return (
      <View testID="answer-ui-chart">
        <AnswerUiScatter
          title={block.title}
          {...(block.xLabel ? { xLabel: block.xLabel } : {})}
          {...(block.yLabel ? { yLabel: block.yLabel } : {})}
          series={answerUiScatterSeries(spec)}
          colors={colors}
          dataTable={dataTable}
        />
      </View>
    );
  }
  return (
    <View testID="answer-ui-chart" style={{ gap: spacing.xs }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
      >
        {block.title}
      </Text>
      {dataTable}
    </View>
  );
}

function statusTone(tone: AnswerUiStatusTone | undefined): AnswerUiStatusTone {
  return tone ?? 'neutral';
}

function Block({ block, scope }: { block: AnswerUiBlock; scope: Scope }) {
  const { colors } = scope;
  switch (block.type) {
    case 'heading':
      return (
        <Text
          accessibilityRole="header"
          style={{
            fontSize: block.level === 2 ? typeScale.headline : typeScale.callout,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
        >
          {block.text}
        </Text>
      );
    case 'text':
      return (
        <View testID="answer-ui-text">
          <Markdown source={block.markdown} colors={colors} />
        </View>
      );
    case 'callout': {
      const Icon = CALLOUT_ICONS[block.tone];
      return (
        <View
          testID="answer-ui-callout"
          accessibilityRole="summary"
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceHover,
          }}
        >
          <View testID={`answer-ui-callout-${block.tone}`} style={{ paddingTop: 2 }}>
            <Icon size={16} color={calloutColor(block.tone, colors)} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {block.title ? (
              <Text
                style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.textPrimary }}
              >
                {block.title}
              </Text>
            ) : null}
            <Markdown source={block.markdown} colors={colors} />
          </View>
        </View>
      );
    }
    case 'card':
      return (
        <Frame colors={colors} testID="answer-ui-card" accessibilityLabel={block.title}>
          {block.title || block.subtitle || block.badge ? (
            <View style={{ gap: 2 }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                {block.title ? (
                  <Text
                    accessibilityRole="header"
                    style={{
                      fontSize: typeScale.callout,
                      fontWeight: '600',
                      color: colors.textPrimary,
                    }}
                  >
                    {block.title}
                  </Text>
                ) : null}
                {block.badge ? (
                  <StatusPill
                    label={block.badge}
                    tone={statusTone(block.badgeTone)}
                    colors={colors}
                  />
                ) : null}
              </View>
              {block.subtitle ? (
                <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                  {block.subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
          <BlockList blocks={block.blocks} scope={scope} />
        </Frame>
      );
    case 'columns':
      return (
        <View testID="answer-ui-columns" style={{ gap: spacing.md }}>
          {block.blocks.map((child) => (
            <Block key={child.id} block={child} scope={scope} />
          ))}
        </View>
      );
    case 'disclosure':
      return <Disclosure block={block} scope={scope} />;
    case 'table':
      return (
        <TableBlock
          testID="answer-ui-table"
          caption={block.caption}
          header={block.columns}
          rows={block.rows}
          colors={colors}
        />
      );
    case 'chart':
      return <ChartBlock block={block} scope={scope} />;
    case 'checklist':
      return <Checklist block={block} scope={scope} />;
    case 'choice':
      return <ChoiceControl block={block} scope={scope} />;
    case 'slider':
      return <SliderControl block={block} scope={scope} />;
    case 'input':
      return <InputControl block={block} scope={scope} />;
    case 'readout':
      return (
        <View
          testID="answer-ui-stat"
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
            {block.label}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            selectable
            style={{
              fontSize: typeScale.title2,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
              color: colors.textPrimary,
            }}
          >
            {renderAnswerUiTemplate(block.value, scope.controls, scope.values)}
          </Text>
        </View>
      );
    case 'gallery':
      return (
        <View testID="answer-ui-gallery" style={{ gap: spacing.md }}>
          {block.images.map((image) => (
            <View key={image.url} style={{ gap: spacing.xs }}>
              <MarkdownImage src={image.url} alt={image.alt} colors={colors} />
              {image.caption ? (
                <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                  {image.caption}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      );
    case 'map':
      return (
        <AnswerUiMap block={block} tileBaseUrl={scope.tileBaseUrl} tileAccess={scope.tileAccess} />
      );
    case 'actions':
      return <ActionsRow buttons={block.buttons} scope={scope} />;
    case 'status':
      return (
        <Frame colors={colors} testID="answer-ui-status">
          <ListTitle title={block.title} colors={colors} />
          {block.items.map((item, index) => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: spacing.md,
                paddingVertical: spacing.sm,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.borderLight,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ fontSize: typeScale.body, fontWeight: '500', color: colors.textPrimary }}
                >
                  {item.label}
                </Text>
                {item.note ? (
                  <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
              <StatusPill label={item.status} tone={item.tone} colors={colors} />
            </View>
          ))}
        </Frame>
      );
    case 'steps':
      return (
        <Frame colors={colors} testID="answer-ui-steps">
          <ListTitle title={block.title} colors={colors} />
          {block.items.map((item, index) => (
            <View key={item.id} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceBase,
                }}
              >
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                    color: colors.textPrimary,
                  }}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.body,
                      fontWeight: '600',
                      color: colors.textPrimary,
                    }}
                  >
                    {item.title}
                  </Text>
                  {item.status ? (
                    <StatusPill label={item.status} tone={statusTone(item.tone)} colors={colors} />
                  ) : null}
                </View>
                {item.text ? <Markdown source={item.text} colors={colors} /> : null}
              </View>
            </View>
          ))}
        </Frame>
      );
    case 'keyvalue':
      return (
        <Frame colors={colors} testID="answer-ui-keyvalue">
          <ListTitle title={block.title} colors={colors} />
          {block.items.map((item, index) => (
            <View key={`${index}:${item.label}`} style={{ gap: 2 }}>
              <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                {item.label}
              </Text>
              <Text
                selectable
                style={{ fontSize: typeScale.body, fontWeight: '500', color: colors.textPrimary }}
              >
                {item.value || '-'}
              </Text>
            </View>
          ))}
        </Frame>
      );
    case 'copy':
      return <CopyReady block={block} colors={colors} />;
    case 'suggestions':
      return <Suggestions block={block} scope={scope} />;
    case 'files':
      return (
        <View testID="answer-ui-files" style={{ gap: spacing.sm }}>
          <ListTitle title={block.title} colors={colors} />
          {block.items.map((item) => {
            const Icon = FILE_ICONS[answerUiFileKind(item.fileType)];
            const url = item.url;
            const content = (
              <>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radii.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceHover,
                  }}
                >
                  <Icon size={20} color={colors.textSecondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: spacing.sm,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typeScale.body,
                        fontWeight: '500',
                        color: colors.textPrimary,
                      }}
                    >
                      {item.name}
                    </Text>
                    <StatusPill label={item.fileType} tone="neutral" colors={colors} />
                    {url ? null : (
                      <StatusPill
                        label={ANSWER_UI_FILE_EXAMPLE_LABEL}
                        tone="neutral"
                        colors={colors}
                      />
                    )}
                  </View>
                  {item.description ? (
                    <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </>
            );
            const rowStyle = {
              minHeight: TARGET,
              flexDirection: 'row' as const,
              alignItems: 'center' as const,
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            };
            return url ? (
              <PressableBox
                key={item.id}
                accessibilityRole="link"
                accessibilityLabel={item.name}
                onPress={() => openCardLink(url)}
                style={rowStyle}
              >
                {content}
              </PressableBox>
            ) : (
              <View key={item.id} style={rowStyle}>
                {content}
              </View>
            );
          })}
        </View>
      );
    case 'transcript':
      return (
        <Frame colors={colors} testID="answer-ui-transcript">
          <ListTitle title={block.title} colors={colors} />
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', gap: spacing.md }}>
              {item.time ? (
                <Text
                  style={{
                    width: 48,
                    fontFamily: codeFontFamily,
                    fontSize: typeScale.caption,
                    color: colors.textMuted,
                  }}
                >
                  {item.time}
                </Text>
              ) : null}
              <Text
                selectable
                style={{ flex: 1, fontSize: typeScale.body, color: colors.textPrimary }}
              >
                {item.speaker ? (
                  <Text style={{ fontWeight: '600' }}>{`${item.speaker}: `}</Text>
                ) : null}
                {item.text}
              </Text>
            </View>
          ))}
        </Frame>
      );
  }
}

function BlockList({ blocks, scope }: { blocks: AnswerUiBlock[]; scope: Scope }) {
  return (
    <>
      {blocks.map((block) => (
        <Block key={block.id} block={block} scope={scope} />
      ))}
    </>
  );
}

export function AnswerUiCard({
  cardId,
  body,
  label,
  send,
  tileBaseUrl,
  tileAccess,
  messageId,
}: {
  cardId: string;
  body: AnswerUiCardBody;
  label: string;
  send: AnswerUiSendState;
  tileBaseUrl: string;
  tileAccess: TileAccess;
  messageId?: string;
}) {
  const colors = useThemeColors();
  const controls = useMemo(() => answerUiControls(body), [body]);
  const initialValues = useMemo(() => answerUiInitialValues(body), [body]);
  const draftKey = `answer-ui\u0000${cardId}`;
  const [values, setValues] = useAnswerDraft<Record<string, AnswerUiValue>>(
    draftKey,
    initialValues,
  );
  const draftScope = useMemo(() => (messageId ? { messageId } : null), [messageId]);
  useReportUnsavedAnswerEdit(draftScope, draftKey, answerUiValuesChanged(initialValues, values));
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { onSend, canSend } = send;

  const setValue = useCallback(
    (id: string, value: AnswerUiValue) => setValues((current) => ({ ...current, [id]: value })),
    [setValues],
  );

  const resetValues = useCallback(
    (ids?: readonly string[]) =>
      setValues((current) => {
        if (!ids) return initialValues;
        const next = { ...current };
        for (const id of ids) {
          const initial = initialValues[id];
          if (initial !== undefined) next[id] = initial;
        }
        return next;
      }),
    [initialValues, setValues],
  );

  const runSend = useCallback(
    (actionId: string) => {
      if (!onSend || !canSend || pendingAction !== null) return;
      setPendingAction(actionId);
      onSend(actionId, values)
        .catch(() => Alert.alert('Could not send', ANSWER_UI_SEND_FAILED_MESSAGE))
        .finally(() => setPendingAction(null));
    },
    [onSend, canSend, pendingAction, values],
  );

  const scope: Scope = {
    values,
    controls,
    setValue,
    resetValues,
    send,
    pendingAction,
    runSend,
    colors,
    tileBaseUrl,
    tileAccess,
  };

  return (
    <View
      testID="interactive-card-answer-ui"
      accessibilityLabel={label}
      style={{ marginTop: spacing.md, gap: spacing.lg }}
    >
      {body.title ? (
        <Text
          accessibilityRole="header"
          style={{ fontSize: typeScale.headline, fontWeight: '600', color: colors.textPrimary }}
        >
          {body.title}
        </Text>
      ) : null}
      <BlockList blocks={body.blocks} scope={scope} />
    </View>
  );
}
