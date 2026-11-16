import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import {
  acknowledgeLocalDataReset,
  loadPendingLocalDataReset,
  useLocalDataResetStore,
  type LocalDataResetKind,
} from '@/storage/localDataReset';

export function localDataResetCopy(kinds: readonly LocalDataResetKind[]): {
  title: string;
  body: string;
} {
  const chats = kinds.includes('chats');
  const memory = kinds.includes('memory');
  const lost =
    chats && memory ? 'Local chats and saved memories' : chats ? 'Local chats' : 'Saved memories';
  const models = memory ? ' Download on-device models again to use them.' : '';
  return {
    title: `${lost} not restored`,
    body: `${lost} from your previous phone are encrypted with a key that never leaves that phone, so this phone starts fresh.${models}`,
  };
}

export function LocalDataResetNotice(): null {
  const pending = useLocalDataResetStore((state) => state.pending);
  const showing = useRef(false);

  useEffect(() => {
    loadPendingLocalDataReset();
  }, []);

  useEffect(() => {
    if (showing.current || pending.length === 0) return;
    showing.current = true;
    const shown = [...pending];
    const { title, body } = localDataResetCopy(shown);
    Alert.alert(
      title,
      body,
      [
        {
          text: 'OK',
          onPress: () => {
            showing.current = false;
            acknowledgeLocalDataReset(shown);
          },
        },
      ],
      { cancelable: false },
    );
  }, [pending]);

  return null;
}
