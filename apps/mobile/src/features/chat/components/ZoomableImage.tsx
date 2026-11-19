import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { motion, spacing } from '@/src/ui/theme/tokens';
import { clampPanOffset } from '@/src/features/image/panClamp';

export const MAX_ZOOM = 5;
export const STEP_ZOOM = 2.5;

export interface ImageZoomLayout {
  frameWidth: number;
  frameHeight: number;
  stageWidth: number;
  stageHeight: number;
  onZoomedChange?: (zoomed: boolean) => void;
}

export function useImageZoom({
  frameWidth,
  frameHeight,
  stageWidth,
  stageHeight,
  onZoomedChange,
}: ImageZoomLayout) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const frameWidthValue = useSharedValue(0);
  const frameHeightValue = useSharedValue(0);
  const stageWidthValue = useSharedValue(0);
  const stageHeightValue = useSharedValue(0);

  useEffect(() => {
    frameWidthValue.value = frameWidth;
    frameHeightValue.value = frameHeight;
    stageWidthValue.value = stageWidth;
    stageHeightValue.value = stageHeight;
  }, [
    frameWidth,
    frameHeight,
    stageWidth,
    stageHeight,
    frameWidthValue,
    frameHeightValue,
    stageWidthValue,
    stageHeightValue,
  ]);

  const resetZoom = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onZoomedChange?.(false);
  }, [onZoomedChange, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  const zoomTo = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(next, MAX_ZOOM));
      scale.value = withTiming(clamped, { duration: motion.moved });
      savedScale.value = clamped;
      onZoomedChange?.(clamped > 1);
      if (clamped > 1) {
        savedTranslateX.value = clampPanOffset(
          savedTranslateX.value,
          clamped,
          frameWidthValue.value,
          stageWidthValue.value,
        );
        savedTranslateY.value = clampPanOffset(
          savedTranslateY.value,
          clamped,
          frameHeightValue.value,
          stageHeightValue.value,
        );
        translateX.value = withTiming(savedTranslateX.value, { duration: motion.moved });
        translateY.value = withTiming(savedTranslateY.value, { duration: motion.moved });
      }
      if (clamped === 1) {
        translateX.value = withTiming(0, { duration: motion.moved });
        translateY.value = withTiming(0, { duration: motion.moved });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    },
    [
      frameHeightValue,
      frameWidthValue,
      onZoomedChange,
      savedScale,
      savedTranslateX,
      savedTranslateY,
      scale,
      stageHeightValue,
      stageWidthValue,
      translateX,
      translateY,
    ],
  );

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, MAX_ZOOM));
      translateX.value = clampPanOffset(
        translateX.value,
        scale.value,
        frameWidthValue.value,
        stageWidthValue.value,
      );
      translateY.value = clampPanOffset(
        translateY.value,
        scale.value,
        frameHeightValue.value,
        stageHeightValue.value,
      );
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      if (scale.value < 1.1) {
        scale.value = withTiming(1, { duration: motion.moved });
        translateX.value = withTiming(0, { duration: motion.moved });
        translateY.value = withTiming(0, { duration: motion.moved });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
      if (onZoomedChange) runOnJS(onZoomedChange)(savedScale.value > 1);
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      'worklet';
      if (scale.value > 1) {
        translateX.value = clampPanOffset(
          savedTranslateX.value + e.translationX / scale.value,
          scale.value,
          frameWidthValue.value,
          stageWidthValue.value,
        );
        translateY.value = clampPanOffset(
          savedTranslateY.value + e.translationY / scale.value,
          scale.value,
          frameHeightValue.value,
          stageHeightValue.value,
        );
      }
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1.1) {
        scale.value = withTiming(1, { duration: motion.moved });
        translateX.value = withTiming(0, { duration: motion.moved });
        translateY.value = withTiming(0, { duration: motion.moved });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(STEP_ZOOM, { duration: motion.moved });
        savedScale.value = STEP_ZOOM;
      }
      if (onZoomedChange) runOnJS(onZoomedChange)(savedScale.value > 1);
    });

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return {
    scale,
    savedScale,
    resetZoom,
    zoomTo,
    pinchGesture,
    panGesture,
    doubleTapGesture,
    animatedImageStyle,
  };
}

export interface ZoomableImageStage {
  width: number;
  maxHeight: number;
}

/** Pinch from 1x to 5x, pan within the edges and double-tap between 1x and 2.5x, on iOS and Android. */
export function ZoomableImage({
  resetKey,
  testID,
  children,
}: {
  resetKey: string;
  testID: string;
  children: (stage: ZoomableImageStage) => ReactNode;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const paneWidth = stageSize?.width ?? screenWidth;
  const paneHeight = stageSize?.height ?? screenHeight / 2;
  const contentWidth = Math.max(0, paneWidth - spacing.lg * 2);
  const maxHeight = Math.max(0, paneHeight - spacing.lg * 2);

  const [zoomed, setZoomed] = useState(false);
  const zoom = useImageZoom({
    frameWidth: frameSize?.width ?? contentWidth,
    frameHeight: frameSize?.height ?? contentWidth,
    stageWidth: paneWidth,
    stageHeight: paneHeight,
    onZoomedChange: setZoomed,
  });
  const { resetZoom } = zoom;

  useEffect(() => {
    resetZoom();
  }, [resetKey, resetZoom]);

  const gesture = Gesture.Simultaneous(
    zoom.pinchGesture,
    zoom.panGesture.enabled(zoomed),
    zoom.doubleTapGesture,
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        testID={testID}
        onLayout={(event: LayoutChangeEvent) => {
          const { width, height } = event.nativeEvent.layout;
          setStageSize({ width, height });
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        <GestureDetector gesture={gesture}>
          <Animated.View
            testID={`${testID}-frame`}
            onLayout={(event: LayoutChangeEvent) => {
              const { width, height } = event.nativeEvent.layout;
              setFrameSize({ width, height });
            }}
            style={[{ width: contentWidth }, zoom.animatedImageStyle]}
          >
            {children({ width: contentWidth, maxHeight })}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}
