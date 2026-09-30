import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { RotateCcw, Square } from 'lucide-react-native';
import type { ChatCodeRunResponse } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CODE_RUN_FAILED, runCodeAgain } from '../services/codeRun';

const BASE64_IMAGE_DATA = /^[A-Za-z0-9+/]+={0,2}$/;

interface CodeRunAgainProps {
  conversationId: string;
  language: string;
  code: string;
}

export function CodeRunAgain({ conversationId, language, code }: CodeRunAgainProps) {
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const allowed = useTierStore((s) => s.grantedCapabilities.includes('canUseCloudExecution'));
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ChatCodeRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    const run = new AbortController();
    controller.current = run;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await runCodeAgain({ conversationId, language, code, signal: run.signal });
      if (outcome.ok) setResult(outcome.result);
      else setError(outcome.message);
    } catch {
      if (!run.signal.aborted) setError(CODE_RUN_FAILED);
    } finally {
      if (controller.current === run) controller.current = null;
      setRunning(false);
    }
  }, [conversationId, language, code]);

  const stop = useCallback(() => controller.current?.abort(), []);

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
            <ActivityIndicator size="small" color={colors.textMuted} accessibilityLabel="Running" />
          </>
        ) : (
          <Pressable
            onPress={() => void start()}
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
          <Text
            selectable
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.caption,
              fontFamily: 'Menlo',
              backgroundColor: colors.surfaceElevated,
              padding: 8,
              borderRadius: 6,
            }}
          >
            {result.output || '(no output)'}
          </Text>
          {result.error ? (
            <Text
              selectable
              style={{ color: colors.agentError, fontSize: typeScale.caption, fontFamily: 'Menlo' }}
            >
              {result.error}
            </Text>
          ) : null}
          {result.images
            .filter((image) => BASE64_IMAGE_DATA.test(image))
            .map((image, index) => (
              <Image
                key={index}
                source={{ uri: `data:image/png;base64,${image}` }}
                accessibilityLabel={`Code output ${index + 1}`}
                style={{ width: '100%', aspectRatio: 4 / 3, resizeMode: 'contain' }}
              />
            ))}
        </View>
      ) : null}
    </View>
  );
}
