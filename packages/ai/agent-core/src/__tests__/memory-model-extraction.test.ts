import { describe, expect, it, vi } from 'vitest';
import {
  extractCandidateMemoryFacts,
  extractMemoryFactsWithModel,
  isMemoryExtractionWorthwhile,
  parseModelMemoryFacts,
  type MemoryFactExtractionRunner,
} from '../memory';

/**
 * The pattern extractor is the shipped behaviour and this suite treats it as
 * the floor: every failure mode of the model path has to land back on exactly
 * what the patterns produce, because losing a turn's facts is worse than
 * missing the ones the patterns never saw.
 */
const NO_TRIGGER_TURN = 'I just moved to Berlin last month and started at Acme as a data engineer.';

function runnerReturning(raw: string): MemoryFactExtractionRunner {
  return () => Promise.resolve(raw);
}

describe('isMemoryExtractionWorthwhile', () => {
  it('skips turns that cannot carry a durable fact, so they never cost a call', () => {
    expect(isMemoryExtractionWorthwhile('')).toBe(false);
    expect(isMemoryExtractionWorthwhile('ok')).toBe(false);
    expect(isMemoryExtractionWorthwhile('What is the capital of France?')).toBe(false);
    expect(isMemoryExtractionWorthwhile('Deploys run at nine every weekday.')).toBe(false);
  });

  it('accepts self-referential and explicit-recall turns', () => {
    expect(isMemoryExtractionWorthwhile(NO_TRIGGER_TURN)).toBe(true);
    expect(isMemoryExtractionWorthwhile('Remember the deploy window is Friday evening.')).toBe(
      true,
    );
  });
});

describe('parseModelMemoryFacts', () => {
  it('accepts a JSON array, with or without a code fence', () => {
    expect(parseModelMemoryFacts('["User lives in Berlin"]')).toEqual(['User lives in Berlin']);
    expect(parseModelMemoryFacts('```json\n["User lives in Berlin"]\n```')).toEqual([
      'User lives in Berlin',
    ]);
  });

  it('refuses anything that is not a list of facts', () => {
    expect(parseModelMemoryFacts('Sure! Here are the facts I found.')).toBeNull();
    expect(parseModelMemoryFacts('{"facts":["User lives in Berlin"]}')).toBeNull();
    expect(parseModelMemoryFacts('["User lives in Berlin"')).toBeNull();
    expect(parseModelMemoryFacts('')).toBeNull();
    expect(parseModelMemoryFacts(`["${'x'.repeat(9000)}"]`)).toBeNull();
  });

  it('drops unusable entries without refusing a well-shaped reply', () => {
    expect(
      parseModelMemoryFacts(
        JSON.stringify([42, null, 'x', 'y'.repeat(200), 'User lives in Berlin']),
      ),
    ).toEqual(['User lives in Berlin']);
  });

  it('flattens control characters and de-duplicates, since a row is rendered chrome', () => {
    expect(
      parseModelMemoryFacts(JSON.stringify(['User\nlives\tin Berlin', 'user lives in berlin'])),
    ).toEqual(['User lives in Berlin']);
  });

  it('honours the fact cap', () => {
    expect(parseModelMemoryFacts(JSON.stringify(['aa', 'bb', 'cc', 'dd']), 2)).toEqual([
      'aa',
      'bb',
    ]);
  });
});

describe('extractMemoryFactsWithModel', () => {
  it('keeps a fact stated with no trigger phrase', async () => {
    expect(extractCandidateMemoryFacts(NO_TRIGGER_TURN)).toEqual([]);

    const result = await extractMemoryFactsWithModel(NO_TRIGGER_TURN, {
      runner: runnerReturning('["User lives in Berlin", "User is a data engineer at Acme"]'),
    });

    expect(result.source).toBe('model');
    expect(result.facts).toEqual(['User lives in Berlin', 'User is a data engineer at Acme']);
  });

  it('never drops a fact the pattern extractor already found', async () => {
    const message = 'My name is Sid. I just moved to Berlin.';
    const result = await extractMemoryFactsWithModel(message, {
      runner: runnerReturning('["User lives in Berlin"]'),
    });

    expect(result.facts[0]).toBe("User's name is Sid");
    expect(result.facts).toContain('User lives in Berlin');
  });

  it('falls back to the pattern facts when the runner throws', async () => {
    const message = 'My name is Sid. I just moved to Berlin.';
    const onFallback = vi.fn();
    const result = await extractMemoryFactsWithModel(message, {
      runner: () => Promise.reject(new Error('provider 503')),
      onFallback,
    });

    expect(result).toEqual({
      facts: extractCandidateMemoryFacts(message),
      source: 'pattern',
      fallbackReason: 'runner_failed',
    });
    expect(onFallback).toHaveBeenCalledWith('runner_failed');
  });

  it('falls back on a runner that outlives the deadline and ignores the signal', async () => {
    const message = 'My name is Sid. I just moved to Berlin.';
    const result = await extractMemoryFactsWithModel(message, {
      timeoutMs: 5,
      runner: () => new Promise<string>(() => {}),
    });

    expect(result.source).toBe('pattern');
    expect(result.fallbackReason).toBe('timed_out');
    expect(result.facts).toEqual(extractCandidateMemoryFacts(message));
  });

  it('aborts the runner when the deadline passes', async () => {
    let aborted = false;
    await extractMemoryFactsWithModel(NO_TRIGGER_TURN, {
      timeoutMs: 5,
      runner: (_input, signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    });

    expect(aborted).toBe(true);
  });

  it('refuses malformed output and keeps the pattern facts', async () => {
    const message = 'My name is Sid. I just moved to Berlin.';
    const result = await extractMemoryFactsWithModel(message, {
      runner: runnerReturning('I could not find any facts, sorry!'),
    });

    expect(result).toEqual({
      facts: extractCandidateMemoryFacts(message),
      source: 'pattern',
      fallbackReason: 'malformed_output',
    });
  });

  it('does not call the model on a turn with nothing worth extracting', async () => {
    const runner = vi.fn(runnerReturning('["User lives in Berlin"]'));
    const result = await extractMemoryFactsWithModel('What is the capital of France?', { runner });

    expect(runner).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe('not_worthwhile');
    expect(result.facts).toEqual([]);
  });

  it('truncates the prompt so a pasted document is not re-sent in full', async () => {
    const seen: string[] = [];
    await extractMemoryFactsWithModel(`I work at Acme. ${'x'.repeat(20000)}`, {
      runner: (input) => {
        seen.push(input.message);
        return Promise.resolve('[]');
      },
    });

    expect(seen[0]?.length).toBe(4000);
  });
});
