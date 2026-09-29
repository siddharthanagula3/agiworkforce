import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import type { CloudAgentRun, ManagedCloudAgentRunInputAnswer } from '@agiworkforce/cloud-contracts';
import {
  acceptConnectorInput,
  connectorInputFieldError,
  dismissConnectorInput,
  initialConnectorInputDraft,
  readConnectorInputPrompts,
  type ConnectorInputDraft,
  type ConnectorInputDraftValue,
  type ConnectorInputField,
  type ConnectorInputPrompt,
} from '@agiworkforce/client-runtime';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PressableBox } from '@/components/ui/pressable-box';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

type PendingInput = NonNullable<CloudAgentRun['pendingInput']>;

interface CallPrompts {
  toolCallId: string;
  name: string;
  prompts: ConnectorInputPrompt[];
}

const SUBMIT_LABEL = 'Send answer';
const DECLINE_LABEL = 'Decline';
const OPEN_LINK_LABEL = 'Open link';
const PUNYCODE_WARNING =
  'This address uses characters that can imitate another site. Check the domain before you open it.';
const UNOPENABLE_LINK_NOTE = "This link can't be opened from here.";
const UNSUPPORTED_NOTE =
  'This question needs a form the phone cannot show. Answer it on the web, or decline it here.';
const DATE_TIME_PLACEHOLDER = 'YYYY-MM-DDTHH:MM';
const DATE_PLACEHOLDER = 'YYYY-MM-DD';

function draftKey(toolCallId: string, promptKey: string): string {
  return `${toolCallId}:${promptKey}`;
}

function initialDrafts(calls: readonly CallPrompts[]): Record<string, ConnectorInputDraft> {
  const drafts: Record<string, ConnectorInputDraft> = {};
  for (const call of calls) {
    for (const prompt of call.prompts) {
      if (prompt.mode === 'form') {
        drafts[draftKey(call.toolCallId, prompt.key)] = initialConnectorInputDraft(prompt.fields);
      }
    }
  }
  return drafts;
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: ConnectorInputField;
  value: ConnectorInputDraftValue | undefined;
  error: string | null;
  disabled: boolean;
  onChange: (value: ConnectorInputDraftValue) => void;
}) {
  const colors = useThemeColors();
  const label = field.required ? `${field.title} *` : field.title;

  if (field.kind === 'boolean') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, flex: 1 }}>
          {label}
        </Text>
        <Switch
          value={value === true}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={field.title}
        />
      </View>
    );
  }

  if (field.kind === 'choice' || field.kind === 'choices') {
    const selected = field.kind === 'choices' ? (Array.isArray(value) ? value : []) : [value];
    const toggle = (option: string) => {
      if (field.kind === 'choice') {
        onChange(option);
        return;
      }
      const current = Array.isArray(value) ? value : [];
      onChange(
        current.includes(option)
          ? current.filter((entry) => entry !== option)
          : [...current, option],
      );
    };
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>{label}</Text>
        {field.options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <PressableBox
              key={option.value}
              onPress={() => toggle(option.value)}
              disabled={disabled}
              accessibilityRole={field.kind === 'choice' ? 'radio' : 'checkbox'}
              accessibilityState={{ checked, disabled }}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: checked ? colors.teal : colors.border,
                backgroundColor: colors.surfaceElevated,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>
                {option.label}
              </Text>
            </PressableBox>
          );
        })}
        {error ? (
          <Text style={{ color: colors.agentError, fontSize: typeScale.caption }}>{error}</Text>
        ) : null}
      </View>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const placeholder =
    field.kind === 'text' && field.format === 'date-time'
      ? DATE_TIME_PLACEHOLDER
      : field.kind === 'text' && field.format === 'date'
        ? DATE_PLACEHOLDER
        : undefined;
  return (
    <View style={{ gap: 4 }}>
      <Input
        label={label}
        value={text}
        onChangeText={onChange}
        editable={!disabled}
        accessibilityLabel={field.title}
        error={error ?? undefined}
        {...(placeholder ? { placeholder } : {})}
        keyboardType={
          field.kind === 'number'
            ? 'numeric'
            : field.kind === 'text' && field.format === 'email'
              ? 'email-address'
              : field.kind === 'text' && field.format === 'uri'
                ? 'url'
                : 'default'
        }
        autoCapitalize={field.kind === 'text' && field.format ? 'none' : 'sentences'}
        {...(field.kind === 'text' && field.maxLength !== undefined
          ? { maxLength: field.maxLength }
          : {})}
      />
      {field.description ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {field.description}
        </Text>
      ) : null}
    </View>
  );
}

