import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
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

function FieldInput({
  field,
  value,
  onChange,
  invalid,
  disabled,
  colors,
}: {
  field: FormField;
  value: FormValue;
  onChange: (value: FormValue) => void;
  invalid: boolean;
  disabled: boolean;
  colors: ColorScheme;
}) {
  const text = typeof value === 'string' ? value : '';
  if (field.kind === 'radio') {
    return (
      <View accessibilityRole="radiogroup" accessibilityLabel={field.label}>
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
      <View accessibilityLabel={field.label}>
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
        label={field.label}
        options={field.options.map((option) => option.label)}
        value={text}
        placeholder="Choose an option"
        onChange={onChange}
        colors={colors}
        disabled={disabled}
      />
    );
  }
  if (field.kind === 'slider') {
    const current = Number.isFinite(Number(text)) ? Number(text) : field.min;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <SliderControl
            label={field.label}
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
  return (
    <TextInput
      accessibilityLabel={field.label}
      value={text}
      onChangeText={onChange}
      editable={!disabled}
      multiline={field.kind === 'textarea'}
      placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : undefined}
      placeholderTextColor={colors.textMuted}
      keyboardType={field.kind === 'date' ? 'numbers-and-punctuation' : 'default'}
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

export function AnswerFormSurface({
  spec,
  colors,
  streaming,
  onFollowUp,
}: {
  spec: FormSpec;
  colors: ColorScheme;
  streaming: boolean;
  onFollowUp?: (text: string) => void;
}) {
  const [values, setValues] = useState<FormValue[]>(() => spec.fields.map(initialFormValue));
  const [invalid, setInvalid] = useState<number[]>([]);
  const [applied, setApplied] = useState<FormValue[] | null>(null);
  const sendUnavailable = spec.send === true && !onFollowUp;

  const change = (index: number, value: FormValue) => {
    setValues((current) => current.map((entry, position) => (position === index ? value : entry)));
    setInvalid((current) => current.filter((position) => position !== index));
  };

  const submit = () => {
    if (streaming || sendUnavailable) return;
    const errors = formFieldErrors(spec, values);
    setInvalid(errors);
    if (errors.length > 0) return;
    if (spec.send) onFollowUp?.(formSubmissionText(spec, values));
    setApplied(values.map((value) => (Array.isArray(value) ? [...value] : value)));
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
        return (
          <View key={field.label} style={{ gap: spacing.sm }}>
            <Text
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
            />
            {error ? (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.agentError, fontSize: typeScale.footnote }}
              >
                {`Enter a valid value for ${field.label}.`}
              </Text>
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
