import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { RotateCcw, Square } from 'lucide-react-native';
import {
  CHAT_CODE_RUN_CONFIRMATION,
  type ChatCodeRunResponse,
} from '@agiworkforce/cloud-contracts';
import { safeExecutionImageSrc } from '@agiworkforce/unified-chat/code-execution-result';
import { Text } from '@/components/ui/Text';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useToolApprovalPolicySync } from '@/src/features/settings/tool-approvals/useToolApprovalPolicySync';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CODE_RUN_FAILED, runCodeAgain } from '../services/codeRun';
import { TOOL_MONOSPACE } from './ToolFileDiffBlock';

export const CODE_RUN_TOOK_TOO_LONG =
  'This run took too long to answer, so the app stopped waiting. It may still finish on the server.';

function isTimeoutAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

interface CodeRunAgainProps {
  conversationId: string;
  language: string;
  code: string;
}

export function CodeRunAgain({ conversationId, language, code }: CodeRunAgainProps) {
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const allowed = useTierStore((s) => s.grantedCapabilities.includes('canUseCloudExecution'));
  const approvals = useToolApprovalPolicySync();
  const asksFirst = !approvals.ready || approvals.policy === 'ask_every_time';
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ChatCodeRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const confirmRef = useRef<(() => void) | null>(null);

  const start = useCallback(
    async (approved: boolean) => {
      const run = new AbortController();
      controller.current = run;
      setRunning(true);
      setError(null);
      setResult(null);
      try {
        const outcome = await runCodeAgain({
          conversationId,
          language,
          code,
          signal: run.signal,
          ...(approved ? { approved: true } : {}),
        });
        if (outcome.ok) setResult(outcome.result);
        else if (outcome.approvalRequired && !approved) confirmRef.current?.();
        else setError(outcome.message);
      } catch (caught) {
        if (!run.signal.aborted) {
          setError(isTimeoutAbort(caught) ? CODE_RUN_TOOK_TOO_LONG : CODE_RUN_FAILED);
        }
      } finally {
        if (controller.current === run) controller.current = null;
        setRunning(false);
      }
    },
    [conversationId, language, code],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const confirmRun = useCallback(() => {
    Alert.alert(CHAT_CODE_RUN_CONFIRMATION.title, CHAT_CODE_RUN_CONFIRMATION.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: CHAT_CODE_RUN_CONFIRMATION.confirmLabel, onPress: () => void start(true) },
    ]);
  }, [start]);
  confirmRef.current = confirmRun;

  const requestRun = useCallback(() => {
    if (asksFirst) confirmRun();
    else void start(false);
  }, [asksFirst, confirmRun, start]);

  if (!isCloud || !allowed) return null;

  const buttonStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const headingStyle = {
    color: colors.textMuted,
    fontSize: typeScale.caption,
    fontWeight: '600' as const,
  };

  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {running ? (
          <>
            <Pressable
              onPress={stop}
              accessibilityRole="button"
              accessibilityLabel="Stop the run"
              style={buttonStyle}
            >
              <Square size={14} color={colors.textPrimary} />
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>Stop</Text>
            </Pressable>
            <LoadingIndicator size="small" accessibilityLabel="Running" />
          </>
        ) : (
          <Pressable
            onPress={requestRun}
            accessibilityRole="button"
            accessibilityLabel="Run this code again"
            style={buttonStyle}
          >
            <RotateCcw size={14} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
              Run again
            </Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.footnote }}
        >
          {error}
        </Text>
      ) : null}
      {result ? (
        <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={headingStyle}>
            Output
          </Text>
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.caption,
              fontFamily: TOOL_MONOSPACE,
              backgroundColor: colors.surfaceElevated,
              padding: 8,
              borderRadius: 6,
            }}
          >
            {result.output || '(no output)'}
          </Text>
          {result.error ? (
            <>
              <Text accessibilityRole="header" style={headingStyle}>
                Error
              </Text>
              <Text
                selectable
                style={{
                  color: colors.agentError,
                  fontSize: typeScale.caption,
                  fontFamily: TOOL_MONOSPACE,
                }}
              >
                {result.error}
              </Text>
            </>
          ) : null}
          {result.images
            .flatMap((image) => {
              const src = safeExecutionImageSrc({ mediaType: 'image/png', data: image });
              return src ? [src] : [];
            })
            .map((src, index) => (
              <Image
                key={index}
                source={{ uri: src }}
                accessibilityLabel={`Code output ${index + 1}`}
                style={{ width: '100%', aspectRatio: 4 / 3, resizeMode: 'contain' }}
              />
            ))}
        </View>
      ) : null}
    </View>
  );
}
