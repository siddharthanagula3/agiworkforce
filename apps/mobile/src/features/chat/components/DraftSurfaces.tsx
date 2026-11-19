import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Share,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Maximize2, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import type { ColorScheme } from '@/src/ui/theme';
import { chatTypography, radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import {
  emailMailtoLink,
  emailPlainText,
  type EmailDraft,
  type EmailField,
} from '@agiworkforce/unified-chat/rich-blocks';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { classifyExternalLink } from '@/src/features/chat/utils/externalUrls';
import {
  AssistantFenceEditError,
  type AssistantFenceEditRequest,
} from '@/src/features/chat/services/assistantFenceEditRequest';
import { openAssistantLink } from './MarkdownInline';
import { useRevealFocusedField } from './cards/ChatScrollIntoView';
import { moveAnswerDraft, useAnswerDraft, writeAnswerDraft } from './answerDraftStore';
import {
  answerDraftKey,
  useAssistantDraftScope,
  useReportUnsavedAnswerEdit,
  type AssistantDraftScopeValue,
} from './AssistantDraftScope';

export const PREVIEW_EDIT_NOTICE = 'Edits stay in this preview. Copy or share to keep them.';
const SAVE_FAILED = 'Changes could not be saved. Your draft is kept here; try again.';
const DISCARD_TITLE = 'Discard unsaved changes?';
const DISCARD_MESSAGE = 'Your unsaved changes to this draft will be lost.';
const MAIL_BODY_COPIED =
  'This message is too long for a mail link, so it was copied. Paste it into the new email.';
const MAIL_BODY_NOT_COPIED =
  'This message is too long for a mail link and could not be copied, so Mail was not opened. Try again.';
const ICON_TARGET = 44;

const FIELD_LABELS: Record<EmailField, string> = {
  to: 'To',
  cc: 'Cc',
  bcc: 'Bcc',
  subject: 'Subject',
};

function confirmDiscard(onDiscard: () => void): void {
  Alert.alert(DISCARD_TITLE, DISCARD_MESSAGE, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard changes', style: 'destructive', onPress: onDiscard },
  ]);
}

function messageOf(key: string | null): string | undefined {
  return key?.split('\u0000', 1)[0];
}

function useCarriedDraft(key: string | null): RefObject<string | null> {
  const committed = useRef(key);
  useLayoutEffect(() => {
    const from = committed.current;
    committed.current = key;
    if (from && key && messageOf(from) === messageOf(key)) moveAnswerDraft(from, key);
  }, [key]);
  return committed;
}

function clearCommittedDraft(committed: RefObject<string | null>): void {
  if (committed.current) writeAnswerDraft(committed.current, undefined);
}

function useDraftSave(scope: AssistantDraftScopeValue | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveFenceEdit = scope?.saveFenceEdit;
  const save = async (request: AssistantFenceEditRequest): Promise<boolean> => {
    if (!saveFenceEdit || saving) return false;
    setSaving(true);
    setError(null);
    try {
      await saveFenceEdit(request);
      return true;
    } catch (failure) {
      setError(failure instanceof AssistantFenceEditError ? failure.message : SAVE_FAILED);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, error, canPersist: Boolean(saveFenceEdit) };
}

function DraftAction({
  label,
  onPress,
  color,
  disabled = false,
  selected,
}: {
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <PressableBox
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      style={{
        minWidth: ICON_TARGET,
        minHeight: ICON_TARGET,
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color, fontSize: typeScale.footnote }}>{label}</Text>
    </PressableBox>
  );
}

function CopyAndShare({ label, text, color }: { label: string; text: string; color: string }) {
  const { status, copy } = useCopyAction();
  const share = () => {
    void Share.share({ message: text }).catch(() => {
      Alert.alert(
        'Could not share',
        'Sharing is not available right now. Try again, or copy this.',
      );
    });
  };
  return (
    <>
      <DraftAction
        label={copyControlLabel(status, label)}
        onPress={() => void copy(text)}
        color={color}
      />
      <DraftAction label="Share" onPress={share} color={color} />
    </>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
      {children}
    </View>
  );
}

function StatusLine({
  text,
  tone,
  colors,
}: {
  text: string;
  tone: 'error' | 'info';
  colors: ColorScheme;
}) {
  return (
    <Text
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={{
        color: tone === 'error' ? colors.agentError : colors.textSecondary,
        fontSize: typeScale.footnote,
      }}
    >
      {text}
    </Text>
  );
}

function EditFooter({
  canPersist,
  dirty,
  saving,
  onSave,
  onCancel,
  colors,
}: {
  canPersist: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  colors: ColorScheme;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: spacing.md,
      }}
    >
      {canPersist ? (
        <Button
          title={saving ? 'Saving…' : 'Save changes'}
          size="sm"
          onPress={onSave}
          disabled={!dirty || saving}
        />
      ) : dirty ? (
        <Text style={{ flexShrink: 1, color: colors.textMuted, fontSize: typeScale.footnote }}>
          {PREVIEW_EDIT_NOTICE}
        </Text>
      ) : null}
      <DraftAction
        label="Cancel"
        onPress={onCancel}
        color={colors.textSecondary}
        disabled={saving}
      />
    </View>
  );
}

