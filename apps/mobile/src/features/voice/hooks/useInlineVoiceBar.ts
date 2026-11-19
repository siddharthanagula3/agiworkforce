import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useFocusBoundVisibility(conversationKey: string) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const focusedRef = useRef(false);

  const setVisible = useCallback(
    (next: boolean) => {
      if (next && !focusedRef.current) return;
      setOpenFor(next ? conversationKey : null);
    },
    [conversationKey],
  );

  // The cleanup runs on blur and again whenever the key changes, so the surface
  // never outlives the screen focus or the conversation it was opened for.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        setOpenFor((openKey) => (openKey === conversationKey ? null : openKey));
      };
    }, [conversationKey]),
  );

  return [openFor === conversationKey, setVisible] as const;
}
