import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { buildCustomInstructionsPreamble, readUserIdentity } from '../user-identity';

const db = { query: (...args: unknown[]) => mocks.query(...args) } as unknown as DatabaseAdapter;

function bindSettings(settings: Record<string, unknown>) {
  mocks.query.mockImplementation(async (sql: string) => {
    if (/from public\.user_settings/i.test(String(sql))) return [{ settings }];
    if (/from profiles/i.test(String(sql))) return [{ id: 'user-1', display_name: 'Ada' }];
    return [];
  });
}

beforeEach(() => vi.clearAllMocks());

describe('an instruction can be switched off without being deleted', () => {
  it('keeps the text and leaves it out of the assembled prompt', async () => {
    bindSettings({
      general: { instructions: 'Always answer in Haskell.', instructionsEnabled: false },
    });

    const identity = await readUserIdentity(db, 'user-1');
    const preamble = await buildCustomInstructionsPreamble(db, 'user-1');

    expect(identity.instructions).toBe('Always answer in Haskell.');
    expect(identity.instructionsEnabled).toBe(false);
    expect(preamble).toBeNull();
  });

  it('applies the same instruction once it is switched back on', async () => {
    bindSettings({
      general: { instructions: 'Always answer in Haskell.', instructionsEnabled: true },
    });

    expect(await buildCustomInstructionsPreamble(db, 'user-1')).toContain(
      'Always answer in Haskell.',
    );
  });

  it('applies an instruction written before the flag existed', async () => {
    bindSettings({ general: { instructions: 'Cite your sources.' } });

    const identity = await readUserIdentity(db, 'user-1');

    expect(identity.instructionsEnabled).toBe(true);
    expect(await buildCustomInstructionsPreamble(db, 'user-1')).toContain('Cite your sources.');
  });

  it('does not promote the other surface instruction when this one is merely empty', async () => {
    bindSettings({
      general: { instructions: '   ' },
      personalization: { instructions: 'Write in British English.' },
    });

    expect(await buildCustomInstructionsPreamble(db, 'user-1')).toContain(
      'Write in British English.',
    );
  });

  it('carries the account scope on the block it reads', async () => {
    bindSettings({ general: { instructions: 'Be brief.' } });

    expect((await readUserIdentity(db, 'user-1')).instructionScope).toBe('account');
  });
});

describe('the response style reaches the prompt', () => {
  it('states the requested language, technical level and formatting', async () => {
    bindSettings({
      personalization: {
        responseLanguage: 'fr',
        technicalLevel: 'expert',
        preferredFormatting: 'tables_and_code',
        style: 'concise',
      },
    });

    const preamble = await buildCustomInstructionsPreamble(db, 'user-1');

    expect(preamble).toContain('Respond in French');
    expect(preamble).toContain('The user is an expert');
    expect(preamble).toContain('Prefer tables for comparisons');
    expect(preamble).toContain('Keep responses short and direct');
  });

  it('says nothing about language when the user has not chosen one', async () => {
    bindSettings({ personalization: { style: 'concise' } });

    expect(await buildCustomInstructionsPreamble(db, 'user-1')).not.toMatch(/Respond in /u);
  });
});
