import { useCallback } from 'react';
import { Alert, Share } from 'react-native';

import { showToast } from '@/src/shared/components/Toast';
import { COPIED_LABEL, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { SUPPORT_EMAIL } from './contact';

const NO_MAIL_APP_TITLE = 'No mail app';
const NO_MAIL_APP_BODY = `No mail app is set up on this device. Write to ${SUPPORT_EMAIL}.`;

export function useNoMailAppAlert(): () => void {
  const { copy } = useCopyAction();

  return useCallback(() => {
    Alert.alert(NO_MAIL_APP_TITLE, NO_MAIL_APP_BODY, [
      {
        text: 'Copy address',
        onPress: () => {
          void (async () => {
            if (await copy(SUPPORT_EMAIL)) showToast(COPIED_LABEL);
          })();
        },
      },
      {
        text: 'Share address',
        onPress: () => void Share.share({ message: SUPPORT_EMAIL }).catch(() => undefined),
      },
      { text: 'OK', style: 'cancel' },
    ]);
  }, [copy]);
}
