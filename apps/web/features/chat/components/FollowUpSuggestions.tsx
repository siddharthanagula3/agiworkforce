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
 *
 * v2 improvements:
 *  - Type-aware suggestions (deeper, alternative, apply, discover)
 *  - Per-type Lucide icons on each pill
 *  - 15 topic categories (up from 9)
 *  - Capability discovery pills that surface platform features
 *  - Fade-out when user starts typing (isUserTyping prop)
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, GitFork, Play, Sparkles, X } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowUpType = 'deeper' | 'alternative' | 'apply' | 'discover';

export interface FollowUpSuggestionsProps {
  /** The content of the last assistant message */
  lastAssistantContent: string;
  /** Called when the user clicks a follow-up pill */
  onSelect: (prompt: string) => void;
  /** Whether the assistant is currently generating a response */
  isGenerating?: boolean;
  /** When true, suggestions fade out (user is typing in the composer) */
  isUserTyping?: boolean;
  /** Total message count in the conversation (enables turn-aware suggestions) */
  messageCount?: number;
  /** Optional className for the container */
  className?: string;
}

export interface FollowUp {
  id: string;
  text: string;
  type: FollowUpType;
}

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<FollowUpType, typeof ChevronDown> = {
  deeper: ChevronDown,
  alternative: GitFork,
  apply: Play,
  discover: Sparkles,
};

// ---------------------------------------------------------------------------
// Follow-up generation logic
//
// Uses lightweight heuristics to produce 2-3 contextual follow-ups.
// No LLM call required -- keeps the UI instant.
// ---------------------------------------------------------------------------

interface TopicEntry {
  pattern: RegExp;
  followUps: Array<{ text: string; type: FollowUpType }>;
}

/** Topic patterns: regex -> array of typed follow-up templates */
const TOPIC_FOLLOW_UPS: TopicEntry[] = [
  // Code-related
  {
    pattern: /\b(function|class|component|module|interface|type|struct)\b/i,
    followUps: [
      { text: 'Can you add unit tests for this?', type: 'apply' },
      { text: 'How would you handle error cases?', type: 'deeper' },
      { text: 'Can you optimize this for performance?', type: 'alternative' },
    ],
  },
  // Bug / error
  {
    pattern: /\b(error|bug|issue|fix|debug|crash|exception|fail)\b/i,
    followUps: [
      { text: 'What could cause this to happen again?', type: 'deeper' },
      { text: 'Are there any related issues I should check?', type: 'discover' },
      { text: 'How can I prevent this in the future?', type: 'alternative' },
    ],
  },
  // Lists / steps
  {
    pattern: /(?:^|\n)\s*(?:\d+[.):]|[-*])\s/m,
    followUps: [
      { text: 'Can you go deeper on one of these points?', type: 'deeper' },
      { text: 'Which of these should I prioritize?', type: 'alternative' },
      { text: 'Can you give a concrete example?', type: 'apply' },
    ],
  },
  // Strategy / plan
  {
    pattern: /\b(strategy|plan|roadmap|approach|framework|methodology)\b/i,
    followUps: [
      { text: 'What are the potential risks?', type: 'deeper' },
      { text: 'How long would this take to implement?', type: 'apply' },
      { text: 'What resources would be needed?', type: 'discover' },
    ],
  },
  // Comparison
  {
    pattern: /\b(vs\.?|versus|compared|comparison|difference|pros\s+and\s+cons|trade-?off)\b/i,
    followUps: [
      { text: 'Which would you recommend for my use case?', type: 'alternative' },
      { text: 'Are there other alternatives to consider?', type: 'discover' },
      { text: 'What are the long-term implications?', type: 'deeper' },
    ],
  },
  // Explanation / concept
  {
    pattern: /\b(means?|concept|definition|refers?\s+to|in\s+other\s+words|simply\s+put)\b/i,
    followUps: [
      { text: 'Can you give a real-world example?', type: 'apply' },
      { text: 'How does this relate to other concepts?', type: 'deeper' },
      { text: 'What are common misconceptions about this?', type: 'alternative' },
    ],
  },
  // Health / fitness
  {
    pattern: /\b(exercise|workout|diet|nutrition|calorie|health|wellness|sleep)\b/i,
    followUps: [
      { text: 'Can you adjust this for a beginner?', type: 'alternative' },
      { text: 'What should I avoid while doing this?', type: 'deeper' },
      { text: 'How long until I see results?', type: 'discover' },
    ],
  },
  // Finance
  {
    pattern: /\b(invest|budget|savings?|tax|portfolio|income|expense|financial)\b/i,
    followUps: [
      { text: 'What is the risk level of this approach?', type: 'deeper' },
      { text: 'How should I adjust this based on my income?', type: 'alternative' },
      { text: 'Are there any tax implications?', type: 'discover' },
    ],
  },
  // Writing
  {
    pattern: /\b(draft|article|blog|email|letter|essay|copy|content)\b/i,
    followUps: [
      { text: 'Can you make this more concise?', type: 'apply' },
      { text: 'Can you adjust the tone to be more formal?', type: 'alternative' },
      { text: 'Can you add a call-to-action?', type: 'apply' },
    ],
  },
  // ---------- NEW CATEGORIES (v2) ----------
  // Database / SQL
  {
    pattern: /\b(database|sql|query|table|schema|migration|index|join|postgres|mysql|sqlite)\b/i,
    followUps: [
      { text: 'How can I optimize this query?', type: 'apply' },
      { text: 'What indexes would improve performance?', type: 'deeper' },
      { text: 'Are there any data integrity risks?', type: 'discover' },
    ],
  },
  // DevOps / deployment
  {
    pattern:
      /\b(deploy|docker|kubernetes|ci[\s/]?cd|pipeline|terraform|ansible|nginx|container|infrastructure)\b/i,
    followUps: [
      { text: 'How would I set up monitoring for this?', type: 'apply' },
      { text: 'What is the rollback strategy?', type: 'alternative' },
      { text: 'How would this scale under high load?', type: 'deeper' },
    ],
  },
  // Security
  {
    pattern:
      /\b(security|vulnerability|auth|authentication|authorization|encrypt|xss|csrf|injection|oauth|jwt)\b/i,
    followUps: [
      { text: 'What other attack vectors should I consider?', type: 'deeper' },
      { text: 'Can you provide a security checklist?', type: 'apply' },
      { text: 'How would an attacker try to bypass this?', type: 'alternative' },
    ],
  },
  // Testing
  {
    pattern:
      /\b(test|spec|assertion|mock|stub|coverage|e2e|integration\s+test|unit\s+test|vitest|jest|cypress)\b/i,
    followUps: [
      { text: 'What edge cases should I add tests for?', type: 'deeper' },
      { text: 'Can you add a negative test case?', type: 'alternative' },
      { text: 'How can I improve test coverage?', type: 'apply' },
    ],
  },
  // API / REST
  {
    pattern:
      /\b(api|endpoint|rest|graphql|webhook|http|request|response|payload|route|middleware)\b/i,
    followUps: [
      { text: 'How should I handle rate limiting?', type: 'deeper' },
      { text: 'What error responses should this return?', type: 'alternative' },
      { text: 'Can you generate the API documentation?', type: 'apply' },
    ],
  },
  // Data science / ML
  {
    pattern:
      /\b(model|training|dataset|accuracy|precision|recall|neural|regression|classification|embedding|tensor|gradient)\b/i,
    followUps: [
      { text: 'How can I reduce overfitting?', type: 'deeper' },
      { text: 'What alternative models should I try?', type: 'alternative' },
      { text: 'How should I evaluate performance?', type: 'apply' },
    ],
  },
];

