import { describe, expect, it } from 'vitest';
import {
  classifyConversationText,
  getConversationTopicPresentation,
} from './conversation-classification-service';

describe('conversation classification service', () => {
  it('preserves the existing deterministic priority for overlapping debug and code text', () => {
    expect(classifyConversationText('Fix this TypeScript function error and stack trace')).toBe(
      'debug',
    );
  });

  it('returns a broad non-sensitive fallback instead of inventing a topic', () => {
    expect(classifyConversationText('Hello there')).toBe('general');
  });

  it('owns the reusable display metadata for recap topic proportions', () => {
    expect(getConversationTopicPresentation('research')).toEqual({
      label: 'Research',
      description: 'Questions, explanations, sources, and comparisons.',
    });
  });
});
