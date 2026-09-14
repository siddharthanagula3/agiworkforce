import { describe, expect, it } from 'vitest';
import {
  LOCAL_ATTACHMENT_REFUSAL,
  LocalInferenceRefused,
  assertLocalModelMeetsMinimum,
  assertLocalTurnCarriesNoAttachments,
  formatLocalModelSize,
  isLocalModelBelowMinimum,
  isLocalModelId,
  isLoopbackBaseUrl,
  localModelBelowMinimumReason,
  localModelId,
  normalizeLocalBaseUrl,
  normalizeLocalModelSettings,
  parseLocalModelId,
  partitionLocalModels,
  type LocalModel,
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

describe('local model minimum size', () => {
  it('hides a model whose size is under the minimum', () => {
    expect(isLocalModelBelowMinimum({ sizeBillion: 0.494 })).toBe(true);
    expect(isLocalModelBelowMinimum({ sizeBillion: 0.87344 })).toBe(true);
  });

  it('keeps a model at or above the minimum', () => {
    expect(isLocalModelBelowMinimum({ sizeBillion: 1 })).toBe(false);
    expect(isLocalModelBelowMinimum({ sizeBillion: 1.5 })).toBe(false);
  });

  it('keeps a model whose size the server never published', () => {
    expect(isLocalModelBelowMinimum({})).toBe(false);
  });

  it('names the hidden model and what to do about it', () => {
    expect(localModelBelowMinimumReason({ name: 'smollm2:135m' })).toBe(
      'smollm2:135m is under 1B parameters and is hidden; pull a larger model',
    );
  });

  it('splits a discovered list into what the picker shows and what it explains', () => {
    const models: LocalModel[] = [
      {
        id: 'local:ollama/a',
        serverId: 'ollama',
        serverLabel: 'Ollama',
        name: 'a',
        sizeBillion: 1.5,
      },
      {
        id: 'local:ollama/b',
        serverId: 'ollama',
        serverLabel: 'Ollama',
        name: 'b',
        sizeBillion: 0.5,
      },
      { id: 'local:lmstudio/c', serverId: 'lmstudio', serverLabel: 'LM Studio', name: 'c' },
    ];
    const { usable, hidden } = partitionLocalModels(models);
    expect(usable.map((model) => model.name)).toEqual(['a', 'c']);
    expect(hidden.map((model) => model.name)).toEqual(['b']);
  });

  it('refuses a turn on a model under the minimum', () => {
    expect(() =>
      assertLocalModelMeetsMinimum({ name: 'qwen2.5:0.5b', sizeBillion: 0.494 }),
    ).toThrow(LocalInferenceRefused);
    expect(() =>
      assertLocalModelMeetsMinimum({ name: 'qwen2.5:1.5b', sizeBillion: 1.5 }),
    ).not.toThrow();
  });

  it('writes a size the way the model servers do', () => {
    expect(formatLocalModelSize(0.494)).toBe('0.5B');
    expect(formatLocalModelSize(1.5)).toBe('1.5B');
    expect(formatLocalModelSize(12.3)).toBe('12B');
  });
});

describe('assertLocalTurnCarriesNoAttachments', () => {
  it('allows a plain text turn', () => {
    expect(() =>
      assertLocalTurnCarriesNoAttachments([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ]),
    ).not.toThrow();
  });

  it('refuses a message carrying an attachment field', () => {
    expect(() =>
      assertLocalTurnCarriesNoAttachments([
        { role: 'user', content: 'read this', attachments: [{ name: 'a.pdf' }] },
      ]),
    ).toThrow(LOCAL_ATTACHMENT_REFUSAL);
  });

  it('refuses content that is not plain text', () => {
    expect(() =>
      assertLocalTurnCarriesNoAttachments([
        { role: 'user', content: [{ type: 'image', source: { data: 'AAAA' } }] },
      ]),
    ).toThrow(LOCAL_ATTACHMENT_REFUSAL);
  });

  it('refuses attachment bytes smuggled into the text as a data url', () => {
    expect(() =>
      assertLocalTurnCarriesNoAttachments([
        { role: 'user', content: 'look: data:image/png;base64,iVBORw0KGgo=' },
      ]),
    ).toThrow(LOCAL_ATTACHMENT_REFUSAL);
  });

  it('refuses an entry that is not a message at all', () => {
    expect(() => assertLocalTurnCarriesNoAttachments(['hello'])).toThrow(LOCAL_ATTACHMENT_REFUSAL);
  });
});
