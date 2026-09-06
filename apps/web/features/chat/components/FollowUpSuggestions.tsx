'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, GitFork, Play, Sparkles, X } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export type FollowUpType = 'deeper' | 'alternative' | 'apply' | 'discover';

export interface FollowUpSuggestionsProps {
  lastAssistantContent: string;
  lastUserContent?: string;
  onSelect: (prompt: string) => void;
  isGenerating?: boolean;
  isUserTyping?: boolean;
  messageCount?: number;
  className?: string;
}

export interface FollowUp {
  id: string;
  text: string;
  type: FollowUpType;
}

const TYPE_ICONS: Record<FollowUpType, typeof ChevronDown> = {
  deeper: ChevronDown,
  alternative: GitFork,
  apply: Play,
  discover: Sparkles,
};

interface TopicEntry {
  pattern: RegExp;
  followUps: Array<{ text: string; type: FollowUpType }>;
}

const TOPIC_FOLLOW_UPS: TopicEntry[] = [
  {
    pattern:
      /(?:google\.com\/maps|openstreetmap\.org|\bmap(?:s)?\b|\bdirections?\b|\blocations?\b|\bnearby\b|\baddresses?\b)/i,
    followUps: [
      { text: 'What are the best things to do nearby?', type: 'discover' },
      { text: 'How do I get there?', type: 'apply' },
      { text: 'What should I know before visiting?', type: 'deeper' },
    ],
  },
  {
    pattern: /\b(function|class|component|module|interface|type|struct)\b/i,
    followUps: [
      { text: 'Can you add unit tests for this?', type: 'apply' },
      { text: 'How would you handle error cases?', type: 'deeper' },
      { text: 'Can you optimize this for performance?', type: 'alternative' },
    ],
  },
  {
    pattern: /\b(error|bug|issue|fix|debug|crash|exception|fail)\b/i,
    followUps: [
      { text: 'What could cause this to happen again?', type: 'deeper' },
      { text: 'Are there any related issues I should check?', type: 'discover' },
      { text: 'How can I prevent this in the future?', type: 'alternative' },
    ],
  },
  {
    pattern: /(?:^|\n)\s*(?:\d+[.):]|[-*])\s/m,
    followUps: [
      { text: 'Can you go deeper on one of these points?', type: 'deeper' },
      { text: 'Which of these should I prioritize?', type: 'alternative' },
      { text: 'Can you give a concrete example?', type: 'apply' },
    ],
  },
  {
    pattern: /\b(strategy|plan|roadmap|approach|framework|methodology)\b/i,
    followUps: [
      { text: 'What are the potential risks?', type: 'deeper' },
      { text: 'How long would this take to implement?', type: 'apply' },
      { text: 'What resources would be needed?', type: 'discover' },
    ],
  },
  {
    pattern: /\b(vs\.?|versus|compared|comparison|difference|pros\s+and\s+cons|trade-?off)\b/i,
    followUps: [
      { text: 'Which would you recommend for my use case?', type: 'alternative' },
      { text: 'Are there other alternatives to consider?', type: 'discover' },
      { text: 'What are the long-term implications?', type: 'deeper' },
    ],
  },
  {
    pattern: /\b(means?|concept|definition|refers?\s+to|in\s+other\s+words|simply\s+put)\b/i,
    followUps: [
      { text: 'Can you give a real-world example?', type: 'apply' },
      { text: 'How does this relate to other concepts?', type: 'deeper' },
      { text: 'What are common misconceptions about this?', type: 'alternative' },
    ],
  },
  {
    pattern: /\b(exercise|workout|diet|nutrition|calorie|health|wellness|sleep)\b/i,
    followUps: [
      { text: 'Can you adjust this for a beginner?', type: 'alternative' },
      { text: 'What should I avoid while doing this?', type: 'deeper' },
      { text: 'How long until I see results?', type: 'discover' },
    ],
  },
  {
    pattern: /\b(invest|budget|savings?|tax|portfolio|income|expense|financial)\b/i,
    followUps: [
      { text: 'What is the risk level of this approach?', type: 'deeper' },
      { text: 'How should I adjust this based on my income?', type: 'alternative' },
      { text: 'Are there any tax implications?', type: 'discover' },
    ],
  },
  {
    pattern: /\b(draft|article|blog|email|letter|essay|copy|content)\b/i,
    followUps: [
      { text: 'Can you make this more concise?', type: 'apply' },
      { text: 'Can you adjust the tone to be more formal?', type: 'alternative' },
      { text: 'Can you add a call-to-action?', type: 'apply' },
    ],
  },
  {
    pattern: /\b(database|sql|query|table|schema|migration|index|join|postgres|mysql|sqlite)\b/i,
    followUps: [
      { text: 'How can I optimize this query?', type: 'apply' },
      { text: 'What indexes would improve performance?', type: 'deeper' },
      { text: 'Are there any data integrity risks?', type: 'discover' },
    ],
  },
  {
    pattern:
      /\b(deploy|docker|kubernetes|ci[\s/]?cd|pipeline|terraform|ansible|nginx|container|infrastructure)\b/i,
    followUps: [
      { text: 'How would I set up monitoring for this?', type: 'apply' },
      { text: 'What is the rollback strategy?', type: 'alternative' },
      { text: 'How would this scale under high load?', type: 'deeper' },
    ],
  },
  {
    pattern:
      /\b(security|vulnerability|auth|authentication|authorization|encrypt|xss|csrf|injection|oauth|jwt)\b/i,
    followUps: [
      { text: 'What other attack vectors should I consider?', type: 'deeper' },
      { text: 'Can you provide a security checklist?', type: 'apply' },
      { text: 'How would an attacker try to bypass this?', type: 'alternative' },
    ],
  },
  {
    pattern:
      /\b(?:spec|assertion|mock|stub|coverage|vitest|jest|cypress|e2e|(?:unit|integration|end-to-end|negative|regression|acceptance)\s+tests?|test(?:ing)?\s+(?:case|suite|coverage|runner|framework|fixture|mock|strategy))\b/i,
    followUps: [
      { text: 'What edge cases should I add tests for?', type: 'deeper' },
      { text: 'Can you add a negative test case?', type: 'alternative' },
      { text: 'How can I improve test coverage?', type: 'apply' },
    ],
  },
  {
    pattern:
      /\b(api|endpoint|rest|graphql|webhook|http|request|response|payload|route|middleware)\b/i,
    followUps: [
      { text: 'How should I handle rate limiting?', type: 'deeper' },
      { text: 'What error responses should this return?', type: 'alternative' },
      { text: 'Can you generate the API documentation?', type: 'apply' },
    ],
  },
  {
    pattern:
      /\b(model|training|dataset|accuracy|precision|neural|linear\s+regression|logistic\s+regression|classification|embedding|tensor|gradient)\b/i,
    followUps: [
      { text: 'How can I reduce overfitting?', type: 'deeper' },
      { text: 'What alternative models should I try?', type: 'alternative' },
      { text: 'How should I evaluate performance?', type: 'apply' },
    ],
  },
];

