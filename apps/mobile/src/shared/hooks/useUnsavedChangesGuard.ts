import { useCallback, useEffect, useRef } from 'react';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert } from 'react-native';

export function confirmDiscardChanges(onDiscard: () => void): void {
  Alert.alert('Discard changes?', 'You have unsaved changes.', [
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
    { text: 'Keep Editing', style: 'cancel' },
  ]);
}

// expo-router ships its own copy of React Navigation; hooks imported from
// @react-navigation/native read a different context and throw at render.
// A drawer screen is never removed on Back, so the screen's own cancel and
// back controls must go through the returned function as well.
export function useUnsavedChangesGuard(dirty: boolean): (leave: () => void) => void {
  const navigation = useNavigation();
  const discardedRef = useRef(false);
  useEffect(() => {
    if (!dirty) discardedRef.current = false;
  }, [dirty]);

  usePreventRemove(dirty, ({ data }) => {
    if (discardedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    confirmDiscardChanges(() => navigation.dispatch(data.action));
  });

  return useCallback(
    (leave: () => void) => {
      if (!dirty) {
        leave();
        return;
      }
      confirmDiscardChanges(() => {
        discardedRef.current = true;
        leave();
      });
    },
    [dirty],
  );
}
