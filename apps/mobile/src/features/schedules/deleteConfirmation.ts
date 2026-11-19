import { Alert } from 'react-native';

export function describeScheduleDeletion(name: string | undefined): string {
  const subject = name?.trim() ? `"${name.trim()}"` : 'This schedule';
  return `${subject} stops running, and its run history and event triggers are deleted. This cannot be undone.`;
}

export function confirmScheduleDeletion(name: string | undefined, onDelete: () => void): void {
  Alert.alert('Delete schedule?', describeScheduleDeletion(name), [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
}