/** Generic fallbacks when no topic pattern matches */
const GENERIC_FOLLOW_UPS: Array<{ text: string; type: FollowUpType }> = [
  { text: 'Tell me more about this', type: 'deeper' },
  { text: 'Can you give an example?', type: 'apply' },
  { text: 'What are the next steps?', type: 'apply' },
  { text: 'How can I apply this?', type: 'apply' },
  { text: 'What should I watch out for?', type: 'deeper' },
  { text: 'Can you summarize the key points?', type: 'alternative' },
];

/**
 * Derive 2-3 contextual follow-up questions from assistant content.
 * Returns typed suggestions with per-type icons for the UI.
 */
export function deriveFollowUps(content: string, messageCount: number): FollowUp[] {
  if (!content || content.trim().length < 20) return [];

  // Cap content length to prevent ReDoS on very long LLM responses
  const sample = content.length > 4000 ? content.slice(0, 4000) : content;

  const matched: Array<{ text: string; type: FollowUpType }> = [];
  const seenTexts = new Set<string>();

  const addUnique = (item: { text: string; type: FollowUpType }) => {
    if (!seenTexts.has(item.text) && matched.length < 5) {
      seenTexts.add(item.text);
      matched.push(item);
    }
  };

  // Collect follow-ups from matching topic patterns
  for (const { pattern, followUps } of TOPIC_FOLLOW_UPS) {
    if (pattern.test(sample)) {
      for (const fu of followUps) {
        addUnique(fu);
        if (matched.length >= 5) break;
      }
    }
    if (matched.length >= 5) break;
  }

  // --- Capability discovery: surface platform features based on content ---

  // When the response contains code blocks, offer to run it
  if (/```[\s\S]{10,}```/.test(sample)) {
    addUnique({ text: 'Run this code', type: 'apply' });
  }

  // When the response makes factual claims, offer web verification
  if (
    /\b(according to|studies show|research indicates|data suggests|as of \d{4})\b/i.test(sample)
  ) {
    addUnique({ text: 'Search the web to verify', type: 'discover' });
  }

  // After 5+ turns (10+ messages including user+assistant), offer summarization
  if (messageCount >= 10) {
    addUnique({ text: 'Summarize this conversation', type: 'apply' });
  }

  // If we have fewer than 2, supplement with generics
  if (matched.length < 2) {
    const contentIsLong = content.length > 500;
    const genericPool = contentIsLong
      ? GENERIC_FOLLOW_UPS.filter((_, i) => i < 3) // summary-style for long responses
      : GENERIC_FOLLOW_UPS.filter((_, i) => i >= 1 && i <= 4); // example/action-style

    for (const g of genericPool) {
      addUnique(g);
      if (matched.length >= 3) break;
    }
  }

  // Take up to 3
  const selected = matched.slice(0, 3);

  return selected.map((item, i) => ({
    id: `followup-${i}`,
    text: item.text,
    type: item.type,
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
  isUserTyping = false,
  messageCount = 0,
  className,
}: FollowUpSuggestionsProps) {
  const followUps = useMemo(
    () => deriveFollowUps(lastAssistantContent, messageCount),
    [lastAssistantContent, messageCount],
  );
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
        className={cn(
          'flex flex-wrap items-center gap-2 pt-2 pb-1',
          'transition-opacity duration-200',
          isUserTyping && 'pointer-events-none opacity-0',
          className,
        )}
        role="list"
        aria-label="Follow-up suggestions"
      >
        {followUps.map((fu) => {
          const Icon = TYPE_ICONS[fu.type];
          return (
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
              <Icon className="h-3 w-3 shrink-0 opacity-60" />
              <span>{fu.text}</span>
              <ArrowRight className="h-3 w-3 opacity-0 transition-opacity duration-150 group-hover/pill:opacity-100" />
            </motion.button>
          );
        })}
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
