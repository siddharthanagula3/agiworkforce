'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, GitFork, Play, Sparkles, X } from 'lucide-react';
import {
  deriveFollowUps,
  followUpAsksForWebSearch,
  type FollowUpType,
} from '@agiworkforce/unified-chat/follow-ups';
import { markdownLineText } from '@agiworkforce/unified-chat/markdown-document';
import { cn } from '@shared/lib/utils';

export interface FollowUpSuggestionsProps {
  lastAssistantContent: string;
  lastUserContent?: string;
  onSelect: (prompt: string) => void;
  isGenerating?: boolean;
  isUserTyping?: boolean;
  messageCount?: number;
  /**
   * Questions a model wrote from this answer and its sources. They replace the
   * keyword matcher when present; the matcher stands in when the chat is
   * temporary or the generation failed.
   */
  suggestions?: readonly string[];
  searchUnavailable?: boolean;
  className?: string;
}

const TYPE_ICONS: Record<FollowUpType, typeof ChevronDown> = {
  deeper: ChevronDown,
  alternative: GitFork,
  apply: Play,
  discover: Sparkles,
};

const containerVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: 'easeOut' as const,
      staggerChildren: 0.06,
      delayChildren: 0.3,
    },
  },
} as const;

const pillVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' as const },
  },
} as const;

export function FollowUpSuggestions({
  lastAssistantContent,
  lastUserContent,
  onSelect,
  isGenerating = false,
  isUserTyping = false,
  messageCount = 0,
  suggestions,
  searchUnavailable = false,
  className,
}: FollowUpSuggestionsProps) {
  const followUps = useMemo(() => {
    const candidates =
      suggestions && suggestions.length > 0
        ? suggestions.slice(0, 3).map((text, index) => ({
            id: `followup-generated-${index}`,
            text,
            type: 'deeper' as FollowUpType,
          }))
        : deriveFollowUps(lastAssistantContent, messageCount, lastUserContent);
    const seen = new Set<string>();
    return candidates.flatMap((candidate) => {
      const text = markdownLineText(candidate.text);
      if (!text || seen.has(text)) return [];
      if (searchUnavailable && followUpAsksForWebSearch(text)) return [];
      seen.add(text);
      return [{ ...candidate, text }];
    });
  }, [suggestions, lastAssistantContent, messageCount, lastUserContent, searchUnavailable]);
  const [dismissed, setDismissed] = useState(false);

  if (isGenerating || followUps.length === 0 || dismissed) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
        className={cn(
          'flex flex-wrap items-center gap-2 pt-2 pb-1',
          'transition-opacity duration-quick',
          isUserTyping && 'pointer-events-none opacity-0',
          className,
        )}
        role="group"
        aria-label="Follow-up suggestions"
      >
        {followUps.map((fu) => {
          const Icon = TYPE_ICONS[fu.type];
          return (
            <motion.button
              key={fu.id}
              type="button"
              variants={pillVariants}
              onClick={() => onSelect(fu.text)}
              className={cn(
                'group/pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5',
                'pointer-coarse:min-h-11',
                'border border-border/40 bg-card/50 backdrop-blur-sm',
                'text-xs font-medium text-muted-foreground max-md:text-sm',
                'transition-all duration-quick',
                'hover:border-primary/30 hover:bg-primary/5 hover:text-foreground hover:shadow-e1',
                'active:scale-[0.97]',
              )}
            >
              <Icon className="h-3 w-3 shrink-0 opacity-60" />
              <span>{fu.text}</span>
              <ArrowRight className="h-3 w-3 opacity-0 transition-opacity duration-quick group-hover/pill:opacity-100" />
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          variants={pillVariants}
          onClick={() => setDismissed(true)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5',
            'pointer-coarse:min-h-11',
            'text-xs text-muted-foreground',
            'transition-colors duration-quick',
            'hover:text-muted-foreground hover:bg-muted/50',
          )}
          aria-label="Hide suggestions"
        >
          <X className="h-3 w-3" />
          <span>Hide</span>
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
