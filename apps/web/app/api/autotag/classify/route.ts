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
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

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
  const convRows = await db.query<{ id: string }>(
    `select id
     from web_conversations
     where id = $1 and user_id = $2 and deleted_at is null`,
    [conversationId, userId],
  );
  if (convRows.length === 0) {
    throw createError.notFound('Conversation not found');
  }

  // Get first 5 messages for classification
  let msgRows: { content: string }[];
  try {
    msgRows = await db.query<{ content: string }>(
      `select content
       from web_messages
       where conversation_id = $1
       order by created_at asc
       limit 5`,
      [conversationId],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to fetch messages for classification');
    throw createError.internal('Failed to classify conversation');
  }

  // Combine all message content for classification
  const combinedText = msgRows.map((m) => m.content).join('\n');
  const tag = classifyText(combinedText);

  // Upsert the tag (insert or update if already exists)
  try {
    await db.execute(
      `insert into conversation_tags (conversation_id, user_id, tag, confidence, classified_at)
       values ($1, $2, $3, $4, $5)
       on conflict (conversation_id, user_id) do update
         set tag = excluded.tag,
             confidence = excluded.confidence,
             classified_at = excluded.classified_at`,
      [conversationId, userId, tag, 1.0, new Date().toISOString()],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to store conversation tag');
    throw createError.internal('Failed to store tag');
  }

  return NextResponse.json({ tag });
}

export const POST = withErrorHandler(handleClassify);
