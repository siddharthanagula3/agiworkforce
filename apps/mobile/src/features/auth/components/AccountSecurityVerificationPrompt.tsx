import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { onPasskeyRequired } from '@/src/features/auth/services/accountSecurityEvents';
import { verifyAccountSecurityInBrowser } from '@/src/features/auth/services/accountSecurityVerification';

export function AccountSecurityVerificationPrompt() {
  const open = useRef(false);

  useEffect(
    () =>
      onPasskeyRequired(() => {
        if (open.current) return;
        open.current = true;
        Alert.alert(
          "Verify it's you",
          'Advanced Account Security is on for this account. Continue in your browser with one of your passkeys or security keys.',
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: () => {
                open.current = false;
              },
            },
            {
              text: 'Continue',
              onPress: () => {
                verifyAccountSecurityInBrowser()
                  .catch((error: unknown) => {
                    Alert.alert(
                      'Verification did not finish',
                      error instanceof Error && error.message
                        ? error.message
                        : 'Try again from any screen.',
                    );
                  })
                  .finally(() => {
                    open.current = false;
                  });
              },
            },
          ],
          { cancelable: false },
        );
      }),
    [],
  );

  return null;
}
