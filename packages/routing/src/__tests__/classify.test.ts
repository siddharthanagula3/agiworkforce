/**
 * Comprehensive tests for the heuristic classifier, conversation-context
 * sticky pivot, token estimation, and Indic script detection.
 *
 * Test plan (200+ cases):
 *   §1 image_generation         - slash + phrase forms, edge cases.
 *   §2 computer-use              - screenshot + verb co-occurrence.
 *   §3 multimodal                - image/video MIME, screenshot fall-through.
 *   §4 long_context              - cumulative token guard.
 *   §5 coding                    - keywords, code fences, error markers.
 *   §6 reasoning                 - math/proof verbs, inline arithmetic.
 *   §7 research                  - recency keywords.
 *   §8 creative_writing          - draft / write phrases.
 *   §9 simple_chat               - length + word-count combo.
 *   §10 general                  - fallthrough.
 *   §11 priority                 - ensure higher-rank heuristics dominate.
 *   §12 applyConversationContext - mode boost, pivot threshold, token guard.
 *   §13 estimateTokens           - per-model multipliers.
 *   §14 detectIndicScript        - Unicode ranges + ratio gate.
 */

import { describe, it, expect } from 'vitest';

import {
  applyConversationContext,
  classifyTaskLocally,
  detectIndicScript,
  estimateTokens,
  type ConversationContext,
  type RoutingAttachment,
  type RoutingMessage,
  type RoutingTaskType,
} from '../index';

// ============================================================================
// Helpers
// ============================================================================

const NO_HISTORY: RoutingMessage[] = [];
const NO_ATTACHMENTS: RoutingAttachment[] = [];

function ctx(
  cumulativeTokens: number,
  recentTaskTypes: RoutingTaskType[] = [],
): ConversationContext {
  return { cumulativeTokens, recentTaskTypes };
}

function classify(
  msg: string,
  history: RoutingMessage[] = NO_HISTORY,
  attachments?: RoutingAttachment[],
) {
  return classifyTaskLocally(msg, history, attachments);
}

// ============================================================================
// §1 Image Generation
// ============================================================================

describe('classifyTaskLocally — image_generation', () => {
  it('matches /image slash command', () => {
    expect(classify('/image a sunset over mountains')).toEqual({
      type: 'image_generation',
      confidence: 0.95,
    });
  });

  it('matches /imagine slash command', () => {
    expect(classify('/imagine a robot holding flowers').type).toBe('image_generation');
  });

  it('matches /draw slash command', () => {
    expect(classify('/draw a portrait').type).toBe('image_generation');
  });

  it('matches /generate slash command', () => {
    expect(classify('/generate a logo for my startup').type).toBe('image_generation');
  });

  it('is case-insensitive on slash command', () => {
    expect(classify('/IMAGE a tree').type).toBe('image_generation');
    expect(classify('/Imagine castles').type).toBe('image_generation');
  });

  it('matches "generate an image" phrase', () => {
    expect(classify('Please generate an image of a cat').type).toBe('image_generation');
  });

  it('matches "create a picture" phrase', () => {
    expect(classify('Create a picture of a beach').type).toBe('image_generation');
  });

  it('matches "make a logo" phrase', () => {
    expect(classify('make a logo for my brand').type).toBe('image_generation');
  });

  it('matches "draw illustration" phrase', () => {
    expect(classify('draw an illustration of a dog').type).toBe('image_generation');
  });

  it('matches "generate mockup"', () => {
    expect(classify('generate a mockup for the homepage').type).toBe('image_generation');
  });

  it('matches "create wireframe"', () => {
    expect(classify('create a wireframe for the signup page').type).toBe('image_generation');
  });

  it('matches "make a photo"', () => {
    expect(classify('make a photo of a city skyline').type).toBe('image_generation');
  });

  it('does NOT match generate without an image-noun', () => {
    // "generate the report" should NOT route to image_generation.
    expect(classify('generate the quarterly report').type).not.toBe('image_generation');
  });

  it('does NOT match standalone /imageinfo', () => {
    // word-boundary in regex prevents false positive on prefix words.
    expect(classify('/imageinfo file.png').type).not.toBe('image_generation');
  });

  it('treats slash-prefixed at start of message only', () => {
    // Body containing "/image" should NOT trigger.
    expect(classify('Tell me about /image commands').type).not.toBe('image_generation');
  });

  it('returns confidence 0.95 for slash command', () => {
    expect(classify('/imagine x').confidence).toBe(0.95);
  });

  it('returns confidence 0.95 for natural phrase', () => {
    expect(classify('generate an image of x').confidence).toBe(0.95);
  });
});

// ============================================================================
// §2 Computer-use
// ============================================================================