export function CloudRunInputForm({
  pendingInput,
  busy,
  onSubmit,
}: {
  pendingInput: PendingInput;
  busy: boolean;
  onSubmit: (answers: ManagedCloudAgentRunInputAnswer[]) => void;
}) {
  const colors = useThemeColors();
  const calls = useMemo<CallPrompts[]>(
    () =>
      pendingInput.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        name: call.name,
        prompts: readConnectorInputPrompts(call.inputRequests),
      })),
    [pendingInput],
  );
  const [drafts, setDrafts] = useState(() => initialDrafts(calls));
  const [showErrors, setShowErrors] = useState(false);
  const answerable = calls.some((call) =>
    call.prompts.some((prompt) => prompt.mode !== 'unsupported'),
  );

  const errorFor = (
    toolCallId: string,
    prompt: ConnectorInputPrompt,
    field: ConnectorInputField,
  ) =>
    prompt.mode === 'form'
      ? connectorInputFieldError(field, drafts[draftKey(toolCallId, prompt.key)]?.[field.key])
      : null;

  const hasErrors = calls.some((call) =>
    call.prompts.some(
      (prompt) =>
        prompt.mode === 'form' &&
        prompt.fields.some((field) => errorFor(call.toolCallId, prompt, field) !== null),
    ),
  );

  const setField =
    (toolCallId: string, promptKey: string, fieldKey: string) =>
    (value: ConnectorInputDraftValue) =>
      setDrafts((current) => {
        const key = draftKey(toolCallId, promptKey);
        return { ...current, [key]: { ...current[key], [fieldKey]: value } };
      });

  const submit = () => {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    onSubmit(
      calls.map((call) => ({
        toolCallId: call.toolCallId,
        responses: acceptConnectorInput(
          call.prompts,
          Object.fromEntries(
            call.prompts.map((prompt) => [
              prompt.key,
              drafts[draftKey(call.toolCallId, prompt.key)] ?? {},
            ]),
          ),
        ),
      })),
    );
  };

  const decline = () => {
    onSubmit(
      calls.map((call) => ({
        toolCallId: call.toolCallId,
        responses: dismissConnectorInput(call.prompts, 'decline'),
      })),
    );
  };

  return (
    <View style={{ gap: 14 }}>
      {calls.map((call) => (
        <View key={call.toolCallId} style={{ gap: 10 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}
          >
            {call.name}
          </Text>
          {call.prompts.map((prompt) => {
            if (prompt.mode === 'unsupported') {
              return (
                <Text
                  key={prompt.key}
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.caption,
                    lineHeight: 18,
                  }}
                >
                  {UNSUPPORTED_NOTE}
                </Text>
              );
            }
            if (prompt.mode === 'url') {
              return (
                <View key={prompt.key} style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.footnote,
                      lineHeight: 19,
                    }}
                  >
                    {prompt.message}
                  </Text>
                  <Text selectable style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                    {prompt.link ? (
                      <>
                        {prompt.link.prefix}
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                          {prompt.link.host}
                        </Text>
                        {prompt.link.rest}
                      </>
                    ) : (
                      prompt.url
                    )}
                  </Text>
                  {prompt.link?.punycode ? (
                    <Text
                      style={{
                        color: colors.agentWarning,
                        fontSize: typeScale.caption,
                        lineHeight: 17,
                      }}
                    >
                      {PUNYCODE_WARNING}
                    </Text>
                  ) : null}
                  {prompt.link && !prompt.link.openable ? (
                    <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                      {UNOPENABLE_LINK_NOTE}
                    </Text>
                  ) : null}
                  {prompt.link?.openable ? (
                    <Button
                      title={OPEN_LINK_LABEL}
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onPress={() => {
                        if (prompt.link) void Linking.openURL(prompt.link.href);
                      }}
                    />
                  ) : null}
                </View>
              );
            }
            return (
              <View key={prompt.key} style={{ gap: 10 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    lineHeight: 19,
                  }}
                >
                  {prompt.message}
                </Text>
                {prompt.fields.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={drafts[draftKey(call.toolCallId, prompt.key)]?.[field.key]}
                    error={showErrors ? errorFor(call.toolCallId, prompt, field) : null}
                    disabled={busy}
                    onChange={setField(call.toolCallId, prompt.key, field.key)}
                  />
                ))}
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {answerable ? (
          <Button
            title={SUBMIT_LABEL}
            loading={busy}
            disabled={busy}
            onPress={submit}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          title={DECLINE_LABEL}
          variant="outline"
          disabled={busy}
          onPress={decline}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
