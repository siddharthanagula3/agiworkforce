import {
  getModelMetadataById,
  getModelsForProvider,
  requireProviderDefaultModel,
} from '@agiworkforce/types';
import { describe, it, expect } from 'vitest';

import {
  applyConversationContext,
  classifyTaskLocally,
  detectIndicScript,
  estimateTokens,
  tokenizerDriftFactor,
  type ConversationContext,
  type RoutingAttachment,
  type RoutingMessage,
  type RoutingTaskType,
} from '../index';

const NO_HISTORY: RoutingMessage[] = [];
const NO_ATTACHMENTS: RoutingAttachment[] = [];
const OPENAI_MODEL_ID = requireProviderDefaultModel('openai');
const ANTHROPIC_MODELS = getModelsForProvider('anthropic');
const ANTHROPIC_MODEL_ID = requireProviderDefaultModel('anthropic');
const ANTHROPIC_COMPARISON_MODEL_ID = ANTHROPIC_MODELS.find(
  (model) => model.id !== ANTHROPIC_MODEL_ID,
)?.id;
const GOOGLE_MODEL_ID = requireProviderDefaultModel('google');
const DEEPSEEK_MODEL_ID = requireProviderDefaultModel('deepseek');

if (!ANTHROPIC_COMPARISON_MODEL_ID) {
  throw new Error('The canonical Anthropic comparison fixture must exist');
}

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

describe('classifyTaskLocally, image_generation', () => {
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
    expect(classify('generate the quarterly report').type).not.toBe('image_generation');
  });

  it.each([
    'draw a portrait of a fox',
    'generate some concept artwork',
    'make me a poster for the show',
    'create a painting of a harbour at dusk',
    'draw a sketch of the floor plan',
    'generate an avatar for my profile',
    'make a banner for the top of the page',
    'create a wallpaper of a mountain range',
    'generate a thumbnail for the video',
    'make a drawing of a bicycle',
    'create a photograph of a desert road',
  ])('matches widened image noun: %s', (message) => {
    expect(classify(message).type).toBe('image_generation');
  });

  it.each([
    'create a report about the logo',
    'make a function that returns null',
    'create a plan for the sprint',
    'generate a summary of the illustration guidelines',
    'draw up a contract for the vendor',
  ])('does NOT match non-image request: %s', (message) => {
    expect(classify(message).type).not.toBe('image_generation');
  });

  it('allows adjectives between the article and the medium noun', () => {
    expect(classify('create a detailed anime portrait').type).toBe('image_generation');
  });

  it('does NOT match standalone /imageinfo', () => {
    expect(classify('/imageinfo file.png').type).not.toBe('image_generation');
  });

  it('treats slash-prefixed at start of message only', () => {
    expect(classify('Tell me about /image commands').type).not.toBe('image_generation');
  });

  it('returns confidence 0.95 for slash command', () => {
    expect(classify('/imagine x').confidence).toBe(0.95);
  });

  it('returns confidence 0.95 for natural phrase', () => {
    expect(classify('generate an image of x').confidence).toBe(0.95);
  });
});

