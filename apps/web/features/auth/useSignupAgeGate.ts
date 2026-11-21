'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  evaluateAccountAge,
  type AccountAgeRefusal,
  type AccountAgeVerdict,
} from '@agiworkforce/types';

/**
 * The age question's own state. `admit` runs the action only for an eligible
 * entry and otherwise refuses: nothing is called, the field says why, focus
 * moves to it. The typed age lives in this state alone and is gone when the
 * screen unmounts.
 */
export interface SignupAgeGate {
  age: string;
  verdict: AccountAgeVerdict;
  refusedAs: AccountAgeRefusal | null;
  fieldRef: RefObject<HTMLInputElement | null>;
  enter: (age: string) => void;
  admit: (attempt: () => void) => boolean;
}

export function useSignupAgeGate(): SignupAgeGate {
  const [age, setAge] = useState('');
  const [refusedAs, setRefusedAs] = useState<AccountAgeRefusal | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const verdict = evaluateAccountAge(age);

  const enter = useCallback((next: string) => {
    setAge(next);
    if (evaluateAccountAge(next) === 'eligible') setRefusedAs(null);
  }, []);

  const admit = useCallback(
    (attempt: () => void): boolean => {
      if (verdict === 'eligible') {
        attempt();
        return true;
      }
      setRefusedAs(verdict);
      fieldRef.current?.focus();
      return false;
    },
    [verdict],
  );

  return { age, verdict, refusedAs, fieldRef, enter, admit };
}
