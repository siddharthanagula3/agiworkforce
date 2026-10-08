'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  evaluateAccountAge,
  type AccountAgeRefusal,
  type AccountAgeVerdict,
} from '@agiworkforce/types';

/**
 * The one decision on whether a sign-up attempt may start. Every entry point
 * (each provider button, the email form, a passkey) hands its action to
 * `admit`, which runs it only for an eligible age and otherwise refuses:
 * nothing is called, the field says why, focus moves to it. The typed age
 * lives in this state alone: no attempt is handed it and nothing writes it
 * anywhere, so it is gone when the screen unmounts.
 */
export interface SignupAgeGate {
  required: boolean;
  age: string;
  verdict: AccountAgeVerdict;
  refusedAs: AccountAgeRefusal | null;
  fieldRef: RefObject<HTMLInputElement | null>;
  enter: (age: string) => void;
  forget: () => void;
  admit: (attempt: () => void) => boolean;
}

export function useSignupAgeGate(required: boolean): SignupAgeGate {
  const [age, setAge] = useState('');
  const [refusedAs, setRefusedAs] = useState<AccountAgeRefusal | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const verdict = evaluateAccountAge(age);

  const enter = useCallback((next: string) => {
    setAge(next);
    if (evaluateAccountAge(next) === 'eligible') setRefusedAs(null);
  }, []);

  const forget = useCallback(() => {
    setAge('');
    setRefusedAs(null);
  }, []);

  const admit = useCallback(
    (attempt: () => void): boolean => {
      if (!required || verdict === 'eligible') {
        attempt();
        return true;
      }
      setRefusedAs(verdict);
      fieldRef.current?.focus();
      return false;
    },
    [required, verdict],
  );

  return { required, age, verdict, refusedAs, fieldRef, enter, forget, admit };
}
