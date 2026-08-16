
import { useCallback, useEffect, useState } from 'react';
import React from 'react';
import { ThumbsUp, ThumbsDown, Heart, Laugh, Lightbulb, PartyPopper } from 'lucide-react';
import { MessageReaction, useUnifiedChatStore } from '../../../stores/unifiedChatStore';
import { ReactionConfig } from './types';

interface UseMessageReactionsOptions {
  messageId: string;
}

interface UseMessageReactionsReturn {
  reactions: ReactionConfig[];
  showReactionPicker: boolean;
  setShowReactionPicker: (show: boolean) => void;
  handleReaction: (reaction: MessageReaction) => void;
}

const REACTION_CONFIGS: ReactionConfig[] = [
  { type: 'thumbsUp', icon: React.createElement(ThumbsUp, { size: 14 }), label: 'Like' },
  { type: 'thumbsDown', icon: React.createElement(ThumbsDown, { size: 14 }), label: 'Dislike' },
  { type: 'heart', icon: React.createElement(Heart, { size: 14 }), label: 'Love' },
  { type: 'laugh', icon: React.createElement(Laugh, { size: 14 }), label: 'Funny' },
  { type: 'thinking', icon: React.createElement(Lightbulb, { size: 14 }), label: 'Insightful' },
  { type: 'celebrate', icon: React.createElement(PartyPopper, { size: 14 }), label: 'Celebrate' },
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

  useEffect(() => {
    if (!showReactionPicker) return;

    const handleClick = () => setShowReactionPicker(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowReactionPicker(false);
    };

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
