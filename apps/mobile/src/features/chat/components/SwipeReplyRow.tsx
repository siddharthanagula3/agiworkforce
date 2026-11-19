import { useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Reply } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ColorScheme } from '@/src/ui/theme';
import type { ChatMessage } from '@/types/chat';
import {
  SideScrollerRegistry,
  type RegisterSideScroller,
  type SideScrollerRef,
} from './SideScroller';

/** Only a rightward drag opens the reply action, so a leftward drag never starts it. */
export const SWIPE_REPLY_LEFTWARD_OFFSET = Number.MAX_SAFE_INTEGER;

interface SwipeReplyRowProps {
  message: ChatMessage;
  onSwipeReply?: (message: ChatMessage) => void;
  colors: ColorScheme;
  children: ReactNode;
}

export function SwipeReplyRow({ message, onSwipeReply, colors, children }: SwipeReplyRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [sideScrollers, setSideScrollers] = useState<SideScrollerRef[]>([]);

  const registerSideScroller = useCallback<RegisterSideScroller>((ref) => {
    setSideScrollers((current) => (current.includes(ref) ? current : [...current, ref]));
    return () => setSideScrollers((current) => current.filter((entry) => entry !== ref));
  }, []);

  const renderLeftActions = useCallback(() => {
    return (
      <View
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          width: 60,
          marginRight: 4,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.accentSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Reply size={18} color={colors.teal} />
        </View>
      </View>
    );
  }, [colors]);

  const handleSwipeOpen = useCallback(
    (direction: 'left' | 'right') => {
      if (direction !== 'left') return;
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSwipeReply?.(message);
      swipeableRef.current?.close();
    },
    [message, onSwipeReply, hapticsEnabled],
  );

  if (!onSwipeReply) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={handleSwipeOpen}
      overshootLeft={false}
      friction={2}
      dragOffsetFromRightEdge={SWIPE_REPLY_LEFTWARD_OFFSET}
      waitFor={sideScrollers}
    >
      <SideScrollerRegistry.Provider value={registerSideScroller}>
        {children}
      </SideScrollerRegistry.Provider>
    </Swipeable>
  );
}
