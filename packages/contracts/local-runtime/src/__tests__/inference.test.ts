import { describe, expect, it } from 'vitest';
import {
  LocalInferenceRefused,
  isLocalModelId,
  isLoopbackBaseUrl,
  localModelId,
  normalizeLocalBaseUrl,
  normalizeLocalModelSettings,
  parseLocalModelId,
} from '../inference';

const DEFAULTS = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234/v1',
} as const;

describe('local model ids', () => {
  it('round-trips a server and a model name', () => {
    const id = localModelId('ollama', 'tiny-chat:1b');
    expect(id).toBe('local:ollama/tiny-chat:1b');
    expect(parseLocalModelId(id)).toEqual({ serverId: 'ollama', name: 'tiny-chat:1b' });
  });

  it('keeps a slash inside the model name', () => {
    const id = localModelId('lmstudio', 'vendor/small-chat-4b');
    expect(parseLocalModelId(id)).toEqual({ serverId: 'lmstudio', name: 'vendor/small-chat-4b' });
  });

  it('refuses a catalogue model id', () => {
    expect(isLocalModelId('managed-catalogue-model')).toBe(false);
    expect(parseLocalModelId('managed-catalogue-model')).toBeNull();
  });

  it('refuses an unknown server and an empty name', () => {
    expect(parseLocalModelId('local:vllm/some-model')).toBeNull();
    expect(parseLocalModelId('local:ollama/')).toBeNull();
    expect(parseLocalModelId('local:ollama')).toBeNull();
  });
});

describe('loopback containment', () => {
  it('accepts the three loopback spellings', () => {
    expect(isLoopbackBaseUrl('http://localhost:11434')).toBe(true);
    expect(isLoopbackBaseUrl('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLoopbackBaseUrl('http://[::1]:11434')).toBe(true);
  });

  it('refuses a host that is not this machine', () => {
    expect(isLoopbackBaseUrl('http://192.168.1.20:11434')).toBe(false);
    expect(isLoopbackBaseUrl('https://ollama.example.com')).toBe(false);
    expect(isLoopbackBaseUrl('http://0.0.0.0:11434')).toBe(false);
  });

  it('refuses a non-http scheme and a malformed url', () => {
    expect(isLoopbackBaseUrl('file:///models')).toBe(false);
    expect(isLoopbackBaseUrl('localhost:11434')).toBe(false);
  });
});

describe('normalizeLocalBaseUrl', () => {
  it('falls back when the value is blank and trims a trailing slash', () => {
    expect(normalizeLocalBaseUrl('  ', DEFAULTS.ollama)).toBe(DEFAULTS.ollama);
    expect(normalizeLocalBaseUrl('http://localhost:11434/', DEFAULTS.ollama)).toBe(
      'http://localhost:11434',
    );
  });

  it('throws rather than accept a remote server under the Local label', () => {
    expect(() => normalizeLocalBaseUrl('http://10.0.0.4:11434', DEFAULTS.ollama)).toThrow(
      LocalInferenceRefused,
    );
  });
});

describe('normalizeLocalModelSettings', () => {
  it('fills every server from the defaults', () => {
    expect(normalizeLocalModelSettings(undefined, DEFAULTS)).toEqual({ baseUrls: { ...DEFAULTS } });
  });

  it('drops a stored non-loopback url instead of trusting the file', () => {
    const settings = normalizeLocalModelSettings(
      { baseUrls: { ollama: 'http://evil.example.com', lmstudio: 'http://127.0.0.1:1234/v1' } },
      DEFAULTS,
    );
    expect(settings.baseUrls.ollama).toBe(DEFAULTS.ollama);
    expect(settings.baseUrls.lmstudio).toBe('http://127.0.0.1:1234/v1');
  });
});
