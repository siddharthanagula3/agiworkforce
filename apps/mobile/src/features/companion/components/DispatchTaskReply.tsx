import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { connectorInputFieldError, type ConnectorInputField } from '@agiworkforce/client-runtime';
import type {
  DispatchTaskPendingField,
  DispatchTaskPendingStep,
  DispatchTaskReplyError,
  DispatchTaskStepReply,
} from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { replyToDispatchTask } from '@/services/companion';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const SEND_FAILED = 'Your answer was not sent. Check the Desktop connection and try again.';
const REPLY_REJECTED = 'The computer did not accept that answer. Check it and send it again.';

type InputStep = Extract<DispatchTaskPendingStep, { kind: 'input' }>;

function connectorField(field: DispatchTaskPendingField): ConnectorInputField {
  const base = { key: field.key, title: field.title, required: field.required };
  if (field.kind === 'choice') return { ...base, kind: 'choice', options: field.options ?? [] };
  return {
    ...base,
    kind: 'text',
    ...(field.format === undefined ? {} : { format: field.format }),
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  };
}

export function dispatchFieldError(
  field: DispatchTaskPendingField,
  value: string | undefined,
): string | null {
  if (
    field.kind === 'choice' &&
    value &&
    !(field.options ?? []).some((option) => option.value === value)
  ) {
    return 'Choose one of the options offered.';
  }
  return connectorInputFieldError(connectorField(field), value);
}

function ActionButton({
  label,
  accessibilityLabel,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  tone: 'approve' | 'deny';
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const approve = tone === 'approve';
  const foreground = approve ? colors.accentText : colors.agentError;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 10,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: approve
          ? pressed
            ? colors.textPrimary
            : colors.teal
          : colors.dangerSurface,
      })}
    >
      {approve ? <Check size={14} color={foreground} /> : <X size={14} color={foreground} />}
      <Text style={{ color: foreground, fontSize: typeScale.footnote, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function InputStepForm({
  step,
  disabled,
  onSubmit,
}: {
  step: InputStep;
  disabled: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const colors = useThemeColors();
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const errors = Object.fromEntries(
    step.fields.map((field) => [field.key, dispatchFieldError(field, values[field.key])]),
  );
  const valid = step.fields.every((field) => errors[field.key] === null);

  const submit = () => {
    setTouched(true);
    if (valid) onSubmit(values);
  };

  return (
    <View style={{ gap: 8 }}>
      <Text
        selectable
        style={{ color: colors.textPrimary, fontSize: typeScale.footnote, lineHeight: 19 }}
      >
        {step.message}
      </Text>
      {step.fields.map((field) => (
        <View key={field.key} style={{ gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
            {field.required ? `${field.title} (required)` : field.title}
          </Text>
          {field.kind === 'text' ? (
            <TextInput
              value={values[field.key] ?? ''}
              onChangeText={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
              editable={!disabled}
              autoCapitalize="none"
              keyboardType={
                field.format === 'email'
                  ? 'email-address'
                  : field.format === 'uri'
                    ? 'url'
                    : 'default'
              }
              {...(field.maxLength === undefined ? {} : { maxLength: field.maxLength })}
              accessibilityLabel={field.title}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.textPrimary,
              }}
            />
          ) : (
            <View accessibilityRole="radiogroup" style={{ gap: 2 }}>
              {(field.options ?? []).map((option) => {
                const selected = values[field.key] === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() =>
                      setValues((current) => ({ ...current, [field.key]: option.value }))
                    }
                    disabled={disabled}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled }}
                    accessibilityLabel={option.label}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Text
                      style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
                    >
                      {option.label}
                    </Text>
                    {selected ? <Check size={14} color={colors.textPrimary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          {touched && errors[field.key] ? (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.agentError, fontSize: typeScale.caption }}
            >
              {errors[field.key]}
            </Text>
          ) : null}
        </View>
      ))}
      <ActionButton
        label="Send answer"
        accessibilityLabel={`Send answer: ${step.message}`}
        tone="approve"
        disabled={disabled}
        onPress={submit}
      />
    </View>
  );
}

export function DispatchTaskReply({
  taskRequestId,
  steps,
  replyError,
}: {
  taskRequestId: string;
  steps: DispatchTaskPendingStep[];
  replyError?: DispatchTaskReplyError;
}) {
  const colors = useThemeColors();
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = steps.filter((step) => !sent.has(step.toolCallId));

  useEffect(() => {
    if (!replyError) return;
    setSent((current) => {
      const next = new Set(current);
      next.delete(replyError.toolCallId);
      return next;
    });
    console.warn('[dispatch] the computer rejected a reply', replyError.message);
    setError(REPLY_REJECTED);
  }, [replyError]);

  const send = async (reply: DispatchTaskStepReply) => {
    if (sending) return;
    setSending(true);
    setError(null);
    const delivered = await replyToDispatchTask(taskRequestId, [reply]);
    setSending(false);
    if (delivered) setSent((current) => new Set(current).add(reply.toolCallId));
    else setError(SEND_FAILED);
  };

  if (open.length === 0 && !error) return null;

  return (
    <View style={{ marginTop: 8, gap: 10 }}>
      {open.map((step) =>
        step.kind === 'approval' ? (
          <View key={step.toolCallId} style={{ gap: 8 }}>
            <Text
              selectable
              style={{ color: colors.textPrimary, fontSize: typeScale.footnote, lineHeight: 19 }}
            >
              {step.summary}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ActionButton
                label="Deny"
                accessibilityLabel={`Deny ${step.summary}`}
                tone="deny"
                disabled={sending}
                onPress={() =>
                  void send({ toolCallId: step.toolCallId, kind: 'approval', approved: false })
                }
              />
              <ActionButton
                label="Approve"
                accessibilityLabel={`Approve ${step.summary}`}
                tone="approve"
                disabled={sending}
                onPress={() =>
                  void send({ toolCallId: step.toolCallId, kind: 'approval', approved: true })
                }
              />
            </View>
          </View>
        ) : (
          <InputStepForm
            key={step.toolCallId}
            step={step}
            disabled={sending}
            onSubmit={(values) =>
              void send({
                toolCallId: step.toolCallId,
                kind: 'input',
                inputKey: step.inputKey,
                values,
              })
            }
          />
        ),
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.caption }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
