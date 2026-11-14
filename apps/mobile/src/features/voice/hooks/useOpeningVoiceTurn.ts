import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { takeVoiceHandoff, type VoiceHandoff } from '@/src/features/voice/services/voiceHandoff';

export function useOpeningVoiceTurn(
  conversationId: string | undefined,
  barVisible: boolean,
  openBar: (next: boolean) => void,
) {
  const [openingTurn, setOpeningTurn] = useState<VoiceHandoff | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return;
      const handoff = takeVoiceHandoff(conversationId);
      if (!handoff) return;
      setOpeningTurn(handoff);
      openBar(true);
    }, [conversationId, openBar]),
  );

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (wasVisibleRef.current && !barVisible) setOpeningTurn(null);
    wasVisibleRef.current = barVisible;
  }, [barVisible]);

  const onOpeningTurnStarted = useCallback(() => setOpeningTurn(null), []);

  return { openingTurn, onOpeningTurnStarted };
}