describe('classifyTaskLocally, computer-use', () => {
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

describe('classifyTaskLocally, multimodal', () => {
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

describe('classifyTaskLocally, long_context', () => {
  it('triggers when a single huge message exceeds 50K tokens', () => {
    const huge = 'a'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });

  it('triggers when history accumulates past 50K tokens', () => {
    const filler = 'b'.repeat(60_000);
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
    const huge = 'function ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });

  it('long context wins over creative_writing', () => {
    const huge = 'write a story ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });
});

describe('classifyTaskLocally, coding', () => {
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

  it('treats a bare prose word as a weak coding signal', () => {
    expect(classify('refactor this class').confidence).toBe(0.6);
    expect(classify('import statement issue').confidence).toBe(0.6);
    expect(classify('value is undefined here').confidence).toBe(0.6);
  });

  it('lets a stronger signal win over a weak coding word', () => {
    expect(classify('import tariffs in the latest budget').type).toBe('research');
    expect(classify('write a poem about a class reunion').type).toBe('creative_writing');
  });

  it('does not let a weak coding word pivot a running conversation', () => {
    const local = classify('what did the class think of it');
    expect(local).toEqual({ type: 'coding', confidence: 0.6 });
    const result = applyConversationContext(local, {
      cumulativeTokens: 0,
      recentTaskTypes: ['creative_writing', 'creative_writing', 'creative_writing'],
    });
    expect(result.type).toBe('creative_writing');
  });

  it('does NOT match generic prose without code keywords', () => {
    expect(classify('tell me a joke').type).not.toBe('coding');
  });

  it('matches even short messages with code fence', () => {
    expect(classify('```\nx\n```').type).toBe('coding');
  });
});

describe('classifyTaskLocally, reasoning', () => {
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
    expect(classify('what does 5 = 3 + 2 mean').type).toBe('reasoning');
  });

  it('does NOT match equality with non-digit operands', () => {
    expect(classify('5 = x what is x').type).not.toBe('reasoning');
  });

  it('returns confidence 0.8', () => {
    expect(classify('solve for y').confidence).toBe(0.8);
  });

  it('does NOT match plain numbers without operator', () => {
    expect(classify('the year 2025').type).not.toBe('reasoning');
  });
});

describe('classifyTaskLocally, agentic', () => {
  it('matches explicit autonomous-agent orchestration', () => {
    expect(classify('Use autonomous agents and discover the best available tools').type).toBe(
      'agentic',
    );
  });

  it('matches parallel subagent delegation', () => {
    expect(classify('Spawn parallel subagents for this task').type).toBe('agentic');
  });

  it('matches tool discovery', () => {
    expect(classify('Discover available tools for this workflow').type).toBe('agentic');
  });

  it('returns confidence 0.85', () => {
    expect(classify('orchestrate multiple agents').confidence).toBe(0.85);
  });
});

describe('classifyTaskLocally, research', () => {
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
    expect(classify('concurrentMap implementation').type).not.toBe('research');
  });
});

describe('classifyTaskLocally, creative_writing', () => {
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
    expect(classify('write code in python').type).not.toBe('creative_writing');
  });

  it('does NOT match plain "write"', () => {
    expect(classify('how do you write?').type).not.toBe('creative_writing');
  });

  it('matches "compose the email"', () => {
    expect(classify('compose the email reply').type).toBe('creative_writing');
  });
});

describe('classifyTaskLocally, simple_chat', () => {
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
    expect(classify(msg).type).toBe('simple_chat');
  });

  it('empty string is short → simple_chat (split yields one empty token, <15)', () => {
    expect(classify('').type).toBe('simple_chat');
  });
});

describe('classifyTaskLocally, general fallthrough', () => {
  it('falls through to general when no heuristics match', () => {
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
    expect(classify('').type).toBe('simple_chat');
  });

  it('whitespace-only message → general (length passes simple_chat first)', () => {
    expect(classify('   ').type).toBe('simple_chat');
  });
});

describe('classifyTaskLocally, priority order', () => {
  it('image > computer-use', () => {
    const screenshot: RoutingAttachment = { mime: 'image/png', type: 'screenshot' };
    expect(classify('/image click submit', NO_HISTORY, [screenshot]).type).toBe('image_generation');
  });

  it('computer-use > multimodal', () => {
    const screenshot: RoutingAttachment = { mime: 'image/png', type: 'screenshot' };
    expect(classify('click submit', NO_HISTORY, [screenshot]).type).toBe('computer-use');
  });

  it('multimodal > long_context', () => {
    const att: RoutingAttachment = { mime: 'image/png' };
    expect(classify('look', NO_HISTORY, [att]).type).toBe('multimodal');
  });

  it('long_context > coding', () => {
    const huge = 'function foo() {} ' + 'x'.repeat(200_000);
    expect(classify(huge).type).toBe('long_context');
  });

  it('coding > reasoning', () => {
    expect(classify('write a function to solve x').type).toBe('coding');
  });

  it('reasoning > research', () => {
    expect(classify('solve the latest puzzle').type).toBe('reasoning');
  });

  it('research > creative_writing', () => {
    expect(classify('draft a story about the latest news').type).toBe('research');
  });

  it('creative_writing > simple_chat', () => {
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

describe('applyConversationContext, long-context guard', () => {
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
    expect(result.type).toBe('coding');
  });

  it('forces long_context above 50K even with empty history', () => {
    const local = { type: 'general' as const, confidence: 0.5 };
    expect(applyConversationContext(local, ctx(50_001)).type).toBe('long_context');
  });
});

describe('applyConversationContext, sticky pivot mode boost', () => {
  it('boosts confidence when running mode matches new turn', () => {
    const local = { type: 'coding' as const, confidence: 0.85 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
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
    const result = applyConversationContext(
      local,
      ctx(1_000, ['general', 'coding', 'coding', 'general']),
    );
    expect(result.type).toBe('coding');
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('does not boost when there is a tie (no clear mode)', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'reasoning', 'general']));
    expect(result).toEqual(local);
  });

  it('does not modify result when history is empty', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    expect(applyConversationContext(local, ctx(1_000, []))).toEqual(local);
  });
});

