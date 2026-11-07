import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tier1Generate } from '../tier1.js';
import type { ChatMessage } from '../types.js';

const native = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  generate: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: native.platform,
  NativeModules: {
    AGIFoundationModels: { generate: native.generate },
    AGIAICore: { generate: native.generate },
  },
  NativeEventEmitter: class {
    addListener() {
      return { remove: native.remove };
    }
  },
}));

describe.each(['ios', 'android'])('tier1 %s instructions', (platform) => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.platform.OS = platform;
    native.generate.mockResolvedValue('Local response');
  });

  it('preserves explicit instructions before ordered system history without mutating messages', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Default local instructions' },
      { role: 'user', content: 'Earlier question' },
      { role: 'system', content: 'Personal context' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'system', content: 'View instructions' },
      { role: 'system', content: 'Project instructions' },
    ];
    const original = messages.map((message) => ({ ...message }));

    await tier1Generate({
      prompt: 'Next question',
      systemPrompt: 'Explicit instructions',
      messages,
      requestId: 'instruction-request',
    });

    expect(native.generate).toHaveBeenCalledExactlyOnceWith(
      'Next question',
      'Explicit instructions\n\nDefault local instructions\n\nPersonal context\n\nView instructions\n\nProject instructions',
      [original[1], original[3]],
      'instruction-request',
    );
    expect(messages).toEqual(original);
    expect(native.remove).toHaveBeenCalledOnce();
  });

  it('passes system history when the caller omits an explicit system prompt', async () => {
    await tier1Generate({
      prompt: 'Question',
      messages: [
        { role: 'system', content: 'Default local instructions' },
        { role: 'system', content: 'Project instructions' },
      ],
      requestId: 'history-request',
    });

    expect(native.generate).toHaveBeenCalledExactlyOnceWith(
      'Question',
      'Default local instructions\n\nProject instructions',
      [],
      'history-request',
    );
  });

  it('preserves an explicit-only instruction string', async () => {
    await tier1Generate({
      prompt: 'Question',
      systemPrompt: '  Keep this instruction formatting.\n',
      requestId: 'explicit-request',
    });

    expect(native.generate).toHaveBeenCalledExactlyOnceWith(
      'Question',
      '  Keep this instruction formatting.\n',
      [],
      'explicit-request',
    );
  });

  it('omits blank instruction blocks without changing non-system messages', async () => {
    const user: ChatMessage = { role: 'user', content: '  Earlier question\n' };
    const assistant: ChatMessage = { role: 'assistant', content: '' };
    await tier1Generate({
      prompt: 'Question',
      systemPrompt: ' \n\t',
      messages: [
        { role: 'system', content: '' },
        user,
        { role: 'system', content: '  Project instructions\n' },
        { role: 'system', content: ' \n' },
        assistant,
      ],
      requestId: 'blank-request',
    });

    expect(native.generate).toHaveBeenCalledExactlyOnceWith(
      'Question',
      '  Project instructions\n',
      [user, assistant],
      'blank-request',
    );
  });

  it.each([undefined, [] as ChatMessage[], [{ role: 'system', content: ' \n' }] as ChatMessage[]])(
    'passes no instruction artifacts for empty history %j',
    async (messages) => {
      await tier1Generate({ prompt: 'Question', messages, requestId: 'empty-request' });

      expect(native.generate).toHaveBeenCalledExactlyOnceWith('Question', '', [], 'empty-request');
    },
  );
});