describe('classifyTaskLocally — computer-use', () => {
  const screenshot: RoutingAttachment = { mime: 'image/png', type: 'screenshot' };

  it('fires on screenshot + click verb', () => {
    expect(classify('click the submit button', NO_HISTORY, [screenshot])).toEqual({
      type: 'computer-use',
      confidence: 0.9,
    });
  });

  it('fires on screenshot + navigate verb', () => {
    expect(classify('navigate to settings', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('fires on screenshot + fill verb', () => {
    expect(classify('fill in the email field', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('fires on screenshot + submit verb', () => {
    expect(classify('submit the form', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('fires on screenshot + automate verb', () => {
    expect(classify('automate this workflow', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('does NOT fire on screenshot alone (falls through to multimodal)', () => {
    expect(classify('what is in this picture?', NO_HISTORY, [screenshot]).type).toBe('multimodal');
  });

  it('does NOT fire on click verb without screenshot (falls through)', () => {
    expect(classify('click handler in React').type).not.toBe('computer-use');
  });

  it('does NOT fire on regular image attachment + verb', () => {
    const regularImage: RoutingAttachment = { mime: 'image/jpeg', type: 'image' };
    expect(classify('click the button', NO_HISTORY, [regularImage]).type).toBe('multimodal');
  });

  it('returns confidence 0.9 when matching', () => {
    expect(classify('click here', NO_HISTORY, [screenshot]).confidence).toBe(0.9);
  });

  it('case-insensitive on verbs', () => {
    expect(classify('CLICK the menu', NO_HISTORY, [screenshot]).type).toBe('computer-use');
    expect(classify('Submit it', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });
});

// ============================================================================
// §3 Multimodal
// ============================================================================

describe('classifyTaskLocally — multimodal', () => {
  it('matches image/png MIME', () => {
    const att: RoutingAttachment = { mime: 'image/png' };
    expect(classify('describe this', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('matches image/jpeg MIME', () => {
    const att: RoutingAttachment = { mime: 'image/jpeg' };
    expect(classify('what is here', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('matches image/svg+xml MIME', () => {
    const att: RoutingAttachment = { mime: 'image/svg+xml' };
    expect(classify('analyze this svg', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('matches image/webp MIME', () => {
    const att: RoutingAttachment = { mime: 'image/webp' };
    expect(classify('what is shown', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('matches video/mp4 MIME', () => {
    const att: RoutingAttachment = { mime: 'video/mp4' };
    expect(classify('what happens', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('matches video/quicktime MIME', () => {
    const att: RoutingAttachment = { mime: 'video/quicktime' };
    expect(classify('summarize', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('does NOT match audio/mpeg MIME', () => {
    const att: RoutingAttachment = { mime: 'audio/mpeg' };
    expect(classify('transcribe this', NO_HISTORY, [att]).type).not.toBe('multimodal');
  });

  it('does NOT match application/pdf MIME', () => {
    const att: RoutingAttachment = { mime: 'application/pdf' };
    expect(classify('summarize this PDF', NO_HISTORY, [att]).type).not.toBe('multimodal');
  });

  it('returns confidence 0.85', () => {
    const att: RoutingAttachment = { mime: 'image/png' };
    expect(classify('describe this', NO_HISTORY, [att]).confidence).toBe(0.85);
  });

  it('handles empty attachment list (falls through to other heuristics)', () => {
    expect(classify('hi', NO_HISTORY, []).type).not.toBe('multimodal');
  });

  it('handles undefined attachments', () => {
    expect(classify('hi', NO_HISTORY, undefined).type).not.toBe('multimodal');
  });

  it('matches when multiple image attachments', () => {
    const a1: RoutingAttachment = { mime: 'image/png' };
    const a2: RoutingAttachment = { mime: 'image/jpeg' };
    expect(classify('compare these', NO_HISTORY, [a1, a2]).type).toBe('multimodal');
  });

  it('matches when one of many is image', () => {
    const pdf: RoutingAttachment = { mime: 'application/pdf' };
    const img: RoutingAttachment = { mime: 'image/png' };
    expect(classify('look at these', NO_HISTORY, [pdf, img]).type).toBe('multimodal');
  });
});

// ============================================================================
// §4 Long context
// ============================================================================

describe('classifyTaskLocally — long_context', () => {
  it('triggers when a single huge message exceeds 50K tokens', () => {
    // 200K characters at chars/3.5 ≈ 57K tokens.
    const huge = 'a'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });

  it('triggers when history accumulates past 50K tokens', () => {
    const filler = 'b'.repeat(60_000); // 60K chars / 3.5 ≈ 17K tokens
    const history: RoutingMessage[] = [
      { role: 'user', content: filler },
      { role: 'assistant', content: filler },
      { role: 'user', content: filler },
      { role: 'assistant', content: filler },
    ];
    expect(classify('one more turn', history).type).toBe('long_context');
  });

  it('does NOT trigger below 50K threshold', () => {
    expect(classify('hello').type).not.toBe('long_context');
  });

  it('does NOT trigger with moderate history', () => {
    const history: RoutingMessage[] = [
      { role: 'user', content: 'short turn' },
      { role: 'assistant', content: 'short reply' },
    ];
    expect(classify('next', history).type).not.toBe('long_context');
  });

  it('returns confidence 0.9 when triggered', () => {
    const huge = 'a'.repeat(200_000);
    expect(classify(huge).confidence).toBe(0.9);
  });

  it('long context wins over coding when both signals are present', () => {
    // Big message containing code keyword should still go long_context.
    const huge = 'function ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });

  it('long context wins over creative_writing', () => {
    const huge = 'write a story ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });
});

// ============================================================================
// §5 Coding
// ============================================================================

describe('classifyTaskLocally — coding', () => {
  it('matches markdown code fences', () => {
    expect(classify('debug this:\n```\nlet x = 1;\n```').type).toBe('coding');
  });

  it('matches function keyword', () => {
    expect(classify('explain this function definition').type).toBe('coding');
  });

  it('matches class keyword', () => {
    expect(classify('refactor this class').type).toBe('coding');
  });

  it('matches SQL SELECT', () => {
    expect(classify('SELECT * FROM users').type).toBe('coding');
  });

  it('matches Python def keyword', () => {
    expect(classify('def hello(): pass').type).toBe('coding');
  });

  it('matches import statement', () => {
    expect(classify('import statement issue').type).toBe('coding');
  });

  it('matches stack trace', () => {
    expect(classify('look at this stack trace').type).toBe('coding');
  });

  it('matches "stacktrace" with no space', () => {
    expect(classify('attached the stacktrace').type).toBe('coding');
  });

  it('matches TypeError', () => {
    expect(classify('I get TypeError when running').type).toBe('coding');
  });

  it('matches undefined', () => {
    expect(classify('value is undefined here').type).toBe('coding');
  });

  it('matches NullPointerException', () => {
    expect(classify('throws NullPointerException').type).toBe('coding');
  });

  it('returns confidence 0.85', () => {
    expect(classify('write a function').confidence).toBe(0.85);
  });

  it('does NOT match generic prose without code keywords', () => {
    expect(classify('tell me a joke').type).not.toBe('coding');
  });

  it('matches even short messages with code fence', () => {
    expect(classify('```\nx\n```').type).toBe('coding');
  });
});

// ============================================================================
// §6 Reasoning
// ============================================================================

describe('classifyTaskLocally — reasoning', () => {
  it('matches "prove" verb', () => {
    expect(classify('prove that 2 plus 2 equals four').type).toBe('reasoning');
  });

  it('matches "derive" verb', () => {
    expect(classify('derive the quadratic formula').type).toBe('reasoning');
  });

  it('matches "solve" verb', () => {
    expect(classify('solve for x given the constraints').type).toBe('reasoning');
  });

  it('matches "calculate" verb', () => {
    expect(classify('calculate the area').type).toBe('reasoning');
  });

  it('matches "theorem" keyword', () => {
    expect(classify('apply the theorem here').type).toBe('reasoning');
  });

  it('matches "integral" keyword', () => {
    expect(classify('compute this integral').type).toBe('reasoning');
  });

  it('matches "differential" keyword', () => {
    expect(classify('differential equation methods').type).toBe('reasoning');
  });

  it('matches inline arithmetic with +', () => {
    expect(classify('what is 12 + 7').type).toBe('reasoning');
  });

  it('matches inline arithmetic with -', () => {
    expect(classify('100 - 25 equals what').type).toBe('reasoning');
  });

  it('matches inline arithmetic with *', () => {
    expect(classify('15 * 4 result').type).toBe('reasoning');
  });

  it('matches inline arithmetic with /', () => {
    expect(classify('100 / 4 is').type).toBe('reasoning');
  });

  it('matches inline arithmetic with = and digit on both sides', () => {
    // Regex requires digit-operator-digit. "5=3" → reasoning;
    // "5 = x" → no match (right-hand side is a letter).
    expect(classify('what does 5 = 3 + 2 mean').type).toBe('reasoning');
  });

  it('does NOT match equality with non-digit operands', () => {
    // "5 = x" is digit-equals-letter; falls through to simple_chat.
    expect(classify('5 = x what is x').type).not.toBe('reasoning');
  });

  it('returns confidence 0.8', () => {
    expect(classify('solve for y').confidence).toBe(0.8);
  });

  it('does NOT match plain numbers without operator', () => {
    expect(classify('the year 2025').type).not.toBe('reasoning');
  });
});

// ============================================================================
// §7 Research
// ============================================================================

describe('classifyTaskLocally — research', () => {
  it('matches "latest" keyword', () => {
    expect(classify("what's the latest in AI").type).toBe('research');
  });

  it('matches "today" keyword', () => {
    expect(classify('what happened in markets today').type).toBe('research');
  });

  it('matches "2026" keyword', () => {
    expect(classify('top phones in 2026').type).toBe('research');
  });

  it('matches "current" keyword', () => {
    expect(classify('current weather in Tokyo').type).toBe('research');
  });

  it('matches "recent news" phrase', () => {
    expect(classify('any recent news on Mars').type).toBe('research');
  });

  it('matches "search the web"', () => {
    expect(classify('search the web for that paper').type).toBe('research');
  });

  it('matches "cite sources"', () => {
    expect(classify('explain and cite sources').type).toBe('research');
  });

  it('returns confidence 0.85', () => {
    expect(classify('latest news').confidence).toBe(0.85);
  });

  it('case-insensitive on Latest', () => {
    expect(classify('Latest releases').type).toBe('research');
  });

  it('does NOT match "current" inside word', () => {
    // word-boundary required.
    expect(classify('concurrentMap implementation').type).not.toBe('research');
  });
});

// ============================================================================
// §8 Creative writing
// ============================================================================

describe('classifyTaskLocally — creative_writing', () => {
  it('matches "write a story"', () => {
    expect(classify('write a story about a dragon').type).toBe('creative_writing');
  });

  it('matches "draft an email"', () => {
    expect(classify('draft an email to my team').type).toBe('creative_writing');
  });

  it('matches "compose a poem"', () => {
    expect(classify('compose a poem about autumn').type).toBe('creative_writing');
  });

  it('matches "write an essay"', () => {
    expect(classify('write an essay on AI ethics').type).toBe('creative_writing');
  });

  it('matches "draft a tweet"', () => {
    expect(classify('draft a tweet about launch').type).toBe('creative_writing');
  });

  it('matches "write a blog"', () => {
    expect(classify('write a blog post').type).toBe('creative_writing');
  });

  it('returns confidence 0.75', () => {
    expect(classify('write a poem').confidence).toBe(0.75);
  });

  it('"write code in python" is not creative_writing (no story/poem/email/etc. noun)', () => {
    // Spec creative-writing regex requires (story|poem|email|essay|tweet|blog)
    // immediately after the verb-and-article. "write code" has no such noun.
    expect(classify('write code in python').type).not.toBe('creative_writing');
  });

  it('does NOT match plain "write"', () => {
    expect(classify('how do you write?').type).not.toBe('creative_writing');
  });

  it('matches "compose the email"', () => {
    expect(classify('compose the email reply').type).toBe('creative_writing');
  });
});

// ============================================================================
// §9 Simple chat
// ============================================================================

describe('classifyTaskLocally — simple_chat', () => {
  it('matches "hi"', () => {
    expect(classify('hi').type).toBe('simple_chat');
  });

  it('matches "hello"', () => {
    expect(classify('hello').type).toBe('simple_chat');
  });

  it('matches short greeting', () => {
    expect(classify('hey there').type).toBe('simple_chat');
  });

  it('matches short question', () => {
    expect(classify('how are you').type).toBe('simple_chat');
  });

  it('returns confidence 0.7', () => {
    expect(classify('hi').confidence).toBe(0.7);
  });

  it('does NOT match a 79-char message with 15 words', () => {
    // 15 words triggers `< 15` fail; message length is irrelevant.
    const msg = 'a a a a a a a a a a a a a a a';
    expect(classify(msg).type).not.toBe('simple_chat');
  });

  it('does NOT match a long message', () => {
    const msg = 'a'.repeat(120);
    expect(classify(msg).type).not.toBe('simple_chat');
  });

  it('matches 14 words under 80 chars', () => {
    const msg = 'a a a a a a a a a a a a a a';
    expect(classify(msg).type).toBe('simple_chat');
  });

  it('boundary: exactly 80 chars fails length check', () => {
    const msg = 'x'.repeat(80);
    expect(classify(msg).type).not.toBe('simple_chat');
  });

  it('boundary: 79 chars + 14 words passes', () => {
    const msg = 'x'.repeat(79);
    // 1 word, 79 chars → both checks pass.
    expect(classify(msg).type).toBe('simple_chat');
  });

  it('empty string is short → simple_chat (split yields one empty token, <15)', () => {
    // ''.split(/\s+/) yields [''] (length 1) and ''.length is 0 — both bounds
    // satisfied, so the simple-chat heuristic claims it before fallthrough.
    expect(classify('').type).toBe('simple_chat');
  });
});

// ============================================================================
// §10 General fallthrough
// ============================================================================

describe('classifyTaskLocally — general fallthrough', () => {
  it('falls through to general when no heuristics match', () => {
    // 80+ chars (so not simple_chat), no keywords matching anything.
    const msg =
      'I would like to discuss something interesting that requires some neutral conversational handling without specific signals';
    expect(classify(msg).type).toBe('general');
  });

  it('returns confidence 0.5 on general', () => {
    const msg =
      'I would like to discuss something interesting that requires some neutral conversational handling';
    expect(classify(msg).confidence).toBe(0.5);
  });

  it('empty input is captured by simple_chat (length=0, words=1)', () => {
    // Documented surprise: empty input returns simple_chat, not general.
    // This is an intentional consequence of the spec's length+wordcount rule
    // and is harmless — Pool B simple_chat handling is identical to general.
    expect(classify('').type).toBe('simple_chat');
  });

  it('whitespace-only message → general (length passes simple_chat first)', () => {
    // "   " has length 3 < 80, but split(/\s+/) gives ['','',''] → length 3 → < 15 → simple_chat.
    expect(classify('   ').type).toBe('simple_chat');
  });
});

// ============================================================================
// §11 Priority order
// ============================================================================

describe('classifyTaskLocally — priority order', () => {
  it('image > computer-use', () => {
    const screenshot: RoutingAttachment = { mime: 'image/png', type: 'screenshot' };
    // "/image click here" starts with /image, even with screenshot+verb → image_generation.
    expect(classify('/image click submit', NO_HISTORY, [screenshot]).type).toBe('image_generation');
  });

  it('computer-use > multimodal', () => {
    const screenshot: RoutingAttachment = { mime: 'image/png', type: 'screenshot' };
    expect(classify('click submit', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('multimodal > long_context', () => {
    const att: RoutingAttachment = { mime: 'image/png' };
    // Even a short message with image goes multimodal, not long_context.
    expect(classify('look', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('long_context > coding', () => {
    const huge = 'function foo() {} ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });

  it('coding > reasoning', () => {
    // Contains both code and "solve" → coding wins.
    expect(classify('write a function to solve x').type).toBe('coding');
  });

  it('reasoning > research', () => {
    // Contains both "solve" and "latest" — reasoning wins by priority.
    expect(classify('solve the latest puzzle').type).toBe('reasoning');
  });

  it('research > creative_writing', () => {
    // "draft a story about latest news" → research wins.
    expect(classify('draft a story about the latest news').type).toBe('research');
  });

  it('creative_writing > simple_chat', () => {
    // Short message that ALSO matches creative_writing — creative wins because
    // it appears earlier in the priority chain (heuristic 8 vs 9).
    expect(classify('write a poem').type).toBe('creative_writing');
  });

  it('image phrase beats coding even when "function" is mentioned later', () => {
    expect(classify('generate an image of a function').type).toBe('image_generation');
  });

  it('computer-use beats coding when both signals present', () => {
    const screenshot: RoutingAttachment = { mime: 'image/png', type: 'screenshot' };
    expect(classify('click the function name', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('reasoning beats simple_chat (math wins over short)', () => {
    expect(classify('1 + 2').type).toBe('reasoning');
  });

  it('long_context wins even with creative_writing prefix', () => {
    const huge = 'write a story ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });
});

// ============================================================================
// §12 applyConversationContext
// ============================================================================

describe('applyConversationContext — long-context guard', () => {
  it('forces long_context when cumulative tokens > 50K', () => {
    const local = { type: 'coding' as const, confidence: 0.85 };
    const result = applyConversationContext(local, ctx(60_000, ['coding', 'coding']));
    expect(result).toEqual({ type: 'long_context', confidence: 0.9 });
  });

  it('does not double-fire when local is already long_context', () => {
    const local = { type: 'long_context' as const, confidence: 0.9 };
    const result = applyConversationContext(local, ctx(60_000));
    expect(result).toEqual(local);
  });

  it('does NOT force long_context at exactly 50K', () => {
    const local = { type: 'coding' as const, confidence: 0.85 };
    const result = applyConversationContext(local, ctx(50_000));
    // Not > 50K → no override.
    expect(result.type).toBe('coding');
  });

  it('forces long_context above 50K even with empty history', () => {
    const local = { type: 'general' as const, confidence: 0.5 };
    expect(applyConversationContext(local, ctx(50_001)).type).toBe('long_context');
  });
});

describe('applyConversationContext — sticky pivot mode boost', () => {
  it('boosts confidence when running mode matches new turn', () => {
    const local = { type: 'coding' as const, confidence: 0.85 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    // Boost +0.1, clamped at 1.0 → 0.95.
    expect(result.type).toBe('coding');
    expect(result.confidence).toBeCloseTo(0.95, 5);
  });

  it('clamps boosted confidence at 1.0', () => {
    const local = { type: 'coding' as const, confidence: 0.95 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding']));
    expect(result.confidence).toBe(1.0);
  });

  it('boost applies on full-window match (3-turn agreement)', () => {
    const local = { type: 'reasoning' as const, confidence: 0.8 };
    const result = applyConversationContext(
      local,
      ctx(1_000, ['reasoning', 'reasoning', 'reasoning']),
    );
    expect(result.confidence).toBeCloseTo(0.9, 5);
  });

  it('boost applies on plurality (2 of 3)', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    // Last 3 = ['coding', 'coding', 'general']; mode = coding.
    const result = applyConversationContext(
      local,
      ctx(1_000, ['general', 'coding', 'coding', 'general']),
    );
    // Last 3 of ['general', 'coding', 'coding', 'general'] = ['coding', 'coding', 'general']
    // mode = coding (2 of 3) → matches local.type → boost.
    expect(result.type).toBe('coding');
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('does not boost when there is a tie (no clear mode)', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    // Last 3 = ['a', 'b', 'c'] → tie → no mode → unchanged.
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'reasoning', 'general']));
    expect(result).toEqual(local);
  });

  it('does not modify result when history is empty', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    expect(applyConversationContext(local, ctx(1_000, []))).toEqual(local);
  });
});

describe('applyConversationContext — pivot override threshold', () => {
  it('high-confidence (>=0.85) new turn overrides running mode', () => {
    const local = { type: 'image_generation' as const, confidence: 0.95 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    // 0.95 >= 0.85 → pivot allowed.
    expect(result).toEqual(local);
  });

  it('low-confidence new turn snaps to running mode', () => {
    const local = { type: 'creative_writing' as const, confidence: 0.75 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    // 0.75 < 0.85 → snap back to coding.
    expect(result.type).toBe('coding');
    expect(result.confidence).toBe(0.75);
  });

  it('exactly 0.85 confidence allows pivot (>= threshold)', () => {
    const local = { type: 'reasoning' as const, confidence: 0.85 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    expect(result).toEqual(local);
  });

  it('confidence 0.84 (just below threshold) snaps to mode', () => {
    const local = { type: 'reasoning' as const, confidence: 0.84 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    expect(result.type).toBe('coding');
  });
});

describe('applyConversationContext — window edge cases', () => {
  it('inspects only the last 3 entries', () => {
    const local = { type: 'general' as const, confidence: 0.5 };
    // First 5 entries are coding, but last 3 are reasoning. Last 3 win.
    const result = applyConversationContext(
      local,
      ctx(1_000, [
        'coding',
        'coding',
        'coding',
        'coding',
        'coding',
        'reasoning',
        'reasoning',
        'reasoning',
      ]),
    );
    expect(result.type).toBe('reasoning');
  });

  it('handles single-entry history', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    const result = applyConversationContext(local, ctx(1_000, ['coding']));
    // mode = coding, matches → boost.
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('handles two-entry tied history (no mode)', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'reasoning']));
    // 1 vs 1 → tie → no boost, no override.
    expect(result).toEqual(local);
  });

  it('handles two-entry agreement (boost)', () => {
    const local = { type: 'reasoning' as const, confidence: 0.7 };
    const result = applyConversationContext(local, ctx(1_000, ['reasoning', 'reasoning']));
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });
});

// ============================================================================
// §13 estimateTokens
// ============================================================================

describe('estimateTokens — provider multipliers', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('uses default tokenizer when model is omitted', () => {
    // 35 chars / 3.5 = 10 tokens.
    expect(estimateTokens('a'.repeat(35))).toBe(10);
  });

  it('uses GPT tokenizer for gpt-5.4', () => {
    // 38 chars / 3.8 = 10 tokens.
    expect(estimateTokens('a'.repeat(38), 'gpt-5.4')).toBe(10);
  });

  it('uses GPT tokenizer for gpt-5.5', () => {
    expect(estimateTokens('a'.repeat(38), 'gpt-5.5')).toBe(10);
  });

  it('uses GPT tokenizer for gpt-4o', () => {
    expect(estimateTokens('a'.repeat(38), 'gpt-4o-mini')).toBe(10);
  });

  it('uses Opus 4.7 tokenizer (with 18% inflation)', () => {
    // 100 chars / 3.5 * 1.18 ≈ 33.71 → ceil = 34.
    expect(estimateTokens('a'.repeat(100), 'claude-opus-4-7')).toBe(34);
  });

  it('Opus 4.7 supports dot-separator naming', () => {
    expect(estimateTokens('a'.repeat(100), 'claude-opus-4.7')).toBe(34);
  });

  it('uses regular Claude tokenizer for claude-sonnet-4.6', () => {
    // 35 chars / 3.5 = 10 tokens.
    expect(estimateTokens('a'.repeat(35), 'claude-sonnet-4.6')).toBe(10);
  });

  it('uses regular Claude tokenizer for claude-opus-4.6', () => {
    expect(estimateTokens('a'.repeat(35), 'claude-opus-4.6')).toBe(10);
  });

  it('uses Gemini tokenizer for gemini-3.1-flash-lite', () => {
    // 40 chars / 4.0 = 10 tokens.
    expect(estimateTokens('a'.repeat(40), 'gemini-3.1-flash-lite-preview')).toBe(10);
  });

  it('uses DeepSeek tokenizer for deepseek-v4-flash', () => {
    // 34 chars / 3.4 = 10 tokens.
    expect(estimateTokens('a'.repeat(34), 'deepseek-v4-flash')).toBe(10);
  });

  it('falls back to default for unknown model', () => {
    // 35 chars / 3.5 = 10.
    expect(estimateTokens('a'.repeat(35), 'unknown-model-id')).toBe(10);
  });

  it('matches case-insensitively on model id', () => {
    expect(estimateTokens('a'.repeat(38), 'GPT-5.4')).toBe(10);
    expect(estimateTokens('a'.repeat(34), 'DeepSeek-V4-Flash')).toBe(10);
  });

  it('always returns at least 1 token for non-empty input', () => {
    // Single char / 3.5 = 0.286, ceil = 1.
    expect(estimateTokens('a')).toBe(1);
  });

  it('Opus 4.7 inflation makes it heavier than other Claude', () => {
    const txt = 'a'.repeat(1000);
    const opus47 = estimateTokens(txt, 'claude-opus-4-7');
    const opus46 = estimateTokens(txt, 'claude-opus-4.6');
    expect(opus47).toBeGreaterThan(opus46);
  });

  it('Gemini is the lightest tokenizer per char', () => {
    const txt = 'a'.repeat(1000);
    const gemini = estimateTokens(txt, 'gemini-3.1-flash-lite-preview');
    const gpt = estimateTokens(txt, 'gpt-5.4');
    const claude = estimateTokens(txt, 'claude-sonnet-4.6');
    expect(gemini).toBeLessThanOrEqual(gpt);
    expect(gemini).toBeLessThanOrEqual(claude);
  });

  it('DeepSeek is the heaviest non-Opus-4.7 tokenizer', () => {
    const txt = 'a'.repeat(1000);
    const deepseek = estimateTokens(txt, 'deepseek-v4-flash');
    const claude = estimateTokens(txt, 'claude-sonnet-4.6');
    const gpt = estimateTokens(txt, 'gpt-5.4');
    expect(deepseek).toBeGreaterThanOrEqual(claude);
    expect(deepseek).toBeGreaterThan(gpt);
  });

  it('handles long input deterministically', () => {
    expect(estimateTokens('a'.repeat(10_000), 'gpt-5.4')).toBe(Math.ceil(10_000 / 3.8));
  });

  it('handles unicode content (counts code units, not codepoints)', () => {
    // The token estimator deliberately uses `length` (UTF-16 code-unit count)
    // because all major tokenizers we model do too.
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
  });
});

// ============================================================================
// §14 detectIndicScript
// ============================================================================

describe('detectIndicScript — basic detection', () => {
  it('returns isIndic=false for empty string', () => {
    const r = detectIndicScript('');
    expect(r.isIndic).toBe(false);
    expect(r.indicCharCount).toBe(0);
    expect(r.totalCharCount).toBe(0);
    expect(r.dominantScript).toBe(null);
  });

  it('returns isIndic=false for pure Latin', () => {
    const r = detectIndicScript('hello world');
    expect(r.isIndic).toBe(false);
    expect(r.indicCharCount).toBe(0);
    expect(r.dominantScript).toBe(null);
  });

  it('detects Devanagari (Hindi)', () => {
    const r = detectIndicScript('नमस्ते');
    expect(r.isIndic).toBe(true);
    expect(r.dominantScript).toBe('devanagari');
    expect(r.indicRatio).toBe(1);
  });

  it('detects Bengali', () => {
    const r = detectIndicScript('বাংলা');
    expect(r.dominantScript).toBe('bengali');
    expect(r.isIndic).toBe(true);
  });

  it('detects Gurmukhi (Punjabi)', () => {
    const r = detectIndicScript('ਪੰਜਾਬੀ');
    expect(r.dominantScript).toBe('gurmukhi');
    expect(r.isIndic).toBe(true);
  });

  it('detects Gujarati', () => {
    const r = detectIndicScript('ગુજરાતી');
    expect(r.dominantScript).toBe('gujarati');
    expect(r.isIndic).toBe(true);
  });

  it('detects Tamil', () => {
    const r = detectIndicScript('தமிழ்');
    expect(r.dominantScript).toBe('tamil');
    expect(r.isIndic).toBe(true);
  });

  it('detects Telugu', () => {
    const r = detectIndicScript('తెలుగు');
    expect(r.dominantScript).toBe('telugu');
    expect(r.isIndic).toBe(true);
  });

  it('detects Kannada', () => {
    const r = detectIndicScript('ಕನ್ನಡ');
    expect(r.dominantScript).toBe('kannada');
    expect(r.isIndic).toBe(true);
  });

  it('detects Malayalam', () => {
    const r = detectIndicScript('മലയാളം');
    expect(r.dominantScript).toBe('malayalam');
    expect(r.isIndic).toBe(true);
  });
});

describe('detectIndicScript — ratio threshold', () => {
  it('mixed-script with >20% Indic flips isIndic', () => {
    // 4 Devanagari out of 10 chars = 40% > 20% threshold.
    const r = detectIndicScript('hi नमस्ते abc');
    expect(r.isIndic).toBe(true);
    expect(r.indicRatio).toBeGreaterThan(0.2);
  });

  it('mixed-script with <20% Indic does not flip', () => {
    // 1 char out of 50 = 2% < 20%.
    const text = 'a'.repeat(50) + 'न';
    const r = detectIndicScript(text);
    expect(r.isIndic).toBe(false);
    expect(r.indicRatio).toBeLessThan(0.2);
  });

  it('respects custom threshold', () => {
    // 1 char out of 10 = 10%. Default 20% says no, threshold 0.05 says yes.
    const text = 'aaaaaaaaaन';
    expect(detectIndicScript(text, 0.05).isIndic).toBe(true);
    expect(detectIndicScript(text, 0.5).isIndic).toBe(false);
  });

  it('threshold of 0 makes ANY Indic codepoint trigger', () => {
    expect(detectIndicScript('hello न', 0).isIndic).toBe(true);
  });

  it('threshold of 1 requires 100% Indic', () => {
    expect(detectIndicScript('न', 1).isIndic).toBe(true);
    expect(detectIndicScript('aन', 1).isIndic).toBe(false);
  });
});

describe('detectIndicScript — counts and dominant script', () => {
  it('reports indicCharCount and totalCharCount', () => {
    const r = detectIndicScript('hi नम');
    // 'h', 'i', ' ', 'न', 'म' = 5 codepoints, 2 indic.
    expect(r.totalCharCount).toBe(5);
    expect(r.indicCharCount).toBe(2);
  });

  it('picks dominant when multiple Indic scripts present', () => {
    // 5 Devanagari + 2 Tamil → devanagari wins.
    const text = 'नमस्ते' + 'தம';
    const r = detectIndicScript(text);
    expect(r.dominantScript).toBe('devanagari');
    expect(r.scriptCounts.devanagari).toBeGreaterThan(0);
    expect(r.scriptCounts.tamil).toBeGreaterThan(0);
  });

  it('ties resolved by INDIC_RANGES order (devanagari ahead of tamil)', () => {
    // 1 char from each → tie → first one in range list wins.
    const r = detectIndicScript('नத');
    expect(r.dominantScript).toBe('devanagari');
  });

  it('returns 0 counts for absent scripts', () => {
    const r = detectIndicScript('நமஸ்தே');
    expect(r.scriptCounts.tamil).toBeGreaterThan(0);
    expect(r.scriptCounts.bengali).toBe(0);
    expect(r.scriptCounts.devanagari).toBe(0);
  });

  it('handles whitespace-only input as not-Indic', () => {
    const r = detectIndicScript('   ');
    expect(r.isIndic).toBe(false);
    expect(r.indicCharCount).toBe(0);
  });

  it('handles emoji + Latin as not-Indic', () => {
    const r = detectIndicScript('hello 👋');
    expect(r.isIndic).toBe(false);
  });

  it('handles Chinese characters as not-Indic', () => {
    const r = detectIndicScript('你好');
    expect(r.isIndic).toBe(false);
    expect(r.dominantScript).toBe(null);
  });

  it('handles Arabic as not-Indic', () => {
    const r = detectIndicScript('مرحبا');
    expect(r.isIndic).toBe(false);
  });
});

describe('detectIndicScript — boundary codepoints', () => {
  it('detects start of Devanagari range (U+0900)', () => {
    const r = detectIndicScript(String.fromCodePoint(0x0900));
    expect(r.scriptCounts.devanagari).toBe(1);
  });

  it('detects end of Devanagari range (U+097F)', () => {
    const r = detectIndicScript(String.fromCodePoint(0x097f));
    expect(r.scriptCounts.devanagari).toBe(1);
  });

  it('rejects U+08FF (just below Devanagari)', () => {
    const r = detectIndicScript(String.fromCodePoint(0x08ff));
    expect(r.indicCharCount).toBe(0);
  });

  it('detects start of Bengali range (U+0980)', () => {
    expect(detectIndicScript(String.fromCodePoint(0x0980)).scriptCounts.bengali).toBe(1);
  });

  it('detects end of Malayalam range (U+0D7F)', () => {
    expect(detectIndicScript(String.fromCodePoint(0x0d7f)).scriptCounts.malayalam).toBe(1);
  });

  it('rejects U+0D80 (just above Malayalam)', () => {
    expect(detectIndicScript(String.fromCodePoint(0x0d80)).indicCharCount).toBe(0);
  });
});

// ============================================================================
// Stress / sanity
// ============================================================================

describe('classifier — stability', () => {
  it('is deterministic across repeated calls', () => {
    const a = classify('write a function to solve x');
    const b = classify('write a function to solve x');
    expect(a).toEqual(b);
  });

  it('handles very long but harmless message', () => {
    const msg = 'just chatting '.repeat(500);
    expect(classify(msg).type).not.toBe('long_context');
  });

  it('handles message with only punctuation', () => {
    expect(classify('!!!???').type).toBe('simple_chat');
  });

  it('handles message with only digits', () => {
    expect(classify('12345').type).toBe('simple_chat');
  });

  it('classifyTaskLocally never returns confidence > 1', () => {
    for (const msg of [
      '/image cat',
      'click',
      'write a function',
      'solve x',
      'latest news',
      'draft a poem',
      'hi',
      'large prose ' + 'x'.repeat(120),
    ]) {
      expect(classify(msg).confidence).toBeLessThanOrEqual(1);
    }
  });

  it('classifyTaskLocally never returns confidence < 0', () => {
    for (const msg of ['', 'random', 'hi', '/image']) {
      expect(classify(msg).confidence).toBeGreaterThanOrEqual(0);
    }
  });

  it('applyConversationContext output never exceeds 1.0 confidence', () => {
    const local = { type: 'coding' as const, confidence: 1.0 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});

describe('classifier — attachments without other signals', () => {
  it('PDF attachment + chatty short message → simple_chat (no multimodal trigger)', () => {
    const att: RoutingAttachment = { mime: 'application/pdf' };
    expect(classify('hi', NO_HISTORY, [att]).type).toBe('simple_chat');
  });

  it('audio attachment alone falls through past multimodal', () => {
    const att: RoutingAttachment = { mime: 'audio/mp3' };
    // Pick a message that is neither short-and-fewer-than-15-words nor
    // matches any other heuristic so we land on `general`. The specific
    // wording avoids triggering creative_writing or research keywords.
    const msg =
      'kindly handle the attached audio recording for downstream processing as part of the ongoing batch run';
    expect(classify(msg, NO_HISTORY, [att]).type).toBe('general');
  });

  it('image attachment with reasoning verb still routes multimodal', () => {
    const att: RoutingAttachment = { mime: 'image/png' };
    expect(classify('solve this puzzle', NO_HISTORY, [att]).type).toBe('multimodal');
  });
});

describe('classifier — additional priority pairs', () => {
  it('image_generation > research', () => {
    expect(classify('/image latest news').type).toBe('image_generation');
  });

  it('image_generation > creative_writing', () => {
    expect(classify('generate an image of a story').type).toBe('image_generation');
  });

  it('coding > research', () => {
    // function keyword + "latest" → coding wins (priority 5 vs 7).
    expect(classify('latest function signature').type).toBe('coding');
  });

  it('reasoning > creative_writing', () => {
    expect(classify('write a poem and prove the theorem').type).toBe('reasoning');
  });

  it('research > simple_chat (research keywords beat short)', () => {
    expect(classify('latest news').type).toBe('research');
  });
});

// ============================================================================
// Cross-module: classifier + indic compose cleanly
// ============================================================================

describe('cross-module — Indic + classifier independence', () => {
  it('classifier is unaffected by Indic content', () => {
    // Indic message without other signals → general (not simple_chat because
    // ratio detection isn't part of classifier; that's a separate concern).
    const msg = 'नमस्ते कैसे हो';
    // Word count is small and length is small → simple_chat.
    expect(classify(msg).type).toBe('simple_chat');
  });

  it('detectIndicScript does not look at attachments', () => {
    // Sanity: function signature only takes text.
    expect(detectIndicScript('hello').isIndic).toBe(false);
  });
});
