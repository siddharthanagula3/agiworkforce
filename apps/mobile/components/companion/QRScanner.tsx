import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Pressable, StyleSheet, Linking, TextInput, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Zap, ZapOff, Keyboard, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { colors } from '@/lib/theme';
import { isValidPairingCode } from '@/services/companion';

interface QRScannerProps {
  /** Called when a valid pairing code is detected */
  onScan: (code: string) => void;
  /** Called when user requests to close the scanner */
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const VIEWFINDER_SIZE = Math.min(SCREEN_WIDTH * 0.7, 280);

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const hasScanned = useRef(false);

  // Animated scanning line
  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(VIEWFINDER_SIZE - 4, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  const handleBarCodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (hasScanned.current) return;
      const scannedData = result.data;

      if (isValidPairingCode(scannedData)) {
        hasScanned.current = true;
        onScan(scannedData);
      }
    },
    [onScan],
  );

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualCode.trim();
    if (!trimmed) {
      setManualError('Please enter a pairing code.');
      return;
    }
    if (!isValidPairingCode(trimmed)) {
      setManualError('Invalid code format. Expected 6-12 alphanumeric characters.');
      return;
    }
    setManualError(null);
    onScan(trimmed);
  }, [manualCode, onScan]);

  // Permission not yet determined
  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-white/60">Requesting camera access...</Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-black px-8 gap-6">
        <View className="w-20 h-20 rounded-full bg-white/10 items-center justify-center">
          <ZapOff size={36} color={colors.textMuted} />
        </View>
        <Text className="text-white text-center text-base font-medium">
          Camera access is required to scan QR codes
        </Text>
        <Text className="text-white/50 text-center text-sm">
          Enable camera access in your device settings, or enter the pairing code manually below.
        </Text>
        <View className="gap-3 w-full">
          <Button title="Open Settings" variant="primary" onPress={() => Linking.openSettings()} />
          <Button title="Request Permission" variant="outline" onPress={requestPermission} />
          <Button
            title="Enter Code Manually"
            variant="ghost"
            onPress={() => setShowManualEntry(true)}
          />
        </View>
      </View>
    );
  }

  // Manual entry mode
  if (showManualEntry) {
    return (
      <View className="flex-1 bg-black px-6 pt-16 gap-6">
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Text variant="subheading">Enter Pairing Code</Text>
          <Pressable
            onPress={() => {
              setShowManualEntry(false);
              setManualError(null);
              setManualCode('');
            }}
            className="p-2 rounded-lg active:bg-white/10"
            accessibilityLabel="Close manual entry"
            accessibilityRole="button"
          >
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text className="text-white/50 text-sm">
          Open AGI Workforce on your desktop, go to Settings, and find your pairing code.
        </Text>

        {/* Code input */}
        <View className="gap-3">
          <TextInput
            value={manualCode}
            onChangeText={(text) => {
              setManualCode(text);
              setManualError(null);
            }}
            placeholder="e.g. agiw:ABC123"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleManualSubmit}
            style={{
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: manualError ? colors.agentError : 'rgba(255,255,255,0.1)',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: colors.textPrimary,
              fontSize: 18,
              fontFamily: 'Menlo',
              letterSpacing: 2,
              textAlign: 'center',
            }}
          />
          {manualError && <Text className="text-red-400 text-xs text-center">{manualError}</Text>}
        </View>

        <Button
          title="Connect"
          variant="primary"
          size="lg"
          onPress={handleManualSubmit}
          className="mt-2"
        />

        <Pressable
          onPress={() => {
            setShowManualEntry(false);
            setManualError(null);
            setManualCode('');
          }}
          className="items-center py-3"
          accessibilityLabel="Back to QR Scanner"
          accessibilityRole="button"
        >
          <Text className="text-teal-400 text-sm">Back to QR Scanner</Text>
        </Pressable>
      </View>
    );
  }

  // Camera scanner
  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={flashEnabled}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={handleBarCodeScanned}
      />

      {/* Overlay darkening */}
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        {/* Top overlay */}
        <View className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: '25%' }} />
        {/* Bottom overlay */}
        <View className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: '35%' }} />

        {/* Viewfinder frame */}
        <View
          style={{
            width: VIEWFINDER_SIZE,
            height: VIEWFINDER_SIZE,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {/* Corner brackets */}
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />

          {/* Scanning line */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 8,
                right: 8,
                height: 2,
                backgroundColor: colors.teal,
                borderRadius: 1,
                shadowColor: colors.teal,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
              },
              scanLineStyle,
            ]}
          />
        </View>

        {/* Instruction text below viewfinder */}
        <Text className="text-white/80 text-sm mt-6 text-center">
          Point your camera at the QR code{'\n'}on your desktop app
        </Text>
      </View>

      {/* Top bar: close + flash */}
      <View className="absolute top-16 left-4 right-4 flex-row items-center justify-between">
        <Pressable
          onPress={onClose}
          className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          accessibilityLabel="Close scanner"
          accessibilityRole="button"
        >
          <X size={22} color={colors.white} />
        </Pressable>

        <Pressable
          onPress={() => setFlashEnabled((prev) => !prev)}
          className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          accessibilityLabel={flashEnabled ? 'Turn off flashlight' : 'Turn on flashlight'}
          accessibilityRole="button"
        >
          {flashEnabled ? (
            <Zap size={20} color={colors.agentWarning} />
          ) : (
            <Zap size={20} color={colors.white} />
          )}
        </Pressable>
      </View>

      {/* Bottom: manual entry link */}
      <View className="absolute bottom-12 left-0 right-0 items-center gap-3">
        <Pressable
          onPress={() => setShowManualEntry(true)}
          className="flex-row items-center gap-2 px-5 py-3 rounded-full bg-black/60"
          accessibilityLabel="Enter code manually"
          accessibilityRole="button"
        >
          <Keyboard size={16} color={colors.teal} />
          <Text className="text-teal-400 text-sm font-medium">Enter code manually</Text>
        </Pressable>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const CORNER_RADIUS = 16;

const cornerBase = {
  position: 'absolute' as const,
  width: CORNER_SIZE,
  height: CORNER_SIZE,
};

const styles = StyleSheet.create({
  cornerTopLeft: {
    ...cornerBase,
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: CORNER_RADIUS,
    borderColor: colors.teal,
  },
  cornerTopRight: {
    ...cornerBase,
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: CORNER_RADIUS,
    borderColor: colors.teal,
  },
  cornerBottomLeft: {
    ...cornerBase,
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: CORNER_RADIUS,
    borderColor: colors.teal,
  },
  cornerBottomRight: {
    ...cornerBase,
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: CORNER_RADIUS,
    borderColor: colors.teal,
  },
});