function cardStyle(colors: ColorScheme) {
  return {
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceElevated,
  } as const;
}

interface EmailDraftState {
  edits: Partial<EmailDraft>;
  dirty: boolean;
  showEmpty: boolean;
}

const UNEDITED_EMAIL: EmailDraftState = { edits: {}, dirty: false, showEmpty: false };

function EmailFieldRow({
  field,
  value,
  onChange,
  onFocus,
  onBlur,
  readOnly,
  colors,
}: {
  field: EmailField;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  readOnly: boolean;
  colors: ColorScheme;
}) {
  const row = useRef<View>(null);
  const revealOnFocus = useRevealFocusedField(row);
  return (
    <View
      ref={row}
      collapsable={false}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
      }}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 56,
          paddingVertical: spacing.md,
          color: colors.textSecondary,
          fontSize: typeScale.subhead,
        }}
      >
        {FIELD_LABELS[field]}
      </Text>
      <TextInput
        accessibilityLabel={FIELD_LABELS[field]}
        value={value}
        onChangeText={onChange}
        onFocus={() => {
          onFocus();
          revealOnFocus.onFocus();
        }}
        onBlur={() => {
          onBlur();
          revealOnFocus.onBlur();
        }}
        onContentSizeChange={revealOnFocus.onContentSizeChange}
        editable={!readOnly}
        autoComplete="off"
        {...(field === 'subject'
          ? {
              multiline: true,
              submitBehavior: 'blurAndSubmit' as const,
              returnKeyType: 'done' as const,
            }
          : {
              keyboardType: 'email-address' as const,
              autoCapitalize: 'none' as const,
              autoCorrect: false,
              spellCheck: false,
            })}
        style={{
          ...chatTypography.writingSubject,
          flex: 1,
          color: colors.textPrimary,
          minHeight: 44,
          paddingVertical: spacing.sm,
        }}
      />
    </View>
  );
}

