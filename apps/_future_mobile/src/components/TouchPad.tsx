import { useRef } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';

export interface TouchPadEvent {
  type: 'move' | 'tap' | 'doubleTap';
  deltaX?: number;
  deltaY?: number;
}

interface TouchPadProps {
  onGesture: (event: TouchPadEvent) => void;
}

export function TouchPad({ onGesture }: TouchPadProps) {
  const lastTap = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        onGesture({
          type: 'move',
          deltaX: gestureState.dx,
          deltaY: gestureState.dy,
        });
      },
      onPanResponderRelease: () => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          onGesture({ type: 'doubleTap' });
        } else {
          onGesture({ type: 'tap' });
        }
        lastTap.current = now;
      },
    }),
  ).current;

  return <View style={styles.touchPad} {...panResponder.panHandlers} />;
}

const styles = StyleSheet.create({
  touchPad: {
    height: 220,
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    marginVertical: 16,
  },
});
