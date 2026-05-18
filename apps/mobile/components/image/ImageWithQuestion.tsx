/**
 * ImageWithQuestion — full-screen view for the image-with-question flow.
 *
 * Layout:
 *   - Selected image fills the top 70% of the viewport.
 *   - Bottom 30%: editable question composer + send button.
 *   - After send: answer renders below the image, PerformanceChip shows the route.
 */

import { useCallback, useRef, useState } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { X, Send, RotateCcw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PerformanceChip } from '@/components/chat/PerformanceChip';
import { runVisionQuery, visionRouteLabel } from '@/services/vision';
import type { VisionResult, VisionRoute } from '@/services/vision';
import { useThemeColors } from '@/hooks/useTheme';
import type { RuntimeTier } from '@/components/chat/PerformanceChip';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_HEIGHT = Math.round(SCREEN_HEIGHT * 0.7);

export interface ImageWithQuestionProps {
  imageUri: string;
  onClose: () => void;
}

function routeToTier(route: VisionRoute): RuntimeTier {
  if (route.kind === 'system-multimodal') return 'Tier 1';
  if (route.kind === 'vl-pack') return 'Tier 2';
  return 'Tier 3';
}

export function ImageWithQuestion({ imageUri, onClose }: ImageWithQuestionProps) {
  const c = useThemeColors();

  const [question, setQuestion] = useState('What is in this image?');
  const [answer, setAnswer] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = useCallback(async () => {
    const q = question.trim();
    if (!q || isRunning) return;

    setIsRunning(true);
    setAnswer('');
    setResult(null);

    let buffer = '';
    try {
      const visionResult = await runVisionQuery({
        imageUri,
        question: q,
        onToken: (token) => {
          buffer += token;
          setAnswer(buffer);
          scrollRef.current?.scrollToEnd({ animated: true });
        },
      });
      setResult(visionResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Vision query failed. Please try again.';
      setAnswer(msg);
    } finally {
      setIsRunning(false);
    }
  }, [imageUri, question, isRunning]);

  const handleReset = useCallback(() => {
    setAnswer('');
    setResult(null);
    setQuestion('What is in this image?');
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.surfaceBase }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Image panel — 70% viewport height */}
      <View style={[styles.imagePanel, { height: IMAGE_HEIGHT }]}>
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          recyclingKey={imageUri}
        />

        {/* Top controls: close + reset */}
        <SafeAreaView style={styles.topSafe} edges={['top']}>
          <View style={styles.topBar}>
            <Pressable
              onPress={onClose}
              style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
              accessibilityRole="button"
              accessibilityLabel="Close image view"
            >
              <X size={20} color="#fff" />
            </Pressable>

            {answer ? (
              <Pressable
                onPress={handleReset}
                style={[styles.iconBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
                accessibilityRole="button"
                accessibilityLabel="Ask a new question"
              >
                <RotateCcw size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>
      </View>

      {/* Bottom panel — question + answer */}
      <View style={[styles.bottomPanel, { backgroundColor: c.surfaceBase }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.answerScroll}
          contentContainerStyle={styles.answerContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {answer ? (
            <View style={styles.answerWrap}>
              <Text style={[styles.answerText, { color: c.textPrimary }]}>{answer}</Text>
              {result && !isRunning ? (
                <PerformanceChip
                  model={visionRouteLabel(result.route)}
                  tier={routeToTier(result.route)}
                  firstTokenLatencyMs={result.ttftMs}
                />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Composer */}
        <View style={[styles.composer, { borderColor: c.border }]}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask about this image..."
            placeholderTextColor={c.textMuted}
            multiline
            maxLength={500}
            style={[styles.input, { color: c.textPrimary }]}
            editable={!isRunning}
            accessibilityLabel="Question about image"
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Pressable
            onPress={handleSend}
            disabled={isRunning || !question.trim()}
            style={[
              styles.sendBtn,
              { backgroundColor: c.teal },
              (isRunning || !question.trim()) && styles.sendBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send question"
          >
            {isRunning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  imagePanel: {
    overflow: 'hidden',
  },
  topSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomPanel: {
    flex: 1,
  },
  answerScroll: {
    flex: 1,
  },
  answerContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  answerWrap: {
    gap: 8,
  },
  answerText: {
    fontSize: 15,
    lineHeight: 23,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 100,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
});
