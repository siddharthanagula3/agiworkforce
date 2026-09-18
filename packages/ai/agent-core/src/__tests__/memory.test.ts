import { describe, expect, it, vi } from 'vitest';
import {
  boostMemoryImportance,
  explicitForgetHandler,
  explicitRememberHandler,
  extractPassiveMemoryFacts,
  parseExplicitMemoryCommand,
  classifyMemoryCategory,
  cosineSimilarity,
  decayMemoryImportance,
  extractCandidateMemoryFacts,
  memoryConflictTopic,
  memoryConsolidationKey,
  memoryRelevanceScore,
  normalizeMemoryKey,
} from '../memory';

describe('shared memory engine', () => {
  it('classifies and normalizes memory facts', () => {
    expect(classifyMemoryCategory('User prefers Rust over Go')).toBe('preference');
    expect(classifyMemoryCategory('We decided to keep SQLite local')).toBe('decision');
    expect(normalizeMemoryKey('  User   PREFERS\nRust  ')).toBe('user prefers rust');
  });

  it('keys near-duplicates together regardless of case, spacing and punctuation', () => {
    expect(memoryConsolidationKey('User prefers Rust.')).toBe(
      memoryConsolidationKey('  user   PREFERS rust!! '),
    );
    expect(memoryConsolidationKey("User's name is Ada")).toBe('user s name is ada');
    expect(memoryConsolidationKey('User prefers Rust')).not.toBe(
      memoryConsolidationKey('User prefers Go'),
    );
  });

  it('names a conflict topic only for single-valued facts', () => {
    expect(memoryConflictTopic('User lives in Berlin')?.topic).toBe('residence');
    expect(memoryConflictTopic('I live in Paris.')?.topic).toBe('residence');
    expect(memoryConflictTopic("User's name is Ada")?.topic).toBe('name');
    expect(memoryConflictTopic('User works at Acme')?.topic).toBe('employer');
    expect(memoryConflictTopic('User likes Rust')).toBeNull();
    expect(memoryConflictTopic('User lives in')).toBeNull();
  });

  it('applies the canonical decay and boost policy', () => {
    expect(decayMemoryImportance(10, 14)).toBe(8);
    expect(decayMemoryImportance(2, 365)).toBe(1);
    expect(boostMemoryImportance(9)).toBe(10);
  });

  it('rejects invalid embeddings', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBeNull();
    expect(cosineSimilarity([1], [1, 0])).toBeNull();
    expect(cosineSimilarity([Number.NaN], [1])).toBeNull();
  });

  it('uses a valid embedding signal in relevance scoring', () => {
    const base = { lexicalSimilarity: 0.2, importance: 8, daysSinceAccess: 1 };
    const withEmbedding = memoryRelevanceScore({ ...base, embeddingSimilarity: 0.9 });
    const lexicalOnly = memoryRelevanceScore(base);
    expect(withEmbedding).toBeGreaterThan(lexicalOnly);
    expect(withEmbedding).toBeGreaterThanOrEqual(0);
    expect(withEmbedding).toBeLessThanOrEqual(1);
  });

  it('respects surface retrieval weighting', () => {
    const base = {
      lexicalSimilarity: 0.9,
      embeddingSimilarity: 0.1,
      importance: 5,
      daysSinceAccess: 0,
    };
    expect(memoryRelevanceScore({ ...base, lexicalWeight: 0.8 })).toBeGreaterThan(
      memoryRelevanceScore({ ...base, lexicalWeight: 0.2 }),
    );
  });

  it('extracts conservative self-disclosures and ignores questions', () => {
    expect(extractCandidateMemoryFacts('My name is Sid. I prefer dark mode.')).toEqual([
      "User's name is Sid",
      'User prefers dark mode',
    ]);
    expect(extractCandidateMemoryFacts('Should I prefer dark mode?')).toEqual([]);
  });
});

describe('parseExplicitMemoryCommand', () => {
  it('reads a remember command out of the phrasings people actually use', () => {
    for (const utterance of [
      'Remember that I use TypeScript',
      'Please remember: I use TypeScript',
      'remember this: I use TypeScript',
      'Remember I use TypeScript',
    ]) {
      expect(parseExplicitMemoryCommand(utterance)).toMatchObject({
        kind: 'remember',
        subject: 'I use TypeScript',
      });
    }
  });

  it('reads a forget command and keeps its subject', () => {
    expect(parseExplicitMemoryCommand('Forget what I told you about Berlin')).toMatchObject({
      kind: 'forget',
      subject: 'Berlin',
    });
    expect(parseExplicitMemoryCommand('forget that I work at Acme')).toMatchObject({
      kind: 'forget',
      subject: 'I work at Acme',
    });
    expect(parseExplicitMemoryCommand('Stop remembering my address')).toMatchObject({
      kind: 'forget',
      subject: 'my address',
    });
    expect(parseExplicitMemoryCommand('Delete the memory about Berlin')).toMatchObject({
      kind: 'forget',
      subject: 'Berlin',
    });
  });

  it('does not treat a question as a command', () => {
    expect(parseExplicitMemoryCommand('Do you remember what I said about Berlin?')).toBeNull();
    expect(parseExplicitMemoryCommand('What do you remember about me?')).toBeNull();
  });

  it('finds the command in a turn that begins with something else', () => {
    expect(parseExplicitMemoryCommand('Thanks. Remember that I use pnpm.')).toMatchObject({
      kind: 'remember',
      subject: 'I use pnpm',
    });
  });

  it('ignores a turn that only mentions things', () => {
    expect(parseExplicitMemoryCommand('I live in Berlin and I like pnpm')).toBeNull();
  });
});

