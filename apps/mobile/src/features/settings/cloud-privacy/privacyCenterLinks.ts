import { Alert } from 'react-native';

export async function openOrAlert(open: () => Promise<boolean>): Promise<void> {
  const opened = await open();
  if (!opened) Alert.alert('Error', 'Could not open the link. Please try again.');
}
