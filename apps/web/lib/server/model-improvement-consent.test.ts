import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';
import {
  CHAT_MODEL_IMPROVEMENT_KEY,
  VOICE_MODEL_IMPROVEMENT_KEY,
  hasInvalidModelImprovementConsent,
  readModelImprovementConsent,
} from './model-improvement-consent';

type LoggerModule = typeof import('@/lib/logger');

const query = vi.fn();
const db = { query } as unknown as Parameters<typeof readModelImprovementConsent>[0];

beforeEach(() => {
  query.mockReset();
  vi.mocked(logger.warn).mockClear();
});

describe('model improvement consent reader', () => {
  it.each([
    ['chats', CHAT_MODEL_IMPROVEMENT_KEY],
    ['voice', VOICE_MODEL_IMPROVEMENT_KEY],
  ] as const)(
    'reads the %s choice from the privacy namespace of the user',
    async (content, key) => {
      query.mockResolvedValueOnce([{ choice: true }]);
      await expect(readModelImprovementConsent(db, 'user-1', content)).resolves.toBe(true);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('public.user_settings'), [
        'user-1',
        'privacy',
        key,
      ]);
    },
  );

  it.each([
    ['no settings row', []],
    ['an absent choice', [{ choice: null }]],
    ['a choice that is off', [{ choice: false }]],
    ['a choice stored as the word true', [{ choice: 'true' }]],
    ['a choice stored as a number', [{ choice: 1 }]],
    ['a choice stored as an object', [{ choice: { value: true } }]],
    ['a row without the column', [{}]],
  ])('is off for %s', async (_label, rows) => {
    query.mockResolvedValueOnce(rows);
    await expect(readModelImprovementConsent(db, 'user-1', 'chats')).resolves.toBe(false);
  });

  it('is off and logged when the settings cannot be read', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(readModelImprovementConsent(db, 'user-1', 'voice')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps chat and voice choices separate', async () => {
    query.mockResolvedValueOnce([{ choice: true }]).mockResolvedValueOnce([{ choice: false }]);
    await expect(readModelImprovementConsent(db, 'user-1', 'chats')).resolves.toBe(true);
    await expect(readModelImprovementConsent(db, 'user-1', 'voice')).resolves.toBe(false);
  });
});

describe('model improvement consent shape', () => {
  it('accepts booleans, absence and settings without a privacy namespace', () => {
    expect(hasInvalidModelImprovementConsent({})).toBe(false);
    expect(hasInvalidModelImprovementConsent({ general: { theme: 'dark' } })).toBe(false);
    expect(
      hasInvalidModelImprovementConsent({
        privacy: { [CHAT_MODEL_IMPROVEMENT_KEY]: true, [VOICE_MODEL_IMPROVEMENT_KEY]: false },
      }),
    ).toBe(false);
  });

  it.each(['true', 1, null, {}])('rejects a choice stored as %j', (value) => {
    expect(
      hasInvalidModelImprovementConsent({ privacy: { [CHAT_MODEL_IMPROVEMENT_KEY]: value } }),
    ).toBe(true);
    expect(
      hasInvalidModelImprovementConsent({ privacy: { [VOICE_MODEL_IMPROVEMENT_KEY]: value } }),
    ).toBe(true);
  });
});
