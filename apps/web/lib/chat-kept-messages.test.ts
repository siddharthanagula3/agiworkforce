import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_KEPT_ASSISTANT_CONTENT,
  hasCompletedMediaResult,
  isKeepableChatMessage,
  keptMessageContent,
} from './chat-kept-messages';

const IMAGE = { toolType: 'image-generation', imageUrl: 'https://cdn.example/a.png' };

describe('isKeepableChatMessage', () => {
  it('keeps any message that has text', () => {
    expect(isKeepableChatMessage({ role: 'user', content: 'hello' })).toBe(true);
    expect(isKeepableChatMessage({ role: 'assistant', content: ' answer ' })).toBe(true);
  });

  it('keeps a completed generated image whose text is empty', () => {
    expect(isKeepableChatMessage({ role: 'assistant', content: '', metadata: IMAGE })).toBe(true);
  });

  it('keeps a completed generated video whose text is empty', () => {
    expect(
      isKeepableChatMessage({
        role: 'assistant',
        content: '',
        metadata: {
          toolType: 'video-generation',
          videoStatus: 'completed',
          videoUrl: 'https://cdn.example/a.mp4',
        },
      }),
    ).toBe(true);
  });

  it('drops blank messages without a completed result', () => {
    expect(isKeepableChatMessage({ role: 'assistant', content: '   ' })).toBe(false);
    expect(isKeepableChatMessage({ role: 'assistant', content: '', metadata: {} })).toBe(false);
    expect(
      isKeepableChatMessage({
        role: 'assistant',
        content: '',
        metadata: { toolType: 'image-generation', imageGenPrompt: 'a cat' },
      }),
    ).toBe(false);
    expect(
      isKeepableChatMessage({
        role: 'assistant',
        content: '',
        metadata: { toolType: 'image-generation', imageUrl: '  ' },
      }),
    ).toBe(false);
    expect(
      isKeepableChatMessage({
        role: 'assistant',
        content: '',
        metadata: { toolType: 'video-generation', videoStatus: 'processing', videoUrl: 'x' },
      }),
    ).toBe(false);
  });

  it('never keeps a blank user message because of metadata', () => {
    expect(isKeepableChatMessage({ role: 'user', content: '', metadata: IMAGE })).toBe(false);
  });
});

describe('hasCompletedMediaResult', () => {
  it('is false without metadata', () => {
    expect(hasCompletedMediaResult(undefined)).toBe(false);
  });
});

describe('keptMessageContent', () => {
  it('trims text', () => {
    expect(keptMessageContent({ role: 'user', content: ' hi ' })).toBe('hi');
  });

  it('stores the placeholder for a result with no text', () => {
    expect(keptMessageContent({ role: 'assistant', content: '', metadata: IMAGE })).toBe(
      EMPTY_KEPT_ASSISTANT_CONTENT,
    );
  });
});

describe('EMPTY_KEPT_ASSISTANT_CONTENT', () => {
  it('is a single zero-width space', () => {
    expect(EMPTY_KEPT_ASSISTANT_CONTENT).toBe('\u200b');
  });

  it('is the only definition used by the stream hook and the media persistence module', () => {
    const webRoot = join(__dirname, '..');
    const sources = [
      join(webRoot, 'lib/hooks/useChatStream.ts'),
      join(webRoot, 'features/chat/lib/imageGenerationPersistence.ts'),
    ].map((path) => readFileSync(path, 'utf8'));
    for (const source of sources) {
      expect(source).not.toMatch(/0x200b/i);
      expect(source).toContain('EMPTY_KEPT_ASSISTANT_CONTENT');
    }
  });
});