const GENERIC_FOLLOW_UPS: Array<{ text: string; type: FollowUpType }> = [
  { text: 'Tell me more about this', type: 'deeper' },
  { text: 'Can you give an example?', type: 'apply' },
  { text: 'What are the next steps?', type: 'apply' },
  { text: 'How can I apply this?', type: 'apply' },
  { text: 'What should I watch out for?', type: 'deeper' },
  { text: 'Can you summarize the key points?', type: 'alternative' },
];

const USER_HIT_WEIGHT = 2;
const ASSISTANT_HIT_WEIGHT = 1;
const ASSISTANT_HITS_REQUIRED_WITHOUT_USER_SUPPORT = 2;

const TOPIC_MATCHERS = TOPIC_FOLLOW_UPS.map((entry) => ({
  followUps: entry.followUps,
  matcher: new RegExp(
    entry.pattern.source,
    entry.pattern.flags.includes('g') ? entry.pattern.flags : `${entry.pattern.flags}g`,
  ),
}));

function countDistinctMatches(text: string, matcher: RegExp): number {
  if (!text) return 0;
  matcher.lastIndex = 0;
  const seen = new Set<string>();
  for (const match of text.matchAll(matcher)) {
    const token = match[0].toLowerCase().trim();
    if (token) seen.add(token);
  }
  return seen.size;
}

export function deriveFollowUps(
  content: string,
  messageCount: number,
  lastUserContent?: string,
): FollowUp[] {
  if (!content || content.trim().length < 20) return [];

  const sample = content.length > 4000 ? content.slice(0, 4000) : content;
  const userSample = lastUserContent?.trim() ? lastUserContent.slice(0, 4000) : undefined;

  const matched: Array<{ text: string; type: FollowUpType }> = [];
  const seenTexts = new Set<string>();

  const addUnique = (item: { text: string; type: FollowUpType }) => {
    if (!seenTexts.has(item.text) && matched.length < 5) {
      seenTexts.add(item.text);
      matched.push(item);
    }
  };

  const ranked = TOPIC_MATCHERS.map((entry, index) => {
    const assistantHits = countDistinctMatches(sample, entry.matcher);
    const userHits = userSample ? countDistinctMatches(userSample, entry.matcher) : 0;
    return { ...entry, index, assistantHits, userHits };
  })
    .filter((entry) => {
      if (entry.assistantHits === 0 && entry.userHits === 0) return false;
      if (!userSample) return true;
      return (
        entry.userHits > 0 || entry.assistantHits >= ASSISTANT_HITS_REQUIRED_WITHOUT_USER_SUPPORT
      );
    })
    .map((entry) => ({
      ...entry,
      score: entry.userHits * USER_HIT_WEIGHT + entry.assistantHits * ASSISTANT_HIT_WEIGHT,
    }));

  if (userSample) {
    ranked.sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score));
  }

  for (const { followUps } of ranked) {
    for (const fu of followUps) {
      addUnique(fu);
      if (matched.length >= 5) break;
    }
    if (matched.length >= 5) break;
  }

  if (/```[\s\S]{10,}```/.test(sample)) {
    addUnique({ text: 'Run this code', type: 'apply' });
  }

  if (
    /\b(according to|studies show|research indicates|data suggests|as of \d{4})\b/i.test(sample)
  ) {
    addUnique({ text: 'Search the web to verify', type: 'discover' });
  }

  if (messageCount >= 10) {
    addUnique({ text: 'Summarize this conversation', type: 'apply' });
  }

  if (matched.length < 2) {
    const contentIsLong = content.length > 500;
    const genericPool = contentIsLong
      ? GENERIC_FOLLOW_UPS.filter((_, i) => i < 3)
      : GENERIC_FOLLOW_UPS.filter((_, i) => i >= 1 && i <= 4);

    for (const g of genericPool) {
      addUnique(g);
      if (matched.length >= 3) break;
    }
  }

  const selected = matched.slice(0, 3);

  return selected.map((item, i) => ({
    id: `followup-${i}`,
    text: item.text,
    type: item.type,
  }));
}

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
  className,
}: FollowUpSuggestionsProps) {
  const followUps = useMemo(
    () => deriveFollowUps(lastAssistantContent, messageCount, lastUserContent),
    [lastAssistantContent, messageCount, lastUserContent],
  );
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
            'text-xs text-muted-foreground',
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
