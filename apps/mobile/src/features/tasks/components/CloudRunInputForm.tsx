import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View, type TextInput } from 'react-native';
import {
  describeMcpTool,
  type CloudAgentRun,
  type ManagedCloudAgentRunInputAnswer,
} from '@agiworkforce/cloud-contracts';
import { getToolDisplayLabel } from '@agiworkforce/types';
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
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { PressableBox } from '@/components/ui/PressableBox';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useAnswerDraft } from '@/src/features/chat/components/answerDraftStore';
import { useRevealInChat } from '@/src/features/chat/components/cards/ChatScrollIntoView';
import { formatConnectorName } from '@/src/features/settings/cloud-connectors/connectorStatus';
import { ConnectorInputDateField } from './ConnectorInputDateField';

type PendingInput = NonNullable<CloudAgentRun['pendingInput']>;

export type CloudRunInputOutcome = 'sent' | 'expired';

interface CallPrompts {
  toolCallId: string;
  name: string;
  connectorId: string;
  prompts: ConnectorInputPrompt[];
}

interface InputFormDraft {
  drafts: Record<string, ConnectorInputDraft>;
  opened: string[];
  action?: 'accept' | 'decline' | 'cancel';
}

const SUBMIT_LABEL = 'Send answer';
const CONTINUE_LABEL = 'Continue';
const DECLINE_LABEL = 'Decline';
const CANCEL_LABEL = 'Cancel';
const OPTIONAL_LABEL = '(optional)';
const NOT_SET_OPTION = 'Not set';
const OPEN_LINK_PREFIX = 'Open';
const HEADING_SUFFIX = 'needs your input';
const UNNAMED_HEADING = 'Needs your input';
const FOR_TOOL_PREFIX = 'For';
const LINK_OPENED_NOTE = 'Finish in the browser, then continue here.';
const OPEN_LINK_FIRST_NOTE = 'Open the link to continue.';
const SENT_NOTE = 'Sent. The reply continues once every request in it is answered.';
const EXPIRED_NOTE = 'This request expired.';
const PUNYCODE_WARNING =
  'This address uses characters that can imitate another site. Check the domain before you open it.';
const UNOPENABLE_LINK_NOTE = "This link can't be opened from here.";
const UNSUPPORTED_NOTE =
  'This question needs a form the phone cannot show. Answer it on the web, or decline it here.';

function draftKey(toolCallId: string, promptKey: string): string {
  return `${toolCallId}:${promptKey}`;
}

