import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Linking,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { useRouter } from 'expo-router';
import { X, Zap, ZapOff, Send, RotateCcw, ScanText, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { useChatMessageStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { recognizeText, type OcrRegion } from '@/src/features/image/services/ocr';
import { useChatExecutionStore } from '@/stores/chatStore';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

type ScanPhase = 'camera' | 'processing' | 'preview';

export default function ScanScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<ScanPhase>('camera');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraSlow, setCameraSlow] = useState(false);

  const [extractedText, setExtractedText] = useState('');
  const [regions, setRegions] = useState<OcrRegion[]>([]);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const createConversation = useChatMessageStore((s) => s.createConversation);
  const sendMessage = useChatExecutionStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

  useEffect(() => {
    if (!permission?.granted || phase !== 'camera' || cameraReady) {
      setCameraSlow(false);
      return;
    }

    const timeout = setTimeout(() => setCameraSlow(true), 3500);
    return () => clearTimeout(timeout);
  }, [permission?.granted, phase, cameraReady]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !cameraReady) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) return;

      setCapturedUri(photo.uri);
      setPhase('processing');
      setOcrError(null);

      try {
        const result = await recognizeText(photo.uri);
        setExtractedText(result.text);
        setRegions(result.regions);

        const prefill = result.text.trim()
          ? `Summarize this:\n\n${result.text.trim()}`
          : 'What does this image say?';
        setPromptText(prefill);

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OCR failed';
        setOcrError(msg);
        setPromptText('');
      }

      setPhase('preview');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The camera could not capture the image. Please try again.';
      Alert.alert('Capture failed', message);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, cameraReady]);

  const handleRetake = useCallback(() => {
    setCapturedUri(null);
    setExtractedText('');
    setRegions([]);
    setOcrError(null);
    setPromptText('');
    setImgNaturalSize(null);
    setCopied(false);
    setPhase('camera');
    setCameraReady(false);
    setCameraSlow(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!extractedText.trim()) return;
    await Clipboard.setStringAsync(extractedText);
    setCopied(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 1800);
  }, [extractedText]);

  const handleSend = useCallback(async () => {
    if (!capturedUri || isSending) return;

    const content = promptText.trim();
    if (!content) {
      Alert.alert(
        'No text to send',
        'AGI could not extract text from this image. Retake the scan or type the text you want to use.',
      );
      return;
    }

    setIsSending(true);
    try {
      const conversationId = await createConversation('Scan');

      const now = Date.now();
      const attachment: Attachment = {
        id: `scan_${now}`,
        uri: capturedUri,
        mimeType: 'image/jpeg',
        fileName: `scan_${now}.jpg`,
      };

      await sendMessage(conversationId, content, selectedModel, [attachment]);
      router.replace(`/(app)/chat/${conversationId}` as Parameters<typeof router.replace>[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The scan could not be sent.';
      Alert.alert('Send failed', message);
      setIsSending(false);
    }
  }, [capturedUri, isSending, createConversation, sendMessage, selectedModel, promptText, router]);

  const toggleFlash = useCallback(() => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setCameraSlow(false);
  }, []);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.teal} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <ScanText size={36} color={c.textMuted} />
          </View>
          <Text className="text-center text-base font-medium mt-4" style={{ color: c.textPrimary }}>
            Camera access required
          </Text>
          <Text
            className="text-center text-sm mt-2 leading-5"
            style={{ color: c.cameraOverlayTextMuted }}
          >
            Allow camera access to scan and extract text from documents, signs, and screens.
          </Text>
          <View style={styles.permissionButtons}>
            <Pressable
              onPress={requestPermission}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Allow camera access"
            >
              <Text className="font-semibold text-sm" style={{ color: c.accentText }}>
                Allow Access
              </Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={styles.outlineButton}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
            >
              <Text className="text-sm" style={{ color: c.cameraOverlayTextMuted }}>
                Open Settings
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              className="items-center py-3"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text className="text-sm" style={{ color: c.cameraOverlayTextMuted }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'processing' && capturedUri) {
    return (
      <View style={styles.flex}>
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.processingOverlay}>
          <ActivityIndicator color={c.teal} size="large" />
          <Text style={styles.processingLabel}>Extracting text…</Text>
        </View>
      </View>
    );
  }

  if (phase === 'preview' && capturedUri) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.flex}>
          {/* Photo */}
          <Image
            source={{ uri: capturedUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onLoad={(e) => {
              const { width, height } = e.source;
              if (width && height) setImgNaturalSize({ w: width, h: height });
            }}
          />

          {/* Teal bounding rect overlays */}
          {imgNaturalSize && regions.length > 0 && (
            <OcrOverlay
              regions={regions}
              imgNaturalW={imgNaturalSize.w}
              imgNaturalH={imgNaturalSize.h}
              screenW={screenW}
              screenH={screenH}
              colors={c}
              styles={styles}
            />
          )}

          {/* Top bar */}
          <SafeAreaView style={styles.topBarSafeArea} edges={['top']}>
            <View style={styles.topBar}>
              <Pressable
                onPress={handleClose}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={22} color={c.cameraOverlayText} />
              </Pressable>

              <View style={styles.topBadge}>
                <ScanText size={14} color={c.teal} />
                <Text style={styles.topBadgeText}>
                  {regions.length > 0
                    ? `${regions.length} text block${regions.length !== 1 ? 's' : ''}`
                    : ocrError
                      ? 'No text found'
                      : 'No text detected'}
                </Text>
              </View>

              <Pressable
                onPress={handleRetake}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Retake"
              >
                <RotateCcw size={20} color={c.cameraOverlayText} />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Bottom: copy + composer */}
          <SafeAreaView style={styles.promptSafeArea} edges={['bottom']}>
            <View style={styles.bottomStack}>
              {/* Copy-text pill, only if OCR found text */}
              {extractedText.trim().length > 0 && (
                <Pressable
                  onPress={handleCopy}
                  style={styles.copyPill}
                  accessibilityRole="button"
                  accessibilityLabel="Copy extracted text"
                >
                  <Copy size={13} color={copied ? c.teal : c.cameraOverlayText} />
                  <Text style={[styles.copyPillText, copied && { color: c.teal }]}>
                    {copied ? 'Copied' : 'Copy text'}
                  </Text>
                </Pressable>
              )}

              {/* Composer */}
              <View style={styles.promptContainer}>
                <TextInput
                  value={promptText}
                  onChangeText={setPromptText}
                  placeholder="Ask about this text…"
                  placeholderTextColor={c.cameraOverlayTextMuted}
                  multiline
                  maxLength={2000}
                  style={styles.promptInput}
                  accessibilityLabel="Prompt for AI"
                />
                <Pressable
                  onPress={handleSend}
                  disabled={isSending}
                  style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Send to AI"
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color={c.accentText} />
                  ) : (
                    <Send size={20} color={c.accentText} />
                  )}
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.flex}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashMode}
        mode="picture"
        onCameraReady={handleCameraReady}
      />

      {/* Scan-guide frame */}
      <View style={styles.scanGuide} pointerEvents="none">
        <View style={styles.scanCornerTL} />
        <View style={styles.scanCornerTR} />
        <View style={styles.scanCornerBL} />
        <View style={styles.scanCornerBR} />
      </View>

      {/* Top bar */}
      <SafeAreaView style={styles.topBarSafeArea} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={handleClose}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={22} color={c.cameraOverlayText} />
          </Pressable>

          <Text style={styles.screenTitle}>Scan Text</Text>

          <Pressable
            onPress={toggleFlash}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={flashMode === 'on' ? 'Turn flash off' : 'Turn flash on'}
          >
            {flashMode === 'on' ? (
              <Zap size={20} color={c.agentWarning} />
            ) : (
              <ZapOff size={20} color={c.cameraOverlayText} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Hint */}
      <View style={styles.hintBadge} pointerEvents="none">
        <Text style={styles.hintText}>
          {cameraReady
            ? 'Point at text to scan'
            : cameraSlow
              ? 'Camera is still starting'
              : 'Starting camera...'}
        </Text>
      </View>

      {/* Bottom: shutter */}
      <SafeAreaView style={styles.bottomBarSafeArea} edges={['bottom']}>
        <View style={styles.bottomBar}>
          <Pressable
            onPress={handleCapture}
            disabled={isCapturing || !cameraReady}
            style={[
              styles.captureButton,
              (isCapturing || !cameraReady) && styles.captureButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Capture and scan"
          >
            {isCapturing ? (
              <ActivityIndicator color={c.accentText} />
            ) : !cameraReady ? (
              <ActivityIndicator color={c.accentText} />
            ) : (
              <ScanText size={26} color={c.accentText} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

interface OcrOverlayProps {
  regions: OcrRegion[];
  imgNaturalW: number;
  imgNaturalH: number;
  screenW: number;
  screenH: number;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
}

function OcrOverlay({
  regions,
  imgNaturalW,
  imgNaturalH,
  screenW,
  screenH,
  colors,
  styles,
}: OcrOverlayProps) {
  const screenAspect = screenW / screenH;
  const imgAspect = imgNaturalW / imgNaturalH;

  let displayW: number;
  let displayH: number;
  let offsetX = 0;
  let offsetY = 0;

  if (imgAspect > screenAspect) {
    displayH = screenH;
    displayW = screenH * imgAspect;
    offsetX = (screenW - displayW) / 2;
  } else {
    displayW = screenW;
    displayH = screenW / imgAspect;
    offsetY = (screenH - displayH) / 2;
  }

  const scaleX = displayW / imgNaturalW;
  const scaleY = displayH / imgNaturalH;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {regions.map((r, i) => {
        const left = offsetX + r.x * scaleX;
        const top = offsetY + r.y * scaleY;
        const width = r.width * scaleX;
        const height = r.height * scaleY;

        if (left + width < 0 || left > screenW || top + height < 0 || top > screenH) {
          return null;
        }

        return (
          <View
            key={i}
            style={[
              styles.ocrRect,
              {
                left,
                top,
                width,
                height,
                borderColor: colors.cameraScanRegionBorder,
                backgroundColor: colors.cameraScanRegionSurface,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const CORNER_SIZE = 20;
const CORNER_THICKNESS = 2.5;

function createStyles(colors: ColorScheme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.black,
    },
    centered: {
      flex: 1,
      backgroundColor: colors.black,
      alignItems: 'center',
      justifyContent: 'center',
    },

    permissionContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    permissionContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    permissionIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.neutralSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permissionButtons: {
      width: '100%',
      gap: 12,
      marginTop: 24,
    },
    primaryButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    outlineButton: {
      borderWidth: 1,
      borderColor: colors.neutralBorder,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },

    processingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
    },
    processingLabel: {
      color: colors.cameraOverlayText,
      fontSize: 15,
      fontWeight: '500',
    },

    topBarSafeArea: {
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
      paddingTop: 8,
      paddingBottom: 8,
    },
    screenTitle: {
      color: colors.cameraOverlayText,
      fontSize: 16,
      fontWeight: '600',
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.cameraOverlaySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.cameraOverlaySurface,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    topBadgeText: {
      color: colors.cameraOverlayText,
      fontSize: 12,
      fontWeight: '500',
    },

    scanGuide: {
      position: 'absolute',
      top: '25%',
      left: '10%',
      right: '10%',
      bottom: '30%',
    },
    scanCornerTL: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderTopWidth: CORNER_THICKNESS,
      borderLeftWidth: CORNER_THICKNESS,
      borderColor: colors.teal,
      borderTopLeftRadius: 3,
    },
    scanCornerTR: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderTopWidth: CORNER_THICKNESS,
      borderRightWidth: CORNER_THICKNESS,
      borderColor: colors.teal,
      borderTopRightRadius: 3,
    },
    scanCornerBL: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderBottomWidth: CORNER_THICKNESS,
      borderLeftWidth: CORNER_THICKNESS,
      borderColor: colors.teal,
      borderBottomLeftRadius: 3,
    },
    scanCornerBR: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: CORNER_SIZE,
      height: CORNER_SIZE,
      borderBottomWidth: CORNER_THICKNESS,
      borderRightWidth: CORNER_THICKNESS,
      borderColor: colors.teal,
      borderBottomRightRadius: 3,
    },

    hintBadge: {
      position: 'absolute',
      bottom: '32%',
      alignSelf: 'center',
      backgroundColor: colors.cameraOverlaySurface,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    hintText: {
      color: colors.cameraOverlayTextMuted,
      fontSize: 13,
      fontWeight: '400',
    },

    bottomBarSafeArea: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    bottomBar: {
      alignItems: 'center',
      paddingBottom: 24,
      paddingTop: 16,
    },
    captureButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.cameraOverlayText,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: colors.cameraShutterBorder,
    },
    captureButtonDisabled: {
      opacity: 0.5,
    },

    ocrRect: {
      position: 'absolute',
      borderWidth: 1.5,
      borderRadius: 3,
    },

    promptSafeArea: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    bottomStack: {
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    copyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: colors.cameraOverlaySurfaceStrong,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.cameraOverlayBorder,
    },
    copyPillText: {
      color: colors.cameraOverlayText,
      fontSize: 12,
      fontWeight: '500',
    },
    promptContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.cameraOverlaySurfaceStrong,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cameraOverlayBorder,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    promptInput: {
      flex: 1,
      color: colors.cameraOverlayText,
      fontSize: 15,
      lineHeight: 22,
      maxHeight: 140,
      paddingVertical: 0,
    },
    sendButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
  });
}
