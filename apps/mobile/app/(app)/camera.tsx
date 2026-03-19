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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { useRouter } from 'expo-router';
import { X, Zap, ZapOff, Send, RotateCcw, Camera } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import type { Attachment } from '@/components/chat/AttachmentPreview';

/**
 * CameraScreen — Full-screen camera capture screen for vision AI analysis.
 * Flow: Camera view → Capture → Preview with text input → Send to new conversation.
 */
export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !cameraReady) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
      }
    } catch {
      // Silently fail — camera may not be ready yet
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, cameraReady]);

  const handleRetake = useCallback(() => {
    setCapturedUri(null);
    setPromptText('');
    setCameraReady(false);
  }, []);

  const handleSend = useCallback(async () => {
    if (!capturedUri || isSending) return;

    setIsSending(true);
    try {
      const conversationId = await createConversation('Vision Analysis');

      const attachment: Attachment = {
        id: `img_${Date.now()}`,
        uri: capturedUri,
        mimeType: 'image/jpeg',
        fileName: `capture_${Date.now()}.jpg`,
      };

      const messageContent = promptText.trim() || 'What do you see in this image?';
      await sendMessage(conversationId, messageContent, selectedModel, [attachment]);

      router.replace(`/(app)/chat/${conversationId}` as Parameters<typeof router.replace>[0]);
    } catch {
      setIsSending(false);
    }
  }, [capturedUri, isSending, createConversation, sendMessage, selectedModel, promptText, router]);

  const toggleFlash = useCallback(() => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <Camera size={36} color={colors.textMuted} />
          </View>
          <Text className="text-white text-center text-base font-medium mt-4">
            Camera access required
          </Text>
          <Text className="text-white/50 text-center text-sm mt-2 leading-5">
            Allow camera access to capture images for AI vision analysis.
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
              accessibilityLabel="Close camera"
            >
              <Text className="text-white/40 text-sm">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Post-capture preview + prompt
  if (capturedUri) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.previewContainer}>
          {/* Captured photo fills screen */}
          <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />

          {/* Top controls */}
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
              <Pressable
                onPress={handleRetake}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
              >
                <RotateCcw size={20} color={colors.white} />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Bottom prompt overlay */}
          <SafeAreaView style={styles.promptSafeArea} edges={['bottom']}>
            <View style={styles.promptContainer}>
              <TextInput
                value={promptText}
                onChangeText={setPromptText}
                placeholder="Ask about this image..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                multiline
                maxLength={500}
                style={styles.promptInput}
                accessibilityLabel="Image prompt"
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
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Live camera view
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

      {/* Top bar: close + flash */}
      <SafeAreaView style={styles.topBarSafeArea} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={handleClose}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
          >
            <X size={22} color={colors.white} />
          </Pressable>

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

      {/* Bottom: capture button */}
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
            accessibilityLabel="Take photo"
          >
            {isCapturing ? (
              <ActivityIndicator color={colors.surfaceBase} />
            ) : (
              <View style={styles.captureInner} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

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
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
  },
  // Preview styles
  previewContainer: {
    flex: 1,
    backgroundColor: colors.black,
  },
  promptSafeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  promptContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 16,
    marginBottom: 16,
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
    maxHeight: 120,
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
