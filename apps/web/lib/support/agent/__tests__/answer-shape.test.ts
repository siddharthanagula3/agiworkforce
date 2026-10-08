import { describe, expect, it } from 'vitest';
import { getSupportCorpus } from '../corpus';
import { MAX_ANSWER_CHARS, MAX_ANSWER_WORDS, parseModelAnswer } from '../answer/schema';
import { SUPPORT_SYSTEM_PROMPT, SUPPORT_SYSTEM_PROMPT_V2 } from '../prompt/system-prompt';

function modelOutput(answer: string): string {
  return JSON.stringify({
    answer,
    citedChunkIds: ['doc#0'],
    abstain: false,
    abstainReason: '',
    proposedActionId: null,
  });
}

describe('model answer shape limits', () => {
  it('asks the model for the same word limit the code is sized from', () => {
    for (const prompt of [SUPPORT_SYSTEM_PROMPT, SUPPORT_SYSTEM_PROMPT_V2]) {
      expect(prompt).toContain(`at most ${String(MAX_ANSWER_WORDS)} words`);
    }
  });

  it('leaves room for a full-length answer written in the vocabulary of the help articles', () => {
    const corpus = getSupportCorpus();
    expect(corpus.available).toBe(true);
    if (!corpus.available) return;

    let words = 0;
    let characters = 0;
    for (const chunk of corpus.chunks) {
      words += chunk.text.split(/\s+/).filter(Boolean).length;
      characters += chunk.text.length;
    }
    const charactersPerWord = characters / words;

    expect(MAX_ANSWER_CHARS).toBeGreaterThan(MAX_ANSWER_WORDS * charactersPerWord * 1.2);
    expect(MAX_ANSWER_CHARS).toBeLessThan(MAX_ANSWER_WORDS * charactersPerWord * 1.6);
  });

  it('accepts an answer at the character limit and rejects one over it', () => {
    expect(parseModelAnswer(modelOutput('a'.repeat(MAX_ANSWER_CHARS)))).not.toBeNull();
    expect(parseModelAnswer(modelOutput('a'.repeat(MAX_ANSWER_CHARS + 1)))).toBeNull();
  });

  it.each(['```', '~~~'])('rejects an answer containing a %s code fence', (fence) => {
    expect(parseModelAnswer(modelOutput(`Run this:\n${fence}\nagi login\n${fence}`))).toBeNull();
    expect(parseModelAnswer(modelOutput('Run `agi login` in a terminal.'))).not.toBeNull();
  });
});
