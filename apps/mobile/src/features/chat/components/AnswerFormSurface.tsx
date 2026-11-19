import { createRef, useEffect, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, Platform, TextInput, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import {
  formFieldErrors,
  formSubmissionText,
  formValueText,
  initialFormValue,
  type FormField,
  type FormSpec,
  type FormValue,
} from '@agiworkforce/unified-chat/assistant-fence';
import { ChoiceRow, SelectControl, SliderControl } from './AnswerSurfaceKit';
import {
  answerDraftKey,
  useAssistantDraftScope,
  useReportUnsavedAnswerEdit,
} from './AssistantDraftScope';
import { useAnswerDraft } from './answerDraftStore';
import { useRevealFocusedField, useRevealInChat } from './cards/ChatScrollIntoView';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
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

function shownDate(value: string): string | null {
  if (!ISO_DATE.test(value)) return value || null;
  return pickerDate(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DateField({
  label,
  value,
  onChange,
  invalid,
  disabled,
  clearable,
  colors,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled: boolean;
  clearable: boolean;
  colors: ColorScheme;
}) {
  const [open, setOpen] = useState(false);
  const shown = shownDate(value);
  const pick = (_event: DateTimePickerChangeEvent, date: Date) => onChange(isoDate(date));
  const toggle = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: pickerDate(value), mode: 'date', onValueChange: pick });
      return;
    }
    setOpen((current) => !current);
  };
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <PressableBox
          onPress={toggle}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${shown ?? 'not set'}`}
          accessibilityHint="Opens a date picker"
          accessibilityState={{ disabled, ...(Platform.OS === 'ios' ? { expanded: open } : {}) }}
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            borderWidth: 1,
            borderColor: invalid ? colors.agentError : colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <CalendarDays size={16} color={colors.textMuted} />
          <Text
            style={{
              color: shown ? colors.textPrimary : colors.textMuted,
              fontSize: typeScale.body,
            }}
          >
            {shown ?? 'Choose a date'}
          </Text>
        </PressableBox>
        {clearable && value && !disabled ? (
          <PressableBox
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>Clear</Text>
          </PressableBox>
        ) : null}
      </View>
      {Platform.OS === 'ios' && open && !disabled ? (
        <DateTimePicker
          testID="answer-form-date-picker"
          value={pickerDate(value)}
          mode="date"
          display="inline"
          onValueChange={pick}
        />
      ) : null}
    </View>
  );
}

function spokenLabel(field: FormField): string {
  return field.required ? `${field.label}, required` : field.label;
}

function FieldInput({
  field,
  value,
  onChange,
  invalid,
  disabled,
  colors,
  inputRef,
  containerRef,
}: {
  field: FormField;
  value: FormValue;
  onChange: (value: FormValue) => void;
  invalid: boolean;
  disabled: boolean;
  colors: ColorScheme;
  inputRef: (input: TextInput | null) => void;
  containerRef: RefObject<View | null>;
}) {
  const text = typeof value === 'string' ? value : '';
  const revealOnFocus = useRevealFocusedField(
    containerRef,
    field.kind === 'textarea' ? 'end' : 'start',
  );
  if (field.kind === 'radio') {
    return (
      <View accessibilityRole="radiogroup" accessibilityLabel={spokenLabel(field)}>
        {field.options.map((option) => (
          <ChoiceRow
            key={option.label}
            kind="radio"
            label={option.label}
            checked={value === option.label}
            onPress={() => onChange(option.label)}
            colors={colors}
            disabled={disabled}
          />
        ))}
      </View>
    );
  }
  if (field.kind === 'checks') {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <View accessibilityLabel={spokenLabel(field)}>
        {field.options.map((option) => (
          <ChoiceRow
            key={option.label}
            kind="checkbox"
            label={option.label}
            checked={chosen.includes(option.label)}
            onPress={() =>
              onChange(
                chosen.includes(option.label)
                  ? chosen.filter((choice) => choice !== option.label)
                  : [...chosen, option.label],
              )
            }
            colors={colors}
            disabled={disabled}
          />
        ))}
      </View>
    );
  }
  if (field.kind === 'select') {
    return (
      <SelectControl
        label={spokenLabel(field)}
        options={field.options.map((option) => option.label)}
        value={text}
        placeholder="Choose an option"
        onChange={onChange}
        colors={colors}
        disabled={disabled}
        {...(field.required ? {} : { clearLabel: 'None' })}
      />
    );
  }
  if (field.kind === 'slider') {
    const current = Number.isFinite(Number(text)) ? Number(text) : field.min;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <SliderControl
            label={spokenLabel(field)}
            min={field.min}
            max={field.max}
            value={current}
            onChange={(next) => onChange(String(next))}
            colors={colors}
            disabled={disabled}
            valueText={formValueText(field, text)}
          />
        </View>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typeScale.body,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formValueText(field, text)}
        </Text>
      </View>
    );
  }
  if (field.kind === 'date') {
    return (
      <DateField
        label={spokenLabel(field)}
        value={text}
        onChange={onChange}
        invalid={invalid}
        disabled={disabled}
        clearable={!field.required}
        colors={colors}
      />
    );
  }
  return (
    <TextInput
      ref={inputRef}
      accessibilityLabel={spokenLabel(field)}
      value={text}
      onChangeText={onChange}
      onFocus={revealOnFocus.onFocus}
      onBlur={revealOnFocus.onBlur}
      onContentSizeChange={revealOnFocus.onContentSizeChange}
      editable={!disabled}
      multiline={field.kind === 'textarea'}
      style={{
        minHeight: field.kind === 'textarea' ? 88 : 44,
        borderWidth: 1,
        borderColor: invalid ? colors.agentError : colors.border,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        color: colors.textPrimary,
        fontSize: typeScale.body,
        textAlignVertical: field.kind === 'textarea' ? 'top' : 'center',
      }}
    />
  );
}

interface FormDraft {
  values: FormValue[];
  invalid: number[];
  applied: FormValue[] | null;
}

export function AnswerFormSurface({
  source,
  spec,
  colors,
  streaming,
  onFollowUp,
}: {
  source: string;
  spec: FormSpec;
  colors: ColorScheme;
  streaming: boolean;
  onFollowUp?: (text: string) => void;
}) {
  const scope = useAssistantDraftScope();
  const [initial] = useState<FormDraft>(() => ({
    values: spec.fields.map(initialFormValue),
    invalid: [],
    applied: null,
  }));
  const draftKey = answerDraftKey(scope, 'form', source);
  const [draft, setDraft] = useAnswerDraft(draftKey, initial);
  const { values, invalid, applied } = draft;
  const baseline = applied ?? initial.values;
  useReportUnsavedAnswerEdit(
    scope,
    draftKey,
    values.some((value, index) => JSON.stringify(value) !== JSON.stringify(baseline[index])),
  );
  const reveal = useRevealInChat();
  const fieldViews = useRef<RefObject<View | null>[]>([]);
  const errorTexts = useRef<(View | null)[]>([]);
  const inputs = useRef<(TextInput | null)[]>([]);
  const focusRequest = useRef<number | null>(null);
  const sendUnavailable = spec.send === true && !onFollowUp;

  const change = (index: number, value: FormValue) => {
    setDraft((current) => ({
      ...current,
      values: current.values.map((entry, position) => (position === index ? value : entry)),
      invalid: current.invalid.filter((position) => position !== index),
    }));
  };

  useEffect(() => {
    const index = focusRequest.current;
    if (index === null) return;
    focusRequest.current = null;
    const fieldView = fieldViews.current[index]?.current;
    if (fieldView) reveal?.(fieldView);
    inputs.current[index]?.focus();
    const message = errorTexts.current[index];
    if (message) AccessibilityInfo.sendAccessibilityEvent(message, 'focus');
  }, [invalid, reveal]);

  const submit = () => {
    if (streaming || sendUnavailable) return;
    const errors = formFieldErrors(spec, values);
    if (errors.length > 0) {
      focusRequest.current = errors[0] ?? null;
      setDraft((current) => ({ ...current, invalid: errors }));
      return;
    }
    if (spec.send) onFollowUp?.(formSubmissionText(spec, values));
    setDraft((current) => ({
      ...current,
      invalid: [],
      applied: values.map((value) => (Array.isArray(value) ? [...value] : value)),
    }));
  };

  return (
    <View
      testID="answer-surface-form"
      accessibilityLabel={spec.title}
      style={{ marginVertical: spacing.md, gap: spacing.xl }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
      >
        {spec.title}
      </Text>
      {spec.fields.map((field, index) => {
        const error = invalid.includes(index);
        const fieldView = (fieldViews.current[index] ??= createRef<View>());
        return (
          <View
            key={field.label}
            ref={fieldView}
            testID={`answer-form-field-${index}`}
            style={{ gap: spacing.sm }}
          >
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '500' }}
            >
              {field.label}
              {field.required ? ' *' : ''}
            </Text>
            <FieldInput
              field={field}
              value={values[index] ?? ''}
              onChange={(value) => change(index, value)}
              invalid={error}
              disabled={streaming}
              colors={colors}
              containerRef={fieldView}
              inputRef={(input) => {
                inputs.current[index] = input;
              }}
            />
            {error ? (
              <View
                ref={(view) => {
                  errorTexts.current[index] = view;
                }}
                testID={`answer-form-error-${index}`}
                accessible
                accessibilityRole="alert"
              >
                <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
                  {`Enter a valid value for ${field.label}.`}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={{ gap: spacing.sm }}>
        <Button
          title={spec.send ? `${spec.submit} (send to chat)` : spec.submit}
          onPress={submit}
          disabled={streaming || sendUnavailable}
        />
        {spec.send ? (
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
            {sendUnavailable
              ? 'Submitting to chat is unavailable in this view.'
              : 'Selected values will be sent as your next message.'}
          </Text>
        ) : null}
      </View>
      {applied ? (
        <View
          accessibilityRole="summary"
          accessibilityLabel="Applied values"
          style={{
            gap: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
            paddingTop: spacing.lg,
          }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            Applied values
          </Text>
          {spec.fields.map((field, index) => (
            <View key={field.label}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                {field.label}
              </Text>
              <Text selectable style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
                {formValueText(field, applied[index] ?? '') || 'None'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
