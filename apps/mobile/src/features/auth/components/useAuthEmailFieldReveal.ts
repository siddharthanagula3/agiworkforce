import { useRef } from 'react';
import { Platform, type TextInput, type View } from 'react-native';
import {
  useFocusedFieldReveal,
  type MeasurableScrollView,
} from '@/src/features/settings/personalization/personalizationFieldReveal';

// The Android build is edge-to-edge, so the screen pads itself for the keyboard
// but nothing scrolls the focused field into the padded viewport. iOS keeps its
// own behaviour and is left alone.
export function useAuthEmailFieldReveal() {
  const scrollRef = useRef<MeasurableScrollView>(null);
  const blockRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const { reveal, scrollProps } = useFocusedFieldReveal(scrollRef);
  const android = Platform.OS === 'android';

  return {
    scrollRef,
    scrollProps: android ? scrollProps : undefined,
    blockProps: { ref: blockRef, collapsable: false },
    inputProps: {
      ref: inputRef,
      onFocus: android ? () => reveal.focusField(blockRef, inputRef) : undefined,
      onBlur: android ? () => reveal.blurField(blockRef) : undefined,
    },
  };
}