function fieldRefKey(toolCallId: string, promptKey: string, fieldKey: string): string {
  return `${draftKey(toolCallId, promptKey)}:${fieldKey}`;
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

function inputDraftStoreKey(pendingInput: PendingInput): string {
  return `tool-input\u0000${pendingInput.requestedAt}\u0000${pendingInput.toolCalls
    .map((call) => call.toolCallId)
    .join(',')}`;
}

function callHeading(call: CallPrompts): string {
  const connector =
    describeMcpTool(call.name)?.serverLabel ?? formatConnectorName(call.connectorId);
  return connector ? `${connector} ${HEADING_SUFFIX}` : UNNAMED_HEADING;
}

function callToolLabel(call: CallPrompts): string {
  return describeMcpTool(call.name)?.toolLabel ?? getToolDisplayLabel(call.name).displayName;
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  inputRef,
  onChange,
}: {
  field: ConnectorInputField;
  value: ConnectorInputDraftValue | undefined;
  error: string | null;
  disabled: boolean;
  inputRef: (input: TextInput | null) => void;
  onChange: (value: ConnectorInputDraftValue) => void;
}) {
  const colors = useThemeColors();
  const label = field.required ? field.title : `${field.title} ${OPTIONAL_LABEL}`;
  const description = field.description ? (
    <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
      {field.description}
    </Text>
  ) : null;
  const errorLine = error ? (
    <Text style={{ color: colors.agentError, fontSize: typeScale.caption }}>{error}</Text>
  ) : null;

  if (field.kind === 'boolean') {
    return (
      <View style={{ gap: 4 }}>
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
        {description}
        {errorLine}
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
    const options =
      field.kind === 'choice' && !field.required
        ? [{ value: '', label: NOT_SET_OPTION }, ...field.options]
        : field.options;
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>{label}</Text>
        {description}
        {options.map((option) => {
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
        {errorLine}
      </View>
    );
  }

  const text = typeof value === 'string' ? value : '';
  if (field.kind === 'text' && (field.format === 'date' || field.format === 'date-time')) {
    return (
      <View style={{ gap: 4 }}>
        <ConnectorInputDateField
          format={field.format}
          label={label}
          title={field.title}
          value={text}
          clearable={!field.required}
          disabled={disabled}
          error={error}
          onChange={onChange}
        />
        {description}
      </View>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <Input
        ref={inputRef}
        label={label}
        value={text}
        onChangeText={onChange}
        editable={!disabled}
        accessibilityLabel={field.title}
        error={error ?? undefined}
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
      {description}
    </View>
  );
}

function NoteLine({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'warning' }) {
  const colors = useThemeColors();
  return (
    <Text
      style={{
        color: tone === 'warning' ? colors.agentWarning : colors.textMuted,
        fontSize: typeScale.caption,
        lineHeight: 17,
      }}
    >
      {text}
    </Text>
  );
}

function LinkPrompt({
  prompt,
  opened,
  disabled,
  onOpen,
}: {
  prompt: Extract<ConnectorInputPrompt, { mode: 'url' }>;
  opened: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  const { link } = prompt;
  return (
    <View style={{ gap: 8 }}>
      {prompt.message ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}>
          {prompt.message}
        </Text>
      ) : null}
      <Text selectable style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
        {link ? (
          <>
            {link.prefix}
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{link.host}</Text>
            {link.rest}
          </>
        ) : (
          prompt.url
        )}
      </Text>
      {link?.punycode ? <NoteLine text={PUNYCODE_WARNING} tone="warning" /> : null}
      {link?.openable ? (
        <>
          <Button
            title={`${OPEN_LINK_PREFIX} ${link.host}`}
            variant="outline"
            size="sm"
            disabled={disabled}
            onPress={onOpen}
          />
          {opened ? <NoteLine text={LINK_OPENED_NOTE} /> : null}
        </>
      ) : (
        <NoteLine text={UNOPENABLE_LINK_NOTE} />
      )}
    </View>
  );
}

export function CloudRunInputForm({
  pendingInput,
  busy,
  outcome,
  sendError,
  onSubmit,
}: {
  pendingInput: PendingInput;
  busy: boolean;
  outcome?: CloudRunInputOutcome;
  sendError?: string;
  onSubmit?: (answers: ManagedCloudAgentRunInputAnswer[]) => void;
}) {
  const colors = useThemeColors();
  const calls = useMemo<CallPrompts[]>(
    () =>
      pendingInput.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        name: call.name,
        connectorId: call.connectorId,
        prompts: readConnectorInputPrompts(call.inputRequests),
      })),
    [pendingInput],
  );
  const storeKey = inputDraftStoreKey(pendingInput);
  const initial = useMemo<InputFormDraft>(
    () => ({ drafts: initialDrafts(calls), opened: [] }),
    [calls],
  );
  const [form, setForm] = useAnswerDraft<InputFormDraft>(storeKey, initial);
  const [attempts, setAttempts] = useState(0);
  const showErrors = attempts > 0;
  const reveal = useRevealInChat();
  const fieldViews = useRef(new Map<string, View>());
  const textInputs = useRef(new Map<string, TextInput>());
  const focusRequest = useRef<string | null>(null);
  const { drafts } = form;
  const opened = new Set(form.opened);
  const interactive = outcome === undefined && onSubmit !== undefined && !busy;

  const answerable =
    calls.some((call) => call.prompts.some((prompt) => prompt.mode !== 'unsupported')) &&
    calls.every((call) =>
      call.prompts.every(
        (prompt) => prompt.mode === 'form' || (prompt.mode === 'url' && prompt.link?.openable),
      ),
    );
  const asksForFields = calls.some((call) => call.prompts.some((prompt) => prompt.mode === 'form'));
  const linksOpened = calls.every((call) =>
    call.prompts.every(
      (prompt) => prompt.mode !== 'url' || opened.has(draftKey(call.toolCallId, prompt.key)),
    ),
  );

  const errorFor = (
    toolCallId: string,
    prompt: ConnectorInputPrompt,
    field: ConnectorInputField,
  ) =>
    prompt.mode === 'form'
      ? connectorInputFieldError(field, drafts[draftKey(toolCallId, prompt.key)]?.[field.key])
      : null;

  const firstInvalidField = (): string | null => {
    for (const call of calls) {
      for (const prompt of call.prompts) {
        if (prompt.mode !== 'form') continue;
        const field = prompt.fields.find(
          (candidate) => errorFor(call.toolCallId, prompt, candidate) !== null,
        );
        if (field) return fieldRefKey(call.toolCallId, prompt.key, field.key);
      }
    }
    return null;
  };

  useEffect(() => {
    const key = focusRequest.current;
    if (key === null) return;
    focusRequest.current = null;
    const fieldView = fieldViews.current.get(key);
    if (fieldView) reveal?.(fieldView);
    const textInput = textInputs.current.get(key);
    if (textInput) {
      textInput.focus();
      return;
    }
    if (fieldView) AccessibilityInfo.sendAccessibilityEvent(fieldView, 'focus');
  }, [attempts, reveal]);

  const visibleSendError = outcome === undefined ? sendError : undefined;
  useEffect(() => {
    if (visibleSendError) AccessibilityInfo.announceForAccessibility(visibleSendError);
  }, [visibleSendError]);

  const setField =
    (toolCallId: string, promptKey: string, fieldKey: string) =>
    (value: ConnectorInputDraftValue) => {
      setForm((current) => {
        const key = draftKey(toolCallId, promptKey);
        return {
          ...current,
          drafts: { ...current.drafts, [key]: { ...current.drafts[key], [fieldKey]: value } },
        };
      });
    };

  const openLink = async (
    toolCallId: string,
    prompt: Extract<ConnectorInputPrompt, { mode: 'url' }>,
  ) => {
    if (!interactive || !prompt.link?.openable) return;
    if (!(await openUntrustedUrlInAppBrowser(prompt.link.href))) return;
    const key = draftKey(toolCallId, prompt.key);
    setForm((current) =>
      current.opened.includes(key) ? current : { ...current, opened: [...current.opened, key] },
    );
  };

  const submit = () => {
    if (!interactive || !answerable || !linksOpened) return;
    const invalidField = firstInvalidField();
    if (invalidField !== null) {
      focusRequest.current = invalidField;
      setAttempts((current) => current + 1);
      return;
    }
    setForm((current) => ({ ...current, action: 'accept' }));
    onSubmit?.(
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

  const dismiss = (action: 'decline' | 'cancel') => {
    if (!interactive) return;
    setForm((current) => ({ ...current, action }));
    onSubmit?.(
      calls.map((call) => ({
        toolCallId: call.toolCallId,
        responses: dismissConnectorInput(call.prompts, action),
      })),
    );
  };

  const showFields = outcome !== 'sent' || form.action === 'accept';

  return (
    <View style={{ gap: 14 }}>
      {calls.map((call) => (
        <View key={call.toolCallId} style={{ gap: 10 }}>
          <View style={{ gap: 2 }}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
            >
              {callHeading(call)}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: colors.textMuted, fontSize: typeScale.caption }}
            >
              {`${FOR_TOOL_PREFIX} ${callToolLabel(call)}`}
            </Text>
          </View>
          {showFields
            ? call.prompts.map((prompt) => {
                if (prompt.mode === 'unsupported') {
                  return <NoteLine key={prompt.key} text={UNSUPPORTED_NOTE} />;
                }
                if (prompt.mode === 'url') {
                  return (
                    <LinkPrompt
                      key={prompt.key}
                      prompt={prompt}
                      opened={opened.has(draftKey(call.toolCallId, prompt.key))}
                      disabled={!interactive}
                      onOpen={() => void openLink(call.toolCallId, prompt)}
                    />
                  );
                }
                return (
                  <View key={prompt.key} style={{ gap: 10 }}>
                    {prompt.message ? (
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: typeScale.footnote,
                          lineHeight: 19,
                        }}
                      >
                        {prompt.message}
                      </Text>
                    ) : null}
                    {prompt.fields.map((field) => {
                      const refKey = fieldRefKey(call.toolCallId, prompt.key, field.key);
                      return (
                        <View
                          key={field.key}
                          testID={`connector-input-field-${refKey}`}
                          ref={(view) => {
                            if (view) fieldViews.current.set(refKey, view);
                            else fieldViews.current.delete(refKey);
                          }}
                        >
                          <FieldInput
                            field={field}
                            value={drafts[draftKey(call.toolCallId, prompt.key)]?.[field.key]}
                            error={showErrors ? errorFor(call.toolCallId, prompt, field) : null}
                            disabled={!interactive}
                            inputRef={(input) => {
                              if (input) textInputs.current.set(refKey, input);
                              else textInputs.current.delete(refKey);
                            }}
                            onChange={setField(call.toolCallId, prompt.key, field.key)}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              })
            : null}
        </View>
      ))}
      {outcome === 'sent' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}
        >
          {SENT_NOTE}
        </Text>
      ) : outcome === 'expired' || onSubmit ? (
        <View style={{ gap: 8 }}>
          {outcome === undefined && answerable && !linksOpened ? (
            <NoteLine text={OPEN_LINK_FIRST_NOTE} />
          ) : null}
          {visibleSendError ? (
            <Text
              testID="tool-input.send-error"
              accessibilityLiveRegion="polite"
              style={{ color: colors.agentError, fontSize: typeScale.caption, lineHeight: 17 }}
            >
              {visibleSendError}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {answerable ? (
              <Button
                title={asksForFields ? SUBMIT_LABEL : CONTINUE_LABEL}
                loading={busy}
                disabled={!interactive || !linksOpened}
                onPress={submit}
                style={{ flexGrow: 1 }}
              />
            ) : null}
            <Button
              title={DECLINE_LABEL}
              variant="outline"
              disabled={!interactive}
              onPress={() => dismiss('decline')}
              style={{ flexGrow: 1 }}
            />
            <Button
              title={CANCEL_LABEL}
              variant="ghost"
              disabled={!interactive}
              onPress={() => dismiss('cancel')}
              style={{ flexGrow: 1 }}
            />
          </View>
          {outcome === 'expired' ? (
            <Text
              testID="tool-input.expired-note"
              accessibilityLiveRegion="polite"
              style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}
            >
              {EXPIRED_NOTE}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
