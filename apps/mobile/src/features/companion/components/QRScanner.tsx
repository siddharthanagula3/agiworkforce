import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Linking, Dimensions } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Zap, ZapOff, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/src/ui/theme';
import { motion } from '@/src/ui/theme/tokens';
import { isValidPairingCode } from '@/services/companion';

interface QRScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const VIEWFINDER_SIZE = Math.min(SCREEN_WIDTH * 0.7, 280);

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const { colors, isDark } = useTheme();
  const pageBackground = isDark ? colors.background : colors.surfaceBase;
  const [permission, requestPermission] = useCameraPermissions();
  const [flashEnabled, setFlashEnabled] = useState(false);
  const hasScanned = useRef(false);

  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(VIEWFINDER_SIZE - 4, {
        duration: motion.ambient,
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

  if (!permission) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: pageBackground }}
      >
        <Text style={{ color: colors.textSecondary }}>Requesting camera access...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        className="flex-1 items-center justify-center px-8 gap-6"
        style={{ backgroundColor: pageBackground }}
      >
        <View
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.neutralSurface }}
        >
          <ZapOff size={36} color={colors.textMuted} />
        </View>
        <Text className="text-center text-base font-medium" style={{ color: colors.textPrimary }}>
          Camera access is required to scan QR codes
        </Text>
        <Text className="text-center text-sm" style={{ color: colors.textSecondary }}>
          Pairing needs the QR code in the pairing window on Desktop. Enable camera access in your
          device settings, then scan it.
        </Text>
        <View className="gap-3 w-full">
          <Button title="Open Settings" variant="primary" onPress={() => Linking.openSettings()} />
          <Button title="Request Permission" variant="outline" onPress={requestPermission} />
          <Button title="Close" variant="ghost" onPress={onClose} />
        </View>
      </View>
    );
  }

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

      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <View className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: '25%' }} />
        <View className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: '35%' }} />

        <View
          style={{
            width: VIEWFINDER_SIZE,
            height: VIEWFINDER_SIZE,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {/*
            Corner brackets + scan line sit ON the live camera feed, so they
            must NOT use `colors.teal`: that token resolves to the neutral
            foreground (#111111 in light theme, and #000000 under high
            contrast light), which draws a black frame and a black scan line
            over a dark camera image. `cameraScanRegionBorder` is the
            camera-overlay token and stays high-contrast in every theme.
          */}
          <View style={[styles.cornerTopLeft, { borderColor: colors.cameraScanRegionBorder }]} />
          <View style={[styles.cornerTopRight, { borderColor: colors.cameraScanRegionBorder }]} />
          <View style={[styles.cornerBottomLeft, { borderColor: colors.cameraScanRegionBorder }]} />
          <View
            style={[styles.cornerBottomRight, { borderColor: colors.cameraScanRegionBorder }]}
          />

          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 8,
                right: 8,
                height: 2,
                backgroundColor: colors.cameraScanRegionBorder,
                borderRadius: 1,
                shadowColor: colors.cameraScanRegionBorder,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
              },
              scanLineStyle,
            ]}
          />
        </View>

        <Text className="text-sm mt-6 text-center" style={{ color: colors.cameraOverlayText }}>
          Point your camera at the QR code{'\n'}on your desktop app
        </Text>
      </View>

      <View className="absolute top-16 left-4 right-4 flex-row items-center justify-between">
        <PressableBox
          onPress={onClose}
          className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          accessibilityLabel="Close scanner"
          accessibilityRole="button"
        >
          <X size={22} color={colors.white} />
        </PressableBox>

        <PressableBox
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
        </PressableBox>
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
  },
  cornerTopRight: {
    ...cornerBase,
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: CORNER_RADIUS,
  },
  cornerBottomLeft: {
    ...cornerBase,
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: CORNER_RADIUS,
  },
  cornerBottomRight: {
    ...cornerBase,
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: CORNER_RADIUS,
  },
});
