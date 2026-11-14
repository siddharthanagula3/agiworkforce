import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Check, CircleHelp, ShieldAlert, Square, Volume2, X } from 'lucide-react-native';
import {
  REMOTE_CODE_LIMITS,
  type RemoteCodePendingApproval,
  type RemoteCodePendingQuestion,
  type RemoteCodeToolRecord,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import {
  CloudCodeTaskBubble,
  CodeDisclosure,
  CodeOutputBlock,
  CodeReplyActionButton,
  CodeReplyActions,
} from '@/src/features/cloud-code/components/CloudCodeTranscript';
import * as deviceSpeech from '@/src/features/voice/services/tts';
import { useCapability } from '@/src/lib/Capabilities';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { RemoteCodeApprovalHoldNotice } from '../remote-code/store';
import { CODE_SESSION_COPY as COPY, codeWorkLabel } from './codeSessionTimeline';

const ICON_SIZE = 15;

export function CodeThoughtRow({ text, live }: { text: string; live: boolean }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <View>
      <CodeDisclosure
        label={live ? COPY.thinking : COPY.thought}
        expanded={expanded}
        failed={false}
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded ? (
        <Text
          selectable
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 20 }}
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}

function ToolLine({ tool }: { tool: RemoteCodeToolRecord }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const failed = tool.state === 'failed';
  const label = tool.summary || tool.name;

  if (!tool.output) {
    return (
      <View style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text
          variant="mono"
          numberOfLines={1}
          style={{
            color: failed ? colors.agentError : colors.textSecondary,
            fontSize: typeScale.footnote,
          }}
        >
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <CodeDisclosure
        label={label}
        expanded={expanded}
        failed={failed}
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded ? <CodeOutputBlock text={tool.output} failed={failed} /> : null}
    </View>
  );
}

export function CodeWorkGroup({ tools }: { tools: RemoteCodeToolRecord[] }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const failed = tools.filter((tool) => tool.state === 'failed');

  return (
    <View>
      <CodeDisclosure
        label={codeWorkLabel(tools)}
        expanded={expanded}
        failed={false}
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded
        ? tools.map((tool) => <ToolLine key={tool.toolCallId} tool={tool} />)
        : failed.map((tool) => (
            <Text
              key={tool.toolCallId}
              numberOfLines={1}
              style={{ color: colors.agentError, fontSize: typeScale.caption }}
            >
              {`${tool.summary || tool.name} failed`}
            </Text>
          ))}
    </View>
  );
}

export function CodeQueuedBubble({ text }: { text: string }) {
  const colors = useThemeColors();

  return (
    <View style={{ gap: 4 }}>
      <CloudCodeTaskBubble text={text} />
      <Text style={{ alignSelf: 'flex-end', color: colors.textMuted, fontSize: typeScale.caption }}>
        {COPY.queued}
      </Text>
    </View>
  );
}

export function CodeReplyRow({ text }: { text: string }) {
  const colors = useThemeColors();
  const voiceAllowed = useCapability('canUseVoice');
  const [speaking, setSpeaking] = useState(false);
  const speech = useRef<deviceSpeech.SpeechHandle | null>(null);

  useEffect(
    () => () => {
      const current = speech.current;
      speech.current = null;
      void current?.stop().catch(() => undefined);
    },
    [],
  );

  const toggleSpeech = () => {
    const current = speech.current;
    if (current) {
      speech.current = null;
      setSpeaking(false);
      void current.stop().catch(() => undefined);
      return;
    }
    const started = deviceSpeech.start(text, deviceSpeech.speechOptionsFromSettings());
    speech.current = started;
    setSpeaking(true);
    void started.done.then(() => {
      if (speech.current !== started) return;
      speech.current = null;
      setSpeaking(false);
    });
  };

  return (
    <View style={{ gap: 6 }}>
      <View>{renderMarkdownContent(text, colors)}</View>
      {text.trim() ? (
        <CodeReplyActions
          text={text}
          extra={
            voiceAllowed ? (
              <CodeReplyActionButton
                label={speaking ? COPY.stopReading : COPY.readAloud}
                icon={speaking ? Square : Volume2}
                color={colors.textMuted}
                onPress={toggleSpeech}
              />
            ) : null
          }
        />
      ) : null}
    </View>
  );
}

