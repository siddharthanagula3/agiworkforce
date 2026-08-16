import { extractCandidateMemoryFacts } from '@agiworkforce/agent-core';

const extractCandidateFacts = extractCandidateMemoryFacts;

describe('extractCandidateFacts', () => {
  it('returns [] for empty / non-string input', () => {
    expect(extractCandidateFacts('')).toEqual([]);
    // @ts-expect-error testing runtime guard
    expect(extractCandidateFacts(null)).toEqual([]);
    // @ts-expect-error testing runtime guard
    expect(extractCandidateFacts(undefined)).toEqual([]);
  });

  it('returns [] when no pattern matches', () => {
    expect(extractCandidateFacts('what is the capital of France')).toEqual([]);
    expect(extractCandidateFacts('please write me a poem about the sea')).toEqual([]);
  });

  it('extracts a name', () => {
    expect(extractCandidateFacts('Hi, my name is Sid.')).toEqual(["User's name is Sid"]);
  });

  it('extracts occupation from "I am a" / "I\'m a"', () => {
    expect(extractCandidateFacts("I'm a pediatric nurse")).toEqual(['User is a pediatric nurse']);
    expect(extractCandidateFacts('I am a teacher.')).toEqual(['User is a teacher']);
  });

  it('extracts preferences and likes', () => {
    expect(extractCandidateFacts('I prefer dark mode')).toEqual(['User prefers dark mode']);
    expect(extractCandidateFacts('I love hiking on weekends')).toEqual([
      'User loves hiking on weekends',
    ]);
  });

  it('extracts location', () => {
    expect(extractCandidateFacts('I live in Pune')).toEqual(['User lives in Pune']);
  });

  it('extracts explicit remember-that statements, capitalized', () => {
    expect(extractCandidateFacts('Remember that I use UTC+5:30')).toEqual(['I use UTC+5:30']);
  });

  it('ignores questions even if they contain a trigger phrase', () => {
    expect(extractCandidateFacts('do you think I am a good writer?')).toEqual([]);
    expect(extractCandidateFacts('what should I prefer here?')).toEqual([]);
  });

  it('handles multiple sentences and dedupes', () => {
    const out = extractCandidateFacts('My name is Sid. I live in Pune. I live in Pune.');
    expect(out).toContain("User's name is Sid");
    expect(out).toContain('User lives in Pune');
    expect(out).toHaveLength(2);
  });

  it('drops clauses that are too long (a paragraph is not a fact)', () => {
    const long = 'I prefer ' + 'x'.repeat(200);
    expect(extractCandidateFacts(long)).toEqual([]);
  });

  it('strips trailing punctuation from the captured clause', () => {
    expect(extractCandidateFacts('I work at Acme!')).toEqual(['User works at Acme']);
  });

  it('takes only the most specific (earliest) pattern per sentence', () => {
    const out = extractCandidateFacts("I'm a developer who likes coffee");
    expect(out).toEqual(['User is a developer who likes coffee']);
  });
});
