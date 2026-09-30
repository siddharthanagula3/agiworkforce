import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Slider from '@react-native-community/slider';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redo2, Undo2, X } from 'lucide-react-native';
import { MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH } from '@agiworkforce/cloud-contracts';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { readGeneratedImageBase64 } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import {
  base64ToBytes,
  hasMaskArea,
  imageDimensions,
  maskPngBase64,
  type ImageDimensions,
  type MaskStroke,
} from '../services/imageMask';

const MIN_BRUSH = 0.02;
const MAX_BRUSH = 0.15;
const DEFAULT_BRUSH = 0.05;

export interface ImageAreaEdit {
  prompt: string;
  sourceBase64: string;
  maskBase64: string;
}

interface LoadedImage {
  base64: string;
  contentType: string;
  size: ImageDimensions;
}

function strokePath(stroke: MaskStroke, width: number, height: number): string {
  return stroke.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x * width} ${point.y * height}`)
    .join(' ')
    .concat(stroke.points.length === 1 ? ` l0.1 0` : '');
}

export function ImageAreaEditor({
  imagePath,
  visible,
  onCancel,
  onSubmit,
}: {
  imagePath: string;
  visible: boolean;
  onCancel: () => void;
  onSubmit: (edit: ImageAreaEdit) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [redoStack, setRedoStack] = useState<MaskStroke[]>([]);
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const [prompt, setPrompt] = useState('');
  const [preparing, setPreparing] = useState(false);
  const brushRef = useRef(brush);
  brushRef.current = brush;

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setStrokes([]);
    setRedoStack([]);
    setPrompt('');
    readGeneratedImageBase64(imagePath)
      .then(({ base64, contentType }) => {
        const size = imageDimensions(base64ToBytes(base64));
        if (!size) throw new Error('This image format cannot be edited.');
        if (!cancelled) setLoaded({ base64, contentType: contentType ?? 'image/png', size });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(toUserMessage(loadError, 'This image could not be opened.'));
      });
    return () => {
      cancelled = true;
    };
  }, [imagePath, visible]);

  const canvas = useMemo(() => {
    if (!loaded) return null;
    const maxWidth = screenWidth - 32;
    const maxHeight = screenHeight * 0.5;
    const ratio = loaded.size.width / loaded.size.height;
    const width = Math.min(maxWidth, maxHeight * ratio);
    return { width, height: width / ratio };
  }, [loaded, screenHeight, screenWidth]);

  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const box = canvasRef.current;
          if (!box) return;
          const point = {
            x: event.nativeEvent.locationX / box.width,
            y: event.nativeEvent.locationY / box.height,
          };
          setStrokes((current) => [...current, { width: brushRef.current, points: [point] }]);
          setRedoStack([]);
        },
        onPanResponderMove: (event) => {
          const box = canvasRef.current;
          if (!box) return;
          const point = {
            x: Math.min(1, Math.max(0, event.nativeEvent.locationX / box.width)),
            y: Math.min(1, Math.max(0, event.nativeEvent.locationY / box.height)),
          };
          setStrokes((current) => {
            const last = current[current.length - 1];
            if (!last) return current;
            return [...current.slice(0, -1), { ...last, points: [...last.points, point] }];
          });
        },
      }),
    [],
  );

  const undo = useCallback(() => {
    const last = strokes[strokes.length - 1];
    if (!last) return;
    setStrokes(strokes.slice(0, -1));
    setRedoStack([...redoStack, last]);
  }, [redoStack, strokes]);

  const redo = useCallback(() => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedoStack(redoStack.slice(0, -1));
    setStrokes([...strokes, last]);
  }, [redoStack, strokes]);

  const submit = useCallback(() => {
    if (!loaded || !hasMaskArea(strokes) || !prompt.trim()) return;
    setPreparing(true);
    setTimeout(() => {
      try {
        const maskBase64 = maskPngBase64(strokes, loaded.size);
        if (maskBase64.length > MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH) {
          throw new Error('This image is too large to edit an area of.');
        }
        onSubmit({ prompt: prompt.trim(), sourceBase64: loaded.base64, maskBase64 });
      } catch (maskError) {
        setError(toUserMessage(maskError, 'The selected area could not be prepared.'));
      } finally {
        setPreparing(false);
      }
    }, 0);
  }, [loaded, onSubmit, prompt, strokes]);

  const ready = loaded !== null && hasMaskArea(strokes) && prompt.trim().length > 0 && !preparing;

  const iconButton = (
    label: string,
    Icon: typeof Undo2,
    onPress: () => void,
    disabled: boolean,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon size={20} color={colors.textPrimary} />
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        style={{ flex: 1, backgroundColor: colors.surfaceBase }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {iconButton('Cancel edit', X, onCancel, false)}
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
            }}
          >
            Select the area to change
          </Text>
          {iconButton('Undo', Undo2, undo, strokes.length === 0)}
          {iconButton('Redo', Redo2, redo, redoStack.length === 0)}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {canvas && loaded ? (
            <View style={{ width: canvas.width, height: canvas.height }}>
              <Image
                source={{ uri: `data:${loaded.contentType};base64,${loaded.base64}` }}
                style={{ width: canvas.width, height: canvas.height, borderRadius: 8 }}
                contentFit="contain"
                accessibilityLabel="Image to select an area on"
              />
              <View
                {...panResponder.panHandlers}
                accessible
                accessibilityLabel="Paint over the area to change"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              >
                <Svg width={canvas.width} height={canvas.height}>
                  {strokes.map((stroke, index) => (
                    <Path
                      key={index}
                      d={strokePath(stroke, canvas.width, canvas.height)}
                      stroke={colors.teal}
                      strokeOpacity={0.5}
                      strokeWidth={stroke.width * canvas.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
                </Svg>
              </View>
            </View>
          ) : error ? null : (
            <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading image" />
          )}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.agentError, fontSize: typeScale.footnote, marginTop: 12 }}
            >
              {error}
            </Text>
          ) : null}
        </View>

        <View
          style={{ paddingHorizontal: dialogPadding, paddingBottom: insets.bottom + 12, gap: 8 }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
            Brush size
          </Text>
          <Slider
            value={brush}
            minimumValue={MIN_BRUSH}
            maximumValue={MAX_BRUSH}
            onValueChange={setBrush}
            minimumTrackTintColor={colors.teal}
            maximumTrackTintColor={colors.progressTrack}
            thumbTintColor={colors.white}
            accessibilityLabel="Brush size"
            accessibilityValue={{ text: `${Math.round(brush * 100)} percent of the image width` }}
            style={{ height: 36 }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Describe the change"
              placeholderTextColor={colors.textMuted}
              multiline
              accessibilityLabel="Describe the change"
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
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
              onPress={submit}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel="Edit the selected area"
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
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Text
                  style={{ color: colors.accentText, fontSize: typeScale.body, fontWeight: '600' }}
                >
                  Edit
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