function HoldNotice({ hold }: { hold: RemoteCodeApprovalHoldNotice | undefined }) {
  const colors = useThemeColors();
  if (!hold) return null;

  return (
    <Text
      accessibilityRole="alert"
      style={{
        color: hold.status === 'refused' ? colors.agentError : colors.agentWarning,
        fontSize: typeScale.footnote,
        lineHeight: 19,
      }}
    >
      {hold.message}
    </Text>
  );
}

export function CodeApprovalCard({
  approval,
  hold,
  focused,
  onAnswer,
}: {
  approval: RemoteCodePendingApproval;
  hold: RemoteCodeApprovalHoldNotice | undefined;
  focused: boolean;
  onAnswer: (approved: boolean) => void;
}) {
  const colors = useThemeColors();

  return (
    <Card variant="elevated" style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ paddingTop: 2 }}>
          <ShieldAlert size={ICON_SIZE} color={colors.agentWarning} />
        </View>
        <Text
          accessibilityRole={focused ? 'alert' : undefined}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.subhead,
            fontWeight: '600',
          }}
        >
          {approval.summary}
        </Text>
      </View>
      {approval.detail ? (
        <Text
          variant="mono"
          selectable
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
        >
          {approval.detail}
        </Text>
      ) : null}
      <HoldNotice hold={hold} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableBox
          onPress={() => onAnswer(false)}
          accessibilityRole="button"
          accessibilityLabel={`Deny ${approval.summary}`}
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.dangerBorder,
            backgroundColor: colors.dangerSurface,
          }}
        >
          <X size={14} color={colors.agentError} />
          <Text
            style={{ color: colors.agentError, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            Deny
          </Text>
        </PressableBox>
        <PressableBox
          onPress={() => onAnswer(true)}
          accessibilityRole="button"
          accessibilityLabel={`Approve ${approval.summary}`}
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: radii.lg,
            backgroundColor: colors.teal,
          }}
        >
          <Check size={14} color={colors.accentText} />
          <Text
            style={{ color: colors.accentText, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            Approve
          </Text>
        </PressableBox>
      </View>
    </Card>
  );
}

export function CodeQuestionCard({
  question,
  hold,
  onAnswer,
}: {
  question: RemoteCodePendingQuestion;
  hold: RemoteCodeApprovalHoldNotice | undefined;
  onAnswer: (answer: string | null) => Promise<boolean>;
}) {
  const colors = useThemeColors();
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const options = question.options ?? [];
  const trimmed = typed.trim();

  const answer = async (value: string | null) => {
    if (sending) return;
    setSending(true);
    setFailed(false);
    const sent = await onAnswer(value);
    setFailed(!sent);
    setSending(false);
  };

  return (
    <Card variant="elevated" style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ paddingTop: 2 }}>
          <CircleHelp size={ICON_SIZE} color={colors.agentWarning} />
        </View>
        <Text
          selectable
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.subhead,
            fontWeight: '600',
            lineHeight: 21,
          }}
        >
          {question.question}
        </Text>
      </View>

      {!question.answerable ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
          {COPY.answerAtComputer}
        </Text>
      ) : (
        <>
          {options.map((option) => (
            <PressableBox
              key={option}
              onPress={() => void answer(option)}
              disabled={sending}
              accessibilityRole="button"
              accessibilityState={{ disabled: sending }}
              accessibilityLabel={`Answer: ${option}`}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: sending ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>
                {option}
              </Text>
            </PressableBox>
          ))}
          {options.length === 0 ? (
            <TextInput
              value={typed}
              onChangeText={setTyped}
              editable={!sending}
              multiline
              maxLength={REMOTE_CODE_LIMITS.answerLength}
              placeholder={COPY.answerPlaceholder}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={COPY.answerPlaceholder}
              style={{
                minHeight: 44,
                maxHeight: 132,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                paddingVertical: 10,
                color: colors.textPrimary,
                fontSize: typeScale.callout,
                textAlignVertical: 'top',
              }}
            />
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              title={COPY.skipQuestion}
              variant="ghost"
              size="sm"
              disabled={sending}
              onPress={() => void answer(null)}
            />
            {options.length === 0 ? (
              <Button
                title={COPY.sendAnswer}
                size="sm"
                loading={sending}
                disabled={sending || trimmed.length === 0}
                onPress={() => void answer(trimmed)}
              />
            ) : null}
          </View>
        </>
      )}

      <HoldNotice hold={hold} />
      {failed ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
        >
          {COPY.answerFailed}
        </Text>
      ) : null}
    </Card>
  );
}
