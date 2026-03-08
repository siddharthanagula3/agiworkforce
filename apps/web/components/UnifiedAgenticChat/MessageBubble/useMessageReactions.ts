/**
 * useMessageReactions Hook
 *
 * Handles message reaction state and handlers.
 */

import { useCallback, useEffect, useState } from 'react';
import React from 'react';
import { ThumbsUp, ThumbsDown, Heart, Laugh, Lightbulb, PartyPopper } from 'lucide-react';
import { MessageReaction, useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';
import { ReactionConfig } from './types';

interface UseMessageReactionsOptions {
  messageId: string;
}

interface UseMessageReactionsReturn {
  /** Available reaction configurations */
  reactions: ReactionConfig[];
  /** Whether the reaction picker is visible */
  showReactionPicker: boolean;
  /** Toggle reaction picker visibility */
  setShowReactionPicker: (show: boolean) => void;
  /** Handle a reaction being clicked */
  handleReaction: (reaction: MessageReaction) => void;
}

/**
 * Default reaction configurations
 */

const REACTION_CONFIGS: ReactionConfig[] = [
  { type: 'thumbsUp', icon: React.createElement(ThumbsUp, { size: 14 }) as any, label: 'Like' },
  {
    type: 'thumbsDown',
    icon: React.createElement(ThumbsDown, { size: 14 }) as any,
    label: 'Dislike',
  },
  { type: 'heart', icon: React.createElement(Heart, { size: 14 }) as any, label: 'Love' },
  { type: 'laugh', icon: React.createElement(Laugh, { size: 14 }) as any, label: 'Funny' },
  {
    type: 'thinking',
    icon: React.createElement(Lightbulb, { size: 14 }) as any,
    label: 'Insightful',
  },
  {
    type: 'celebrate',
    icon: React.createElement(PartyPopper, { size: 14 }) as any,
    label: 'Celebrate',
  },
];

export function useMessageReactions({
  messageId,
}: UseMessageReactionsOptions): UseMessageReactionsReturn {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const toggleMessageReaction = useUnifiedChatStore((state) => state.toggleMessageReaction);

  const handleReaction = useCallback(
    (reaction: MessageReaction) => {
      toggleMessageReaction(messageId, reaction);
      setShowReactionPicker(false);
    },
    [messageId, toggleMessageReaction],
  );

  // Close reaction picker on click outside
  useEffect(() => {
    if (!showReactionPicker) return;

    const handleClick = () => setShowReactionPicker(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowReactionPicker(false);
    };

    // Small delay to prevent immediate close when opening
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showReactionPicker]);

  return {
    reactions: REACTION_CONFIGS,
    showReactionPicker,
    setShowReactionPicker,
    handleReaction,
  };
}
