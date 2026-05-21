import { useState, useRef, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Linking,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { useRouter } from 'expo-router';
import { X, Zap, ZapOff, Send, RotateCcw, ScanText, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { useChatMessageStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { recognizeText, type OcrRegion } from '@/services/ocr';
import { useChatExecutionStore } from '@/stores/chatStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type ScanPhase = 'camera' | 'processing' | 'preview';

/**
 * ScanScreen — Wave 2 OCR/Scan hero screen.
 *
 * Flow:
 *   1. Full-screen camera viewfinder
 *   2. User taps shutter → capture → on-device OCR (Apple Vision / ML Kit)
 *   3. Preview: photo with teal bounding rects over detected text blocks
 *   4. Editable composer pre-filled "Summarize this:\n<extracted text>"
 *   5. Send → new conversation with Qwen3-4B (or selected model)
 */
export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<ScanPhase>('camera');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // OCR results
  const [extractedText, setExtractedText] = useState('');
  const [regions, setRegions] = useState<OcrRegion[]>([]);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Image dimensions for scaling overlay rects to preview size
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Composer
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const createConversation = useChatMessageStore((s) => s.createConversation);
  const sendMessage = useChatExecutionStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

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

      // Run on-device OCR
      try {
        const result = await recognizeText(photo.uri);
        setExtractedText(result.text);
        setRegions(result.regions);

        // Pre-fill composer
        const prefill = result.text.trim()
          ? `Summarize this:\n\n${result.text.trim()}`
          : 'What does this image say?';
        setPromptText(prefill);

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OCR failed';
        setOcrError(msg);
        setPromptText('What do you see in this image?');
      }

      setPhase('preview');
    } catch {
      // Camera capture failed silently
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

    setIsSending(true);
    try {
      const conversationId = await createConversation('Scan');
      const content = promptText.trim() || 'What do you see in this image?';
      await sendMessage(conversationId, content, selectedModel, []);
      router.replace(`/(app)/chat/${conversationId}` as Parameters<typeof router.replace>[0]);
    } catch {
      setIsSending(false);
    }
  }, [capturedUri, isSending, createConversation, sendMessage, selectedModel, promptText, router]);

  const toggleFlash = useCallback(() => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  // ── Permission not yet determined ────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <ScanText size={36} color={colors.textMuted} />
          </View>
          <Text className="text-white text-center text-base font-medium mt-4">
            Camera access required
          </Text>
          <Text className="text-white/50 text-center text-sm mt-2 leading-5">
            Allow camera access to scan and extract text from documents, signs, and screens.
          </Text>
          <View style={styles.permissionButtons}>
            <Pressable
              onPress={requestPermission}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Allow camera access"
            >
              <Text className="text-white font-semibold text-sm">Allow Access</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={styles.outlineButton}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
            >
              <Text className="text-white/70 text-sm">Open Settings</Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              className="items-center py-3"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text className="text-white/40 text-sm">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Processing spinner ───────────────────────────────────────────────────
  if (phase === 'processing' && capturedUri) {
    return (
      <View style={styles.flex}>
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.processingOverlay}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.processingLabel}>Extracting text…</Text>
        </View>
      </View>
    );
  }

  // ── Preview: photo + overlay rects + composer ────────────────────────────
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
                <X size={22} color={colors.white} />
              </Pressable>

              <View style={styles.topBadge}>
                <ScanText size={14} color={colors.teal} />
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
                <RotateCcw size={20} color={colors.white} />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Bottom: copy + composer */}
          <SafeAreaView style={styles.promptSafeArea} edges={['bottom']}>
            <View style={styles.bottomStack}>
              {/* Copy-text pill — only if OCR found text */}
              {extractedText.trim().length > 0 && (
                <Pressable
                  onPress={handleCopy}
                  style={styles.copyPill}
                  accessibilityRole="button"
                  accessibilityLabel="Copy extracted text"
                >
                  <Copy size={13} color={copied ? colors.teal : colors.white} />
                  <Text style={[styles.copyPillText, copied && { color: colors.teal }]}>
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
                  placeholderTextColor="rgba(255,255,255,0.45)"
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
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Send size={20} color={colors.white} />
                  )}
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Live camera viewfinder ───────────────────────────────────────────────
  return (
    <View style={styles.flex}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashMode}
        mode="picture"
        onCameraReady={() => setCameraReady(true)}
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
            <X size={22} color={colors.white} />
          </Pressable>

          <Text style={styles.screenTitle}>Scan Text</Text>

          <Pressable
            onPress={toggleFlash}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={flashMode === 'on' ? 'Turn flash off' : 'Turn flash on'}
          >
            {flashMode === 'on' ? (
              <Zap size={20} color={colors.agentWarning} />
            ) : (
              <ZapOff size={20} color={colors.white} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Hint */}
      <View style={styles.hintBadge} pointerEvents="none">
        <Text style={styles.hintText}>Point at text to scan</Text>
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
              <ActivityIndicator color={colors.surfaceBase} />
            ) : (
              <ScanText size={26} color={colors.surfaceBase} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── OCR overlay component ──────────────────────────────────────────────────

interface OcrOverlayProps {
  regions: OcrRegion[];
  imgNaturalW: number;
  imgNaturalH: number;
}

function OcrOverlay({ regions, imgNaturalW, imgNaturalH }: OcrOverlayProps) {
  // The image is rendered with contentFit="cover" filling the full screen.
  // We compute the displayed image rect (cover scaling) to map pixel coords → screen coords.
  const screenAspect = SCREEN_W / SCREEN_H;
  const imgAspect = imgNaturalW / imgNaturalH;

  let displayW: number;
  let displayH: number;
  let offsetX = 0;
  let offsetY = 0;

  if (imgAspect > screenAspect) {
    // Image is wider — height fills screen, width is cropped
    displayH = SCREEN_H;
    displayW = SCREEN_H * imgAspect;
    offsetX = (SCREEN_W - displayW) / 2;
  } else {
    // Image is taller — width fills screen, height is cropped
    displayW = SCREEN_W;
    displayH = SCREEN_W / imgAspect;
    offsetY = (SCREEN_H - displayH) / 2;
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

        // Skip rects outside visible screen area
        if (left + width < 0 || left > SCREEN_W || top + height < 0 || top > SCREEN_H) {
          return null;
        }

        return <View key={i} style={[styles.ocrRect, { left, top, width, height }]} />;
      })}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const TEAL_DIM = 'rgba(33, 182, 168, 0.35)';
const TEAL_BORDER = 'rgba(33, 182, 168, 0.75)';
const CORNER_SIZE = 20;
const CORNER_THICKNESS = 2.5;

const styles = StyleSheet.create({
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

  // Permission
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },

  // Processing overlay
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  processingLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },

  // Top bar
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
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(33, 182, 168, 0.3)',
  },
  topBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  // Scan guide corners
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

  // Hint
  hintBadge: {
    position: 'absolute',
    bottom: '32%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  hintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '400',
  },

  // Shutter
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
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },

  // OCR region rect
  ocrRect: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: TEAL_BORDER,
    backgroundColor: TEAL_DIM,
    borderRadius: 3,
  },

  // Preview bottom stack
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  copyPillText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  promptContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  promptInput: {
    flex: 1,
    color: colors.textPrimary,
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