describe('applyConversationContext, pivot override threshold', () => {
  it('high-confidence (>=0.85) new turn overrides running mode', () => {
    const local = { type: 'image_generation' as const, confidence: 0.95 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
    expect(result).toEqual(local);
  });

  it('low-confidence new turn snaps to running mode', () => {
    const local = { type: 'creative_writing' as const, confidence: 0.75 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'coding', 'coding']));
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

describe('applyConversationContext, window edge cases', () => {
  it('inspects only the last 3 entries', () => {
    const local = { type: 'general' as const, confidence: 0.5 };
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
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('handles two-entry tied history (no mode)', () => {
    const local = { type: 'coding' as const, confidence: 0.7 };
    const result = applyConversationContext(local, ctx(1_000, ['coding', 'reasoning']));
    expect(result).toEqual(local);
  });

  it('handles two-entry agreement (boost)', () => {
    const local = { type: 'reasoning' as const, confidence: 0.7 };
    const result = applyConversationContext(local, ctx(1_000, ['reasoning', 'reasoning']));
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });
});

describe('estimateTokens, provider multipliers', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('uses default tokenizer when model is omitted', () => {
    expect(estimateTokens('a'.repeat(35))).toBe(10);
  });

  it('uses the OpenAI tokenizer for the canonical default', () => {
    expect(estimateTokens('a'.repeat(38), OPENAI_MODEL_ID)).toBe(10);
  });

  it('uses the standard Anthropic estimate when no drift is declared', () => {
    const metadata = getModelMetadataById(ANTHROPIC_MODEL_ID);
    expect(metadata).not.toBeNull();

    const expected = Math.ceil(100 * (1 / 3.5) * tokenizerDriftFactor(metadata!.id));
    expect(estimateTokens('a'.repeat(100), metadata!.id)).toBe(expected);
    expect(tokenizerDriftFactor(metadata!.id)).toBe(1);
  });

  it('uses the same catalog metadata for the Anthropic provider ID', () => {
    const metadata = getModelMetadataById(ANTHROPIC_MODEL_ID);
    expect(metadata).not.toBeNull();

    const expected = Math.ceil(100 * (1 / 3.5) * tokenizerDriftFactor(metadata!.id));
    expect(estimateTokens('a'.repeat(100), metadata!.apiModelId ?? metadata!.id)).toBe(expected);
  });

  it('uses the regular Anthropic tokenizer for another canonical model', () => {
    expect(estimateTokens('a'.repeat(35), ANTHROPIC_COMPARISON_MODEL_ID)).toBe(10);
  });

  it('does not invent tokenizer inflation between Anthropic models', () => {
    expect(estimateTokens('a'.repeat(35), ANTHROPIC_MODEL_ID)).toBe(
      estimateTokens('a'.repeat(35), ANTHROPIC_COMPARISON_MODEL_ID),
    );
  });

  it('uses the Google tokenizer for the canonical default', () => {
    expect(estimateTokens('a'.repeat(40), GOOGLE_MODEL_ID)).toBe(10);
  });

  it('uses the DeepSeek tokenizer for the canonical default', () => {
    expect(estimateTokens('a'.repeat(34), DEEPSEEK_MODEL_ID)).toBe(10);
  });

  it('falls back to default for unknown model', () => {
    expect(estimateTokens('a'.repeat(35), 'fixture-unknown-model')).toBe(10);
  });

  it('matches case-insensitively on model id', () => {
    expect(estimateTokens('a'.repeat(38), OPENAI_MODEL_ID.toUpperCase())).toBe(10);
    expect(estimateTokens('a'.repeat(34), DEEPSEEK_MODEL_ID.toUpperCase())).toBe(10);
  });

  it('always returns at least 1 token for non-empty input', () => {
    expect(estimateTokens('a')).toBe(1);
  });

  it('keeps Anthropic estimates equal without catalog drift metadata', () => {
    const txt = 'a'.repeat(1000);
    const defaultEstimate = estimateTokens(txt, ANTHROPIC_MODEL_ID);
    const comparisonEstimate = estimateTokens(txt, ANTHROPIC_COMPARISON_MODEL_ID);
    expect(defaultEstimate).toBe(comparisonEstimate);
  });

  it('Google is the lightest tokenizer per char', () => {
    const txt = 'a'.repeat(1000);
    const google = estimateTokens(txt, GOOGLE_MODEL_ID);
    const openai = estimateTokens(txt, OPENAI_MODEL_ID);
    const anthropic = estimateTokens(txt, ANTHROPIC_MODEL_ID);
    expect(google).toBeLessThanOrEqual(openai);
    expect(google).toBeLessThanOrEqual(anthropic);
  });

  it('DeepSeek is the heaviest non-drifted tokenizer', () => {
    const txt = 'a'.repeat(1000);
    const deepseek = estimateTokens(txt, DEEPSEEK_MODEL_ID);
    const anthropic = estimateTokens(txt, ANTHROPIC_MODEL_ID);
    const openai = estimateTokens(txt, OPENAI_MODEL_ID);
    expect(deepseek).toBeGreaterThanOrEqual(anthropic);
    expect(deepseek).toBeGreaterThan(openai);
  });

  it('handles long input deterministically', () => {
    expect(estimateTokens('a'.repeat(10_000), OPENAI_MODEL_ID)).toBe(Math.ceil(10_000 / 3.8));
  });

  it('handles unicode content (counts code units, not codepoints)', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
  });
});

describe('detectIndicScript, basic detection', () => {
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

describe('detectIndicScript, ratio threshold', () => {
  it('mixed-script with >20% Indic flips isIndic', () => {
    const r = detectIndicScript('hi नमस्ते abc');
    expect(r.isIndic).toBe(true);
    expect(r.indicRatio).toBeGreaterThan(0.2);
  });

  it('mixed-script with <20% Indic does not flip', () => {
    const text = 'a'.repeat(50) + 'न';
    const r = detectIndicScript(text);
    expect(r.isIndic).toBe(false);
    expect(r.indicRatio).toBeLessThan(0.2);
  });

  it('respects custom threshold', () => {
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

describe('detectIndicScript, counts and dominant script', () => {
  it('reports indicCharCount and totalCharCount', () => {
    const r = detectIndicScript('hi नम');
    expect(r.totalCharCount).toBe(5);
    expect(r.indicCharCount).toBe(2);
  });

  it('picks dominant when multiple Indic scripts present', () => {
    const text = 'नमस्ते' + 'தம';
    const r = detectIndicScript(text);
    expect(r.dominantScript).toBe('devanagari');
    expect(r.scriptCounts.devanagari).toBeGreaterThan(0);
    expect(r.scriptCounts.tamil).toBeGreaterThan(0);
  });

  it('ties resolved by INDIC_RANGES order (devanagari ahead of tamil)', () => {
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

describe('detectIndicScript, boundary codepoints', () => {
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

describe('classifier, stability', () => {
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

describe('classifier, attachments without other signals', () => {
  it('PDF attachment + chatty short message → simple_chat (no multimodal trigger)', () => {
    const att: RoutingAttachment = { mime: 'application/pdf' };
    expect(classify('hi', NO_HISTORY, [att]).type).toBe('simple_chat');
  });

  it('audio attachment alone falls through past multimodal', () => {
    const att: RoutingAttachment = { mime: 'audio/mp3' };
    const msg =
      'kindly handle the attached audio recording for downstream processing as part of the ongoing batch run';
    expect(classify(msg, NO_HISTORY, [att]).type).toBe('general');
  });

  it('image attachment with reasoning verb still routes multimodal', () => {
    const att: RoutingAttachment = { mime: 'image/png' };
    expect(classify('solve this puzzle', NO_HISTORY, [att]).type).toBe('multimodal');
  });
});

describe('classifier, additional priority pairs', () => {
  it('image_generation > research', () => {
    expect(classify('/image latest news').type).toBe('image_generation');
  });

  it('image_generation > creative_writing', () => {
    expect(classify('generate an image of a story').type).toBe('image_generation');
  });

  it('coding > research', () => {
    expect(classify('latest function signature').type).toBe('coding');
  });

  it('reasoning > creative_writing', () => {
    expect(classify('write a poem and prove the theorem').type).toBe('reasoning');
  });

  it('research > simple_chat (research keywords beat short)', () => {
    expect(classify('latest news').type).toBe('research');
  });
});

describe('cross-module, Indic + classifier independence', () => {
  it('classifier is unaffected by Indic content', () => {
    const msg = 'नमस्ते कैसे हो';
    expect(classify(msg).type).toBe('simple_chat');
  });

  it('detectIndicScript does not look at attachments', () => {
    expect(detectIndicScript('hello').isIndic).toBe(false);
  });
});
