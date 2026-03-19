'use client';

/**
 * FollowUpSuggestions
 *
 * A horizontal row of clickable pills shown below the last assistant message.
 * Each pill represents a follow-up question derived from the conversation context.
 * Clicking a pill sends the text as a new user message.
 *
 * Rendered only when:
 *  - The last message is from the assistant
 *  - The assistant is NOT currently generating/streaming
 *  - There is meaningful content to derive suggestions from
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowUpSuggestionsProps {
  /** The content of the last assistant message */
  lastAssistantContent: string;
  /** Called when the user clicks a follow-up pill */
  onSelect: (prompt: string) => void;
  /** Whether the assistant is currently generating a response */
  isGenerating?: boolean;
  /** Optional className for the container */
  className?: string;
}

interface FollowUp {
  id: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Follow-up generation logic
//
// Uses lightweight heuristics to produce 2-3 contextual follow-ups.
// No LLM call required -- keeps the UI instant.
// ---------------------------------------------------------------------------

/** Topic patterns: regex -> array of follow-up templates */
const TOPIC_FOLLOW_UPS: Array<{ pattern: RegExp; followUps: string[] }> = [
  // Code-related
  {
    pattern: /\b(function|class|component|module|api|endpoint|interface|type|struct)\b/i,
    followUps: [
      'Can you add unit tests for this?',
      'How would you handle error cases?',
      'Can you optimize this for performance?',
    ],
  },
  // Bug / error
  {
    pattern: /\b(error|bug|issue|fix|debug|crash|exception|fail)\b/i,
    followUps: [
      'What could cause this to happen again?',
      'Are there any related issues I should check?',
      'How can I prevent this in the future?',
    ],
  },
  // Lists / steps
  {
    pattern: /(?:^|\n)\s*(?:\d+[.):]|[-*])\s/m,
    followUps: [
      'Can you go deeper on one of these points?',
      'Which of these should I prioritize?',
      'Can you give a concrete example?',
    ],
  },
  // Strategy / plan
  {
    pattern: /\b(strategy|plan|roadmap|approach|framework|methodology)\b/i,
    followUps: [
      'What are the potential risks?',
      'How long would this take to implement?',
      'What resources would be needed?',
    ],
  },
  // Comparison
  {
    pattern: /\b(vs\.?|versus|compared|comparison|difference|pros\s+and\s+cons|trade-?off)\b/i,
    followUps: [
      'Which would you recommend for my use case?',
      'Are there other alternatives to consider?',
      'What are the long-term implications?',
    ],
  },
  // Explanation / concept
  {
    pattern: /\b(means?|concept|definition|refers?\s+to|in\s+other\s+words|simply\s+put)\b/i,
    followUps: [
      'Can you give a real-world example?',
      'How does this relate to other concepts?',
      'What are common misconceptions about this?',
    ],
  },
  // Health / fitness
  {
    pattern: /\b(exercise|workout|diet|nutrition|calorie|health|wellness|sleep)\b/i,
    followUps: [
      'Can you adjust this for a beginner?',
      'What should I avoid while doing this?',
      'How long until I see results?',
    ],
  },
  // Finance
  {
    pattern: /\b(invest|budget|savings?|tax|portfolio|income|expense|financial)\b/i,
    followUps: [
      'What is the risk level of this approach?',
      'How should I adjust this based on my income?',
      'Are there any tax implications?',
    ],
  },
  // Writing
  {
    pattern: /\b(draft|article|blog|email|letter|essay|copy|content)\b/i,
    followUps: [
      'Can you make this more concise?',
      'Can you adjust the tone to be more formal?',
      'Can you add a call-to-action?',
    ],
  },
];

/** Generic fallbacks when no topic pattern matches */
const GENERIC_FOLLOW_UPS: string[] = [
  'Tell me more about this',
  'Can you give an example?',
  'What are the next steps?',
  'How can I apply this?',
  'What should I watch out for?',
  'Can you summarize the key points?',
];

/**
 * Derive 2-3 contextual follow-up questions from assistant content.
 */
function deriveFollowUps(content: string): FollowUp[] {
  if (!content || content.trim().length < 20) return [];

  const matched = new Set<string>();

  // Collect follow-ups from matching topic patterns
  for (const { pattern, followUps } of TOPIC_FOLLOW_UPS) {
    if (pattern.test(content)) {
      for (const fu of followUps) {
        matched.add(fu);
        if (matched.size >= 5) break;
      }
    }
    if (matched.size >= 5) break;
  }

  // If we have fewer than 2, supplement with generics
  if (matched.size < 2) {
    // Pick generics that feel relevant based on content length
    const contentIsLong = content.length > 500;
    const genericPool = contentIsLong
      ? GENERIC_FOLLOW_UPS.filter((_, i) => i < 3) // summary-style for long responses
      : GENERIC_FOLLOW_UPS.filter((_, i) => i >= 1 && i <= 4); // example/action-style

    for (const g of genericPool) {
      matched.add(g);
      if (matched.size >= 3) break;
    }
  }

  // Take up to 3
  const selected = Array.from(matched).slice(0, 3);

  return selected.map((text, i) => ({
    id: `followup-${i}`,
    text,
  }));
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FollowUpSuggestions({
  lastAssistantContent,
  onSelect,
  isGenerating = false,
  className,
}: FollowUpSuggestionsProps) {
  const followUps = useMemo(() => deriveFollowUps(lastAssistantContent), [lastAssistantContent]);
  const [dismissed, setDismissed] = useState(false);

  // Don't render while generating or if there are no suggestions
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
        className={cn('flex flex-wrap items-center gap-2 pt-2 pb-1', className)}
        role="list"
        aria-label="Follow-up suggestions"
      >
        {followUps.map((fu) => (
          <motion.button
            key={fu.id}
            variants={pillVariants}
            onClick={() => onSelect(fu.text)}
            role="listitem"
            className={cn(
              'group/pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5',
              'border border-border/40 bg-card/50 backdrop-blur-sm',
              'text-xs font-medium text-muted-foreground',
              'transition-all duration-150',
              'hover:border-primary/30 hover:bg-primary/5 hover:text-foreground hover:shadow-sm',
              'active:scale-[0.97]',
            )}
          >
            <span>{fu.text}</span>
            <ArrowRight className="h-3 w-3 opacity-0 transition-opacity duration-150 group-hover/pill:opacity-100" />
          </motion.button>
        ))}
        <motion.button
          variants={pillVariants}
          onClick={() => setDismissed(true)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5',
            'text-xs text-muted-foreground/60',
            'transition-colors duration-150',
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
