import {
  parseChatGPTExport,
  parseClaudeExport,
  parseGeminiExport,
  parsePlainText,
  detectSourceFromFilename,
} from '../src/features/memory/services/memoryImport';

const MAX_FACTS = 500;
const MAX_FACT_CHARS = 2000;

function repeat(n: number, fn: (i: number) => unknown): unknown[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe('parseChatGPTExport', () => {
  it('extracts facts from memory array field', () => {
    const json = JSON.stringify([{ memory: ['I prefer TypeScript', 'I use Neovim'] }]);
    const result = parseChatGPTExport(json);
    expect(result.source).toBe('chatgpt');
    expect(result.facts.length).toBe(2);
    expect(result.facts[0]?.fact).toBe('I prefer TypeScript');
    expect(result.facts[1]?.fact).toBe('I use Neovim');
  });

  it('extracts facts from memory object field', () => {
    const json = JSON.stringify([{ memory: { k1: 'I prefer dark mode', k2: 'I work remotely' } }]);
    const result = parseChatGPTExport(json);
    expect(result.facts.length).toBe(2);
    expect(result.facts.every((f) => f.source === 'chatgpt')).toBe(true);
  });

  it('caps extracted facts at MAX_FACTS (500)', () => {
    const memoryItems = repeat(501, (i) => `This is preference fact number ${i}`);
    const json = JSON.stringify([{ memory: memoryItems }]);
    const result = parseChatGPTExport(json);
    expect(result.facts.length).toBe(MAX_FACTS);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('truncates long facts at MAX_FACT_CHARS and appends ellipsis', () => {
    const longFact = 'A'.repeat(MAX_FACT_CHARS + 100);
    const json = JSON.stringify([{ memory: [longFact] }]);
    const result = parseChatGPTExport(json);
    expect(result.facts.length).toBe(1);
    const fact = result.facts[0]!.fact;
    expect(fact.endsWith('…')).toBe(true);
    expect(fact.length).toBeLessThanOrEqual(MAX_FACT_CHARS + 1);
  });

  it('returns empty ImportResult for malformed JSON, never throws', () => {
    expect(() => {
      const result = parseChatGPTExport('not valid json {{{');
      expect(result.facts).toEqual([]);
      expect(result.skipped).toBe(0);
      expect(result.source).toBe('chatgpt');
    }).not.toThrow();
  });

  it('returns empty ImportResult for empty JSON array', () => {
    const result = parseChatGPTExport('[]');
    expect(result.facts).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('skips memory entries with fewer than 3 non-whitespace chars', () => {
    const json = JSON.stringify([{ memory: ['ok', 'x', 'This is a real fact'] }]);
    const result = parseChatGPTExport(json);
    expect(result.facts.some((f) => f.fact === 'ok')).toBe(false);
    expect(result.facts.some((f) => f.fact === 'x')).toBe(false);
    expect(result.facts.some((f) => f.fact === 'This is a real fact')).toBe(true);
  });
});

describe('parseClaudeExport', () => {
  it('extracts system_prompt as a fact', () => {
    const json = JSON.stringify({
      conversations: [{ system_prompt: 'Always respond in bullet points.' }],
    });
    const result = parseClaudeExport(json);
    expect(result.source).toBe('claude');
    expect(result.facts.length).toBe(1);
    expect(result.facts[0]?.fact).toBe('Always respond in bullet points.');
  });

  it('extracts starred messages as facts', () => {
    const json = JSON.stringify({
      conversations: [
        {
          chat_messages: [
            { role: 'user', content: 'I prefer concise answers.', starred: true },
            { role: 'assistant', content: 'Noted.', starred: false },
            { role: 'user', content: 'Never use markdown tables.', starred: true },
          ],
        },
      ],
    });
    const result = parseClaudeExport(json);
    expect(result.facts.length).toBe(2);
    expect(result.facts[0]?.fact).toBe('I prefer concise answers.');
    expect(result.facts[1]?.fact).toBe('Never use markdown tables.');
  });

  it('does not extract non-starred messages', () => {
    const json = JSON.stringify({
      conversations: [
        {
          chat_messages: [
            { role: 'user', content: 'Unstarred, should be ignored.', starred: false },
          ],
        },
      ],
    });
    const result = parseClaudeExport(json);
    expect(result.facts.length).toBe(0);
  });

  it('caps facts at MAX_FACTS (500)', () => {
    const convs = repeat(501, (i) => ({
      system_prompt: `System instruction number ${i}, this is a valid long fact.`,
    }));
    const json = JSON.stringify({ conversations: convs });
    const result = parseClaudeExport(json);
    expect(result.facts.length).toBe(MAX_FACTS);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('returns empty ImportResult for malformed JSON, never throws', () => {
    expect(() => {
      const result = parseClaudeExport('{incomplete json');
      expect(result.facts).toEqual([]);
      expect(result.source).toBe('claude');
    }).not.toThrow();
  });

  it('truncates long system_prompt and appends ellipsis', () => {
    const json = JSON.stringify({
      conversations: [{ system_prompt: 'B'.repeat(MAX_FACT_CHARS + 200) }],
    });
    const result = parseClaudeExport(json);
    expect(result.facts[0]?.fact.endsWith('…')).toBe(true);
    expect(result.facts[0]!.fact.length).toBeLessThanOrEqual(MAX_FACT_CHARS + 1);
  });
});

describe('parseGeminiExport', () => {
  it('extracts user messages that match preference patterns', () => {
    const json = JSON.stringify({
      conversations: [
        {
          messages: [
            { author: 'user', content: 'I prefer short replies, please.' },
            { author: 'model', content: 'Understood.' },
            { author: 'user', content: 'My workflow uses vim and tmux.' },
          ],
        },
      ],
    });
    const result = parseGeminiExport(json);
    expect(result.source).toBe('gemini');
    expect(result.facts.length).toBe(2);
  });

  it('extracts user messages using "text" field when "content" is absent', () => {
    const json = JSON.stringify({
      conversations: [
        {
          messages: [{ author: 'user', text: 'I always use TypeScript for new projects.' }],
        },
      ],
    });
    const result = parseGeminiExport(json);
    expect(result.facts.length).toBe(1);
  });

  it('skips messages that do not match any preference pattern', () => {
    const json = JSON.stringify({
      conversations: [
        {
          messages: [
            { author: 'user', content: 'What is the capital of France?' },
            { author: 'user', content: 'Translate hello to Spanish.' },
          ],
        },
      ],
    });
    const result = parseGeminiExport(json);
    expect(result.facts.length).toBe(0);
  });

  it('accepts author "0" as a user turn (Takeout legacy format)', () => {
    const json = JSON.stringify({
      conversations: [
        {
          messages: [{ author: '0', content: 'I prefer Python over JavaScript.' }],
        },
      ],
    });
    const result = parseGeminiExport(json);
    expect(result.facts.length).toBe(1);
  });

  it('caps facts at MAX_FACTS', () => {
    const messages = repeat(501, () => ({
      author: 'user',
      content: 'I prefer concise answers in all my conversations.',
    }));
    const json = JSON.stringify({ conversations: [{ messages }] });
    const result = parseGeminiExport(json);
    expect(result.facts.length).toBe(MAX_FACTS);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('returns empty ImportResult for malformed JSON, never throws', () => {
    expect(() => {
      const result = parseGeminiExport('[[invalid json');
      expect(result.facts).toEqual([]);
      expect(result.source).toBe('gemini');
    }).not.toThrow();
  });
});

describe('parsePlainText', () => {
  it('extracts blank-line-separated paragraphs as facts', () => {
    const text = 'I prefer TypeScript over JavaScript.\n\nI work in the morning.';
    const result = parsePlainText(text);
    expect(result.source).toBe('text');
    expect(result.facts.length).toBe(2);
    expect(result.facts[0]?.fact).toBe('I prefer TypeScript over JavaScript.');
    expect(result.facts[1]?.fact).toBe('I work in the morning.');
  });

  it('skips lines shorter than 10 characters', () => {
    const text = 'ok\n\nThis is a long-enough fact to be included.';
    const result = parsePlainText(text);
    expect(result.facts.some((f) => f.fact === 'ok')).toBe(false);
    expect(result.facts.length).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('caps facts at MAX_FACTS (500)', () => {
    const paragraphs = repeat(501, (i) => `This is preference fact number ${i}`).join('\n\n');
    const result = parsePlainText(paragraphs as string);
    expect(result.facts.length).toBe(MAX_FACTS);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('truncates long lines and appends ellipsis', () => {
    const longLine = 'C'.repeat(MAX_FACT_CHARS + 50);
    const result = parsePlainText(longLine);
    expect(result.facts[0]?.fact.endsWith('…')).toBe(true);
    expect(result.facts[0]!.fact.length).toBeLessThanOrEqual(MAX_FACT_CHARS + 1);
  });

  it('handles empty string gracefully', () => {
    const result = parsePlainText('');
    expect(result.facts).toEqual([]);
    expect(result.skipped).toBe(0);
  });
});

describe('detectSourceFromFilename', () => {
  it('detects chatgpt from "chatgpt_export.json"', () => {
    expect(detectSourceFromFilename('chatgpt_export.json')).toBe('chatgpt');
  });

  it('detects chatgpt from exact "conversations.json" (canonical ChatGPT export name)', () => {
    expect(detectSourceFromFilename('conversations.json')).toBe('chatgpt');
  });

  it('detects claude from "claude_conversations.json"', () => {
    expect(detectSourceFromFilename('claude_conversations.json')).toBe('claude');
  });

  it('detects gemini from "gemini_takeout.json"', () => {
    expect(detectSourceFromFilename('gemini_takeout.json')).toBe('gemini');
  });

  it('detects gemini from filenames containing "bard"', () => {
    expect(detectSourceFromFilename('bard_history.json')).toBe('gemini');
  });

  it('falls back to "text" for unknown filenames', () => {
    expect(detectSourceFromFilename('my_notes.txt')).toBe('text');
    expect(detectSourceFromFilename('random_file.json')).toBe('text');
  });

  it('is case-insensitive (uppercase CHATGPT)', () => {
    expect(detectSourceFromFilename('CHATGPT_EXPORT.JSON')).toBe('chatgpt');
  });
});