describe('extractPassiveMemoryFacts', () => {
  it('leaves the explicit command to its own handler', () => {
    expect(extractPassiveMemoryFacts('Remember that I use TypeScript')).toEqual([]);
  });

  it('still extracts the rest of the turn', () => {
    expect(extractPassiveMemoryFacts('Remember that I use pnpm. I live in Berlin.')).toEqual([
      'User lives in Berlin',
    ]);
  });
});

describe('explicitRememberHandler', () => {
  const command = parseExplicitMemoryCommand('Remember that I use TypeScript')!;

  it('stores the fact and confirms it in words the user sees', async () => {
    const store = vi.fn(async () => ({ stored: true, alreadyKnown: false }));
    const outcome = await explicitRememberHandler(command, {
      checkEligibility: async () => ({ eligible: true }),
      store,
    });

    expect(outcome.status).toBe('stored');
    expect(outcome.message).toBe('Saved to memory: I use TypeScript');
    expect(store).toHaveBeenCalledWith({ fact: 'I use TypeScript', category: 'fact' });
  });

  it('checks policy before storing, and says why when it refuses', async () => {
    const store = vi.fn(async () => ({ stored: true, alreadyKnown: false }));
    const outcome = await explicitRememberHandler(command, {
      checkEligibility: async () => ({
        eligible: false,
        reason: 'memory_disabled',
        message: 'This workspace has memory turned off for its members.',
      }),
      store,
    });

    expect(outcome.status).toBe('refused');
    expect(outcome.message).toContain('This workspace has memory turned off');
    expect(store).not.toHaveBeenCalled();
  });

  it('says it already knows rather than claiming a new save', async () => {
    const outcome = await explicitRememberHandler(command, {
      checkEligibility: async () => ({ eligible: true }),
      store: async () => ({ stored: false, alreadyKnown: true }),
    });
    expect(outcome.status).toBe('already_known');
    expect(outcome.message).toBe('I already remember: I use TypeScript');
  });

  it('classifies a preference as one', async () => {
    const preference = parseExplicitMemoryCommand('Remember that I prefer dark mode')!;
    const outcome = await explicitRememberHandler(preference, {
      checkEligibility: async () => ({ eligible: true }),
      store: async () => ({ stored: true, alreadyKnown: false }),
    });
    expect(outcome.status === 'stored' && outcome.category).toBe('preference');
  });
});

describe('explicitForgetHandler', () => {
  const command = parseExplicitMemoryCommand('Forget what I told you about Berlin')!;
  const matches = [{ id: 'm1', content: 'User lives in Berlin' }];

  it('names the consequence and deletes nothing until it is confirmed', async () => {
    const remove = vi.fn(async () => matches);
    const outcome = await explicitForgetHandler(command, {
      find: async () => matches,
      remove,
    });

    expect(outcome.status).toBe('confirmation_required');
    expect(outcome.message).toContain('cannot be undone');
    expect(outcome.message).toContain('User lives in Berlin');
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes and confirms exactly what was removed', async () => {
    const remove = vi.fn(async () => matches);
    const outcome = await explicitForgetHandler(
      command,
      { find: async () => matches, remove },
      { confirmed: true },
    );

    expect(outcome.status).toBe('forgotten');
    expect(remove).toHaveBeenCalledWith(['m1']);
    expect(outcome.message).toContain('User lives in Berlin');
    expect(outcome.removed).toEqual(matches);
  });

  it('says there was nothing to forget rather than claiming a deletion', async () => {
    const outcome = await explicitForgetHandler(
      command,
      { find: async () => [], remove: async () => [] },
      { confirmed: true },
    );
    expect(outcome.status).toBe('nothing_to_forget');
    expect(outcome.removed).toEqual([]);
  });

  it('does not claim success when the delete removed nothing', async () => {
    const outcome = await explicitForgetHandler(
      command,
      { find: async () => matches, remove: async () => [] },
      { confirmed: true },
    );
    expect(outcome.status).toBe('nothing_to_forget');
  });
});
