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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { useRouter } from 'expo-router';
import { X, Zap, ZapOff, Send, RotateCcw, Camera } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

/**
 * CameraScreen — Full-screen camera capture screen for vision AI analysis.
 * Flow: Camera view → Capture → Preview with text input → Send to new conversation.
 */
export default function CameraScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [permission, requestPermission] = useCameraPermissions();

  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraSlow, setCameraSlow] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

  useEffect(() => {
    if (!permission?.granted || capturedUri || cameraReady) {
      setCameraSlow(false);
      return;
    }

    const timeout = setTimeout(() => setCameraSlow(true), 3500);
    return () => clearTimeout(timeout);
  }, [permission?.granted, capturedUri, cameraReady]);

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
    setPromptText('');
    setCameraReady(false);
    setCameraSlow(false);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The image could not be sent.';
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

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.teal} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <Camera size={36} color={c.textMuted} />
          </View>
          <Text style={styles.permissionTitle}>Camera access required</Text>
          <Text style={styles.permissionDescription}>
            Allow camera access to capture images for visual questions.
          </Text>
          <View style={styles.permissionButtons}>
            <Pressable
              onPress={requestPermission}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Allow camera access"
            >
              <Text style={styles.primaryButtonText}>Allow Access</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={styles.outlineButton}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
            >
              <Text style={styles.outlineButtonText}>Open Settings</Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              className="items-center py-3"
              accessibilityRole="button"
              accessibilityLabel="Close camera"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
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
                <X size={22} color={c.cameraOverlayText} />
              </Pressable>
              <Pressable
                onPress={handleRetake}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
              >
                <RotateCcw size={20} color={c.cameraOverlayText} />
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
                placeholderTextColor={c.cameraOverlayTextMuted}
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
                  <ActivityIndicator size="small" color={c.accentText} />
                ) : (
                  <Send size={20} color={c.accentText} />
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
        onCameraReady={handleCameraReady}
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
            <X size={22} color={c.cameraOverlayText} />
          </Pressable>

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

      <View style={styles.hintBadge} pointerEvents="none">
        <Text style={styles.hintText}>
          {cameraReady ? 'Frame the image' : cameraSlow ? 'Preparing camera' : 'Starting camera'}
        </Text>
      </View>

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
              <ActivityIndicator color={c.black} />
            ) : !cameraReady ? (
              <ActivityIndicator color={c.black} />
            ) : (
              <View style={styles.captureInner} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

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
    permissionTitle: {
      color: colors.textPrimary,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
      marginTop: 16,
    },
    permissionDescription: {
      color: colors.textSecondary,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
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
    primaryButtonText: {
      color: colors.accentText,
      fontSize: 14,
      fontWeight: '600',
    },
    outlineButton: {
      borderWidth: 1,
      borderColor: colors.neutralBorder,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    outlineButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    cancelButtonText: {
      color: colors.textMuted,
      fontSize: 14,
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
      backgroundColor: colors.cameraOverlaySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hintBadge: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 132,
      alignItems: 'center',
    },
    hintText: {
      color: colors.cameraOverlayText,
      backgroundColor: colors.cameraOverlaySurface,
      borderColor: colors.cameraOverlayBorder,
      borderWidth: 1,
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 13,
      fontWeight: '600',
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
    captureInner: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.cameraOverlayText,
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
}
