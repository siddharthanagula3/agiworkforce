'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';

/**
 * The one decision on whether a sign-up attempt may start. Every entry point
 * (each provider button, the email form, a passkey) hands its action to
 * `admit`, which runs it only once the person has ticked the consent box and
 * otherwise refuses: nothing is called, the box is marked, focus moves to it.
 */
export interface SignupConsentGate {
  required: boolean;
  confirmed: boolean;
  refused: boolean;
  checkboxRef: RefObject<HTMLInputElement | null>;
  confirm: (next: boolean) => void;
  admit: (attempt: () => void) => boolean;
}

export function useSignupConsentGate(required: boolean): SignupConsentGate {
  const [confirmed, setConfirmed] = useState(false);
  const [refused, setRefused] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((next: boolean) => {
    setConfirmed(next);
    if (next) setRefused(false);
  }, []);

  const admit = useCallback(
    (attempt: () => void): boolean => {
      if (!required || confirmed) {
        attempt();
        return true;
      }
      setRefused(true);
      checkboxRef.current?.focus();
      return false;
    },
    [confirmed, required],
  );

  return { required, confirmed, refused, checkboxRef, confirm, admit };
}
