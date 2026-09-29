import { usePreventRemove, useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';

export function confirmDiscardChanges(onDiscard: () => void): void {
  Alert.alert('Discard changes?', 'You have unsaved changes.', [
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
    { text: 'Keep Editing', style: 'cancel' },
  ]);
}

export function useUnsavedChangesGuard(dirty: boolean): void {
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => {
    confirmDiscardChanges(() => navigation.dispatch(data.action));
  });
}
