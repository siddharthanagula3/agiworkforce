import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { onPasskeyRequired } from '@/src/features/auth/services/accountSecurityEvents';
import { verifyAccountSecurityInBrowser } from '@/src/features/auth/services/accountSecurityVerification';
import { toUserMessage } from '@/services/userMessage';
import { useTermsAcceptanceStore } from '@/src/features/auth/store/termsAcceptanceStore';

/**
 * A passkey step-up can interrupt the Terms check at sign-in, which then sits
 * on its error until someone retries it. Once the step-up succeeds, the check
 * runs again so sign-in carries on by itself.
 */
function resumeTermsCheck(): void {
  const terms = useTermsAcceptanceStore.getState();
  if (terms.userId && terms.status === 'error') void terms.verify(terms.userId);
}

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
                  .then((outcome) => {
                    if (outcome === 'verified') resumeTermsCheck();
                  })
                  .catch((error: unknown) => {
                    Alert.alert(
                      'Verification did not finish',
                      toUserMessage(error, 'Try again from any screen.'),
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
