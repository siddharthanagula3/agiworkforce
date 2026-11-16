import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH } from '@agiworkforce/cloud-contracts';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { readGeneratedImageBase64 } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import {
  imageShapeOptions,
  variationPrompt,
  wholeImageChangePrompt,
  type ImageWholeEdit,
} from '../wholeImageEdit';

export const IMAGE_TOO_LARGE_TO_CHANGE = 'This image is too large to change.';
export const SHAPE_NOTE = 'Makes a new image in that shape from the same description.';

export function ImageChangeSheet({
  imagePath,
  imagePrompt,
  model,
  aspectRatio,
  onCancel,
  onSubmit,
}: {
  imagePath: string;
  imagePrompt?: string;
  model?: string;
  aspectRatio?: string;
  onCancel: () => void;
  onSubmit: (edit: ImageWholeEdit) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [change, setChange] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const shapes = imagePrompt?.trim() ? imageShapeOptions(model, aspectRatio) : [];

  const submitWithSource = useCallback(
    async (operation: 'edit' | 'variation', prompt: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setPreparing(true);
      setError(null);
      try {
        const { base64 } = await readGeneratedImageBase64(imagePath);
        if (!liveRef.current) return;
        if (base64.length > MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH) {
          setError(IMAGE_TOO_LARGE_TO_CHANGE);
          return;
        }
        onSubmit({
          operation,
          prompt,
          sourceBase64: base64,
          ...(aspectRatio ? { aspectRatio } : {}),
        });
      } catch (readError) {
        if (liveRef.current) setError(toUserMessage(readError, 'This image could not be opened.'));
      } finally {
        busyRef.current = false;
        if (liveRef.current) setPreparing(false);
      }
    },
    [aspectRatio, imagePath, onSubmit],
  );

  const submitChange = useCallback(() => {
    if (!change.trim()) return;
    void submitWithSource('edit', wholeImageChangePrompt(imagePrompt, change));
  }, [change, imagePrompt, submitWithSource]);

  const submitVariation = useCallback(() => {
    void submitWithSource('variation', variationPrompt(imagePrompt));
  }, [imagePrompt, submitWithSource]);

  const submitShape = useCallback(
    (shape: string) => {
      if (busyRef.current || !imagePrompt?.trim()) return;
      onSubmit({ operation: 'reshape', prompt: imagePrompt.trim(), aspectRatio: shape });
    },
    [imagePrompt, onSubmit],
  );

  const ready = change.trim().length > 0 && !preparing;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        style={{ flex: 1, backgroundColor: colors.surfaceBase }}
        behavior={keyboardAvoidingBehavior('modal')}
      >
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel change"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={colors.textPrimary} />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
            }}
          >
            Change this image
          </Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: dialogPadding,
            paddingBottom: insets.bottom + 16,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              value={change}
              onChangeText={setChange}
              placeholder="Describe the change"
              placeholderTextColor={colors.textMuted}
              multiline
              accessibilityLabel="Describe the change"
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 160,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.inputSurface,
                color: colors.textPrimary,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: typeScale.body,
              }}
            />
            <Pressable
              onPress={submitChange}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel="Change the image"
              accessibilityState={{ disabled: !ready }}
              style={{
                minHeight: 44,
                paddingHorizontal: 16,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.teal,
                opacity: ready ? 1 : 0.5,
              }}
            >
              {preparing ? (
                <LoadingIndicator />
              ) : (
                <Text
                  style={{ color: colors.accentText, fontSize: typeScale.body, fontWeight: '600' }}
                >
                  Change
                </Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.agentError, fontSize: typeScale.footnote }}
            >
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={submitVariation}
            disabled={preparing}
            accessibilityRole="button"
            accessibilityLabel="Make a variation"
            accessibilityState={{ disabled: preparing }}
            style={{ minHeight: 44, justifyContent: 'center', opacity: preparing ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.body, fontWeight: '600' }}>
              Make a variation
            </Text>
          </Pressable>

          {shapes.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text
                accessibilityRole="header"
                style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
              >
                Another shape
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                {SHAPE_NOTE}
              </Text>
              {shapes.map((shape) => (
                <Pressable
                  key={shape.id}
                  onPress={() => submitShape(shape.id)}
                  disabled={preparing}
                  accessibilityRole="button"
                  accessibilityLabel={`Make it ${shape.label}`}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
                    {shape.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
