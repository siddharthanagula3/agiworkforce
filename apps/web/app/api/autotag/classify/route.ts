/**
 * Autotag Classify API
 *
 * POST /api/autotag/classify - Classify a conversation by its content
 *
 * Reads the first 5 messages from a conversation, runs a keyword-based
 * classifier, stores the result in conversation_tags, and returns the tag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

type ConversationTag =
  | 'coding'
  | 'research'
  | 'writing'
  | 'brainstorm'
  | 'analysis'
  | 'debug'
  | 'creative'
  | 'general';

// Keyword-based classifier (no LLM call - simple and fast)
const KEYWORD_RULES: { tag: ConversationTag; patterns: RegExp[] }[] = [
  {
    tag: 'debug',
    patterns: [
      /\bbug\b/i,
      /\berror\b/i,
      /\bfix\b/i,
      /\bdebug\b/i,
      /\bstack\s?trace\b/i,
      /\bcrash\b/i,
      /\bbroken\b/i,
      /\bnot\s+working\b/i,
      /\bfailing\b/i,
      /\bexception\b/i,
    ],
  },
  {
    tag: 'coding',
    patterns: [
      /```[\s\S]*?```/,
      /\bfunction\b/i,
      /\bclass\b/i,
      /\bimport\b/i,
      /\bconst\b/i,
      /\bpython\b/i,
      /\btypescript\b/i,
      /\bjavascript\b/i,
      /\breact\b/i,
      /\bapi\b/i,
      /\bcode\b/i,
      /\bprogram\b/i,
      /\bimplement\b/i,
      /\brefactor\b/i,
      /\balgorithm\b/i,
    ],
  },
  {
    tag: 'research',
    patterns: [
      /\bresearch\b/i,
      /\bstudy\b/i,
      /\bpaper\b/i,
      /\bjournal\b/i,
      /\bsource\b/i,
      /\bcitation\b/i,
      /\bfind\s+out\b/i,
      /\bcompare\b/i,
      /\bexplain\b/i,
      /\bwhat\s+is\b/i,
      /\bhow\s+does\b/i,
    ],
  },
  {
    tag: 'writing',
    patterns: [
      /\bwrite\b/i,
      /\bedit\b/i,
      /\bdraft\b/i,
      /\bessay\b/i,
      /\barticle\b/i,
      /\bblog\s+post\b/i,
      /\bcopy\b/i,
      /\bproofread\b/i,
      /\brewrite\b/i,
      /\bsummarize\b/i,
      /\btone\b/i,
    ],
  },
  {
    tag: 'brainstorm',
    patterns: [
      /\bbrainstorm\b/i,
      /\bideas?\b/i,
      /\bcreative\b/i,
      /\bwhat\s+if\b/i,
      /\bsuggest\b/i,
      /\bgenerate\b/i,
      /\bcome\s+up\s+with\b/i,
      /\blist\s+of\b/i,
      /\binnovate\b/i,
    ],
  },
  {
    tag: 'analysis',
    patterns: [
      /\banalyze\b/i,
      /\banalysis\b/i,
      /\bdata\b/i,
      /\bchart\b/i,
      /\bgraph\b/i,
      /\bmetric\b/i,
      /\bstatistic\b/i,
      /\btrend\b/i,
      /\binsight\b/i,
      /\breport\b/i,
      /\bspreadsheet\b/i,
    ],
  },
  {
    tag: 'creative',
    patterns: [
      /\bdesign\b/i,
      /\bart\b/i,
      /\bimage\b/i,
      /\billustrat/i,
      /\bstory\b/i,
      /\bpoem\b/i,
      /\bmusic\b/i,
      /\bcolor\b/i,
      /\bpalette\b/i,
      /\baesthetic\b/i,
      /\bvisual\b/i,
    ],
  },
];

function classifyText(text: string): ConversationTag {
  const scores: Record<ConversationTag, number> = {
    coding: 0,
    research: 0,
    writing: 0,
    brainstorm: 0,
    analysis: 0,
    debug: 0,
    creative: 0,
    general: 0,
  };

  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      const matches = text.match(new RegExp(pattern, 'gi'));
      if (matches) {
        scores[rule.tag] += matches.length;
      }
    }
  }

  // Find the tag with the highest score
  let bestTag: ConversationTag = 'general';
  let bestScore = 0;

  for (const [tag, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestTag = tag as ConversationTag;
    }
  }

  return bestTag;
}

async function handleClassify(request: NextRequest) {
  // AUDIT-008-006: Enforce CSRF protection for DB-writing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  let body: { conversationId?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const { conversationId } = body;
  if (!conversationId || typeof conversationId !== 'string') {
    throw createError.validation('conversationId is required');
  }

  // Verify conversation ownership
  const { data: conversation, error: convError } = await supabase
    .from('web_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (convError || !conversation) {
    throw createError.notFound('Conversation not found');
  }

  // Get first 5 messages for classification
  const { data: messages, error: msgError } = await supabase
    .from('web_messages')
    .select('content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(5);

  if (msgError) {
    logger.error({ error: msgError }, 'Failed to fetch messages for classification');
    throw createError.internal('Failed to classify conversation');
  }

  // Combine all message content for classification
  const combinedText = (messages ?? []).map((m) => m.content).join('\n');
  const tag = classifyText(combinedText);

  // Upsert the tag (insert or update if already exists)
  const { error: upsertError } = await supabase.from('conversation_tags').upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      tag,
      confidence: 1.0,
      classified_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id,user_id' },
  );

  if (upsertError) {
    logger.error({ error: upsertError }, 'Failed to store conversation tag');
    throw createError.internal('Failed to store tag');
  }

  return NextResponse.json({ tag });
}

export const POST = withErrorHandler(handleClassify);
