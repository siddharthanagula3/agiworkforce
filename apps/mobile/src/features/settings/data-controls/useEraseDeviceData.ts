import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { wipeAllLocalData } from '@/services/dsarExport';
import { resetLocalInMemoryState } from './localDataSnapshot';

export function useEraseDeviceData(onErased: () => void) {
  const [isWiping, setIsWiping] = useState(false);

  const eraseDeviceData = useCallback(() => {
    Alert.alert(
      'Delete all local data?',
      'This permanently deletes all conversations, memory, settings, and downloaded models from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'All local data will be wiped. You will be signed out and returned to onboarding.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsWiping(true);
                    try {
                      await wipeAllLocalData({ afterPersistentWipe: resetLocalInMemoryState });
                      onErased();
                    } catch {
                      setIsWiping(false);
                      Alert.alert('Wipe failed', 'Could not delete all local data. Try again.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [onErased]);

  return { isWiping, eraseDeviceData };
}