export function EmailDraftSurface({
  draft: source,
  identity,
  colors,
  streaming,
}: {
  draft: EmailDraft;
  identity: string;
  colors: ColorScheme;
  streaming: boolean;
}) {
  const scope = useAssistantDraftScope();
  const key = answerDraftKey(scope, 'email', identity);
  const [state, setState, reset] = useAnswerDraft(key, UNEDITED_EMAIL);
  useReportUnsavedAnswerEdit(scope, key, state.dirty);
  const { save, saving, error, canPersist } = useDraftSave(scope);
  const committedKey = useCarriedDraft(key);
  const [focused, setFocused] = useState<EmailField | null>(null);
  const [mailNotice, setMailNotice] = useState<'copied' | 'failed' | null>(null);
  const mailCopy = useCopyAction();
  const bodyArea = useRef<View>(null);
  const bodyReveal = useRevealFocusedField(bodyArea, 'end');
  const draft: EmailDraft = { ...source, ...state.edits };
  const readOnly = streaming || saving;

  const edit = (field: keyof EmailDraft) => (value: string) =>
    setState((current) => ({
      ...current,
      dirty: true,
      edits: {
        ...current.edits,
        [field]: field === 'subject' ? value.replace(/[\r\n]/g, '') : value,
      },
    }));

  const shown = (['to', 'cc', 'bcc', 'subject'] as const).filter(
    (field) =>
      field === 'to' ||
      field === 'subject' ||
      draft[field].trim() !== '' ||
      (state.showEmpty && !streaming) ||
      focused === field,
  );

  const openInMail = async () => {
    const link = emailMailtoLink(draft);
    if (classifyExternalLink(link.href) !== 'system-intent') {
      Alert.alert(
        'Could not open Mail',
        'This draft is too long for a mail link. Copy it instead.',
      );
      return;
    }
    if (link.bodyIncluded) {
      setMailNotice(null);
    } else {
      const copied = await mailCopy.copy(draft.body);
      setMailNotice(copied ? 'copied' : 'failed');
      if (!copied) return;
    }
    openAssistantLink(link.href);
  };

  const commit = () => {
    const content = emailPlainText(draft);
    void save({ language: 'email', identity, content }).then((saved) => {
      if (!saved) return;
      reset();
      clearCommittedDraft(committedKey);
    });
  };

  return (
    <View testID="answer-surface-email" accessibilityLabel="Email" style={cardStyle(colors)}>
      <Text style={{ ...chatTypography.writingSubject, color: colors.textSecondary }}>Email</Text>
      {shown.map((field) => (
        <EmailFieldRow
          key={field}
          field={field}
          value={draft[field]}
          onChange={edit(field)}
          onFocus={() => setFocused(field)}
          onBlur={() => setFocused(null)}
          readOnly={readOnly}
          colors={colors}
        />
      ))}
      <View ref={bodyArea} collapsable={false}>
        <TextInput
          accessibilityLabel="Message"
          value={draft.body}
          onChangeText={edit('body')}
          onFocus={bodyReveal.onFocus}
          onBlur={bodyReveal.onBlur}
          onContentSizeChange={bodyReveal.onContentSizeChange}
          editable={!readOnly}
          multiline
          style={{
            ...chatTypography.body,
            color: colors.textPrimary,
            minHeight: 44,
            textAlignVertical: 'top',
          }}
        />
      </View>
      {streaming ? null : (
        <ActionRow>
          <CopyAndShare
            label="Copy email"
            text={emailPlainText(draft)}
            color={colors.textSecondary}
          />
          <DraftAction
            label="Edit"
            selected={state.showEmpty}
            onPress={() => setState((current) => ({ ...current, showEmpty: !current.showEmpty }))}
            color={colors.textSecondary}
          />
          <DraftAction
            label="Open in Mail"
            onPress={() => void openInMail()}
            color={colors.textSecondary}
          />
        </ActionRow>
      )}
      {error ? <StatusLine text={error} tone="error" colors={colors} /> : null}
      {mailNotice ? (
        <StatusLine
          text={mailNotice === 'copied' ? MAIL_BODY_COPIED : MAIL_BODY_NOT_COPIED}
          tone={mailNotice === 'copied' ? 'info' : 'error'}
          colors={colors}
        />
      ) : null}
      {state.dirty && !streaming ? (
        <EditFooter
          canPersist={canPersist}
          dirty={state.dirty}
          saving={saving}
          onSave={commit}
          onCancel={() => confirmDiscard(reset)}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

interface WritingDraftState {
  edited: string | null;
  editing: boolean;
}

const UNEDITED_WRITING: WritingDraftState = { edited: null, editing: false };

function WritingExpandSheet({
  visible,
  label,
  copyLabel,
  text,
  readOnly,
  showSave,
  saving,
  error,
  onChange,
  onSave,
  onClose,
  colors,
}: {
  visible: boolean;
  label: string;
  copyLabel: string;
  text: string;
  readOnly: boolean;
  showSave: boolean;
  saving: boolean;
  error: string | null;
  onChange: (text: string) => void;
  onSave: () => void;
  onClose: () => void;
  colors: ColorScheme;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <SafeAreaView
        testID="writing-expand-sheet"
        style={{ flex: 1, backgroundColor: colors.surfaceBase }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardAvoidingBehavior('modal')}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingLeft: spacing.lg,
              paddingRight: spacing.xs,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: typeScale.callout,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
            >
              {label}
            </Text>
            <CopyAndShare label={copyLabel} text={text} color={colors.textSecondary} />
            {showSave ? (
              <Button
                title={saving ? 'Saving…' : 'Save changes'}
                size="sm"
                onPress={onSave}
                disabled={saving}
              />
            ) : null}
            <PressableBox
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: ICON_TARGET,
                height: ICON_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} color={colors.textSecondary} />
            </PressableBox>
          </View>
          {error ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              <StatusLine text={error} tone="error" colors={colors} />
            </View>
          ) : null}
          <ScrollView
            keyboardDismissMode="interactive"
            contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}
          >
            <TextInput
              accessibilityLabel={`Edit ${label}`}
              value={text}
              onChangeText={onChange}
              editable={!readOnly}
              multiline
              scrollEnabled={false}
              style={{
                ...chatTypography.body,
                flexGrow: 1,
                color: colors.textPrimary,
                textAlignVertical: 'top',
              }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function WritingDraftSurface({
  language,
  label,
  copyLabel,
  source,
  colors,
  streaming,
  renderBody,
}: {
  language: string;
  label: string;
  copyLabel: string;
  source: string;
  colors: ColorScheme;
  streaming: boolean;
  renderBody?: (text: string) => ReactNode;
}) {
  const scope = useAssistantDraftScope();
  const key = answerDraftKey(scope, language, source);
  const [state, setState, reset] = useAnswerDraft(key, UNEDITED_WRITING);
  const { save, saving, error, canPersist } = useDraftSave(scope);
  const committedKey = useCarriedDraft(key);
  const [expanded, setExpanded] = useState(false);
  const editorArea = useRef<View>(null);
  const editorReveal = useRevealFocusedField(editorArea, 'end');
  const text = state.edited ?? source;
  const dirty = state.edited !== null && state.edited !== source;
  useReportUnsavedAnswerEdit(scope, key, dirty);
  const readOnly = streaming || saving;
  const editing = state.editing && !streaming;

  const change = (next: string) => setState((current) => ({ ...current, edited: next }));
  const commit = (afterSave?: () => void) =>
    void save({ language, identity: source, content: text }).then((saved) => {
      if (!saved) return;
      reset();
      clearCommittedDraft(committedKey);
      afterSave?.();
    });
  const cancel = () => {
    if (!dirty) {
      setState((current) => ({ ...current, edited: null, editing: false }));
      return;
    }
    confirmDiscard(reset);
  };

  return (
    <View testID="answer-surface-writing" accessibilityLabel={label} style={cardStyle(colors)}>
      <Text style={{ ...chatTypography.writingSubject, color: colors.textSecondary }}>{label}</Text>
      {editing ? (
        <View ref={editorArea} collapsable={false}>
          <TextInput
            accessibilityLabel={`Edit ${label}`}
            value={text}
            onChangeText={change}
            onFocus={editorReveal.onFocus}
            onBlur={editorReveal.onBlur}
            onContentSizeChange={editorReveal.onContentSizeChange}
            editable={!readOnly}
            autoFocus
            multiline
            style={{
              ...chatTypography.body,
              color: colors.textPrimary,
              minHeight: 88,
              textAlignVertical: 'top',
            }}
          />
        </View>
      ) : (
        <View testID="answer-surface-writing-body">
          {renderBody ? (
            renderBody(text)
          ) : (
            <Text selectable style={{ ...chatTypography.body, color: colors.textPrimary }}>
              {text}
            </Text>
          )}
        </View>
      )}
      {streaming ? null : (
        <ActionRow>
          <CopyAndShare label={copyLabel} text={text} color={colors.textSecondary} />
          {editing ? null : (
            <DraftAction
              label="Edit"
              onPress={() => setState((current) => ({ ...current, editing: true }))}
              color={colors.textSecondary}
            />
          )}
          <PressableBox
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="Open larger to read and edit"
            style={{
              width: ICON_TARGET,
              height: ICON_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Maximize2 size={16} color={colors.textSecondary} />
          </PressableBox>
        </ActionRow>
      )}
      {error && !expanded ? <StatusLine text={error} tone="error" colors={colors} /> : null}
      {(dirty || editing) && !streaming ? (
        <EditFooter
          canPersist={canPersist}
          dirty={dirty}
          saving={saving}
          onSave={() => commit()}
          onCancel={cancel}
          colors={colors}
        />
      ) : null}
      {expanded ? (
        <WritingExpandSheet
          visible
          label={label}
          copyLabel={copyLabel}
          text={text}
          readOnly={readOnly}
          showSave={dirty && canPersist}
          saving={saving}
          error={error}
          onChange={change}
          onSave={() => commit(() => setExpanded(false))}
          onClose={() => setExpanded(false)}
          colors={colors}
        />
      ) : null}
    </View>
  );
}
