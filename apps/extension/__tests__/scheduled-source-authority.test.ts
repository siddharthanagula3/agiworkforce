import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { scheduledSourceAuthority } from '../src/features/background/scheduled-task-source-authority';
import {
  loadScheduledSitePolicyInput,
  ADMIN_SITE_POLICY_STORAGE_KEY,
} from '../src/features/site-policy/store';
import { SITE_ALLOWLIST_STORAGE_KEY, ORIGIN_EXTENSION_PAGE } from '../src/background/policy';

const origin = 'https://example.com';
const localGet = vi.fn();
const managedGet = vi.fn();
beforeEach(() => {
  vi.stubGlobal('chrome', { storage: { local: { get: localGet }, managed: { get: managedGet } } });
  localGet.mockReset().mockResolvedValue({ [SITE_ALLOWLIST_STORAGE_KEY]: [origin] });
  managedGet.mockReset().mockResolvedValue({});
});

describe('scheduled source authority', () => {
  it('distinguishes absent policy from unreadable local or managed authority', async () => {
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe(
      'allowed',
    );
    localGet.mockRejectedValueOnce(new Error('unreadable'));
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe(
      'unavailable',
    );
    managedGet.mockRejectedValueOnce(new Error('unreadable'));
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe(
      'unavailable',
    );
  });

  it('keeps managed precedence and rejects malformed authority as unknown', async () => {
    const block = { version: 1, blocklist: [{ pattern: origin }], allowlist: [] };
    managedGet.mockResolvedValue({ [ADMIN_SITE_POLICY_STORAGE_KEY]: block });
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe('denied');
    managedGet.mockResolvedValue({ [ADMIN_SITE_POLICY_STORAGE_KEY]: { invalid: true } });
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe(
      'unavailable',
    );
  });

  it('requires organization approval even when the user approved the origin', async () => {
    managedGet.mockResolvedValue({
      [ADMIN_SITE_POLICY_STORAGE_KEY]: {
        version: 1,
        blocklist: [],
        allowlist: [{ pattern: 'https://other.example' }],
      },
    });
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe('denied');
  });

  it('checks the current shortcut source and retains absent/sentinel exemptions', () => {
    const policy = { admin: null, userAllowlist: [origin] };
    expect(
      scheduledSourceAuthority([ORIGIN_EXTENSION_PAGE, 'https://revoked.example'], policy),
    ).toBe('denied');
    expect(scheduledSourceAuthority([undefined, ORIGIN_EXTENSION_PAGE], null)).toBe('allowed');
    expect(scheduledSourceAuthority([origin], null)).toBe('unavailable');
  });

  it('does not equate an unreadable allowlist with an empty allowlist', async () => {
    localGet.mockResolvedValue({ [SITE_ALLOWLIST_STORAGE_KEY]: [] });
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe('denied');
    localGet.mockResolvedValue({ [SITE_ALLOWLIST_STORAGE_KEY]: 'corrupt' });
    expect(scheduledSourceAuthority([origin], await loadScheduledSitePolicyInput())).toBe(
      'unavailable',
    );
  });

  it('routes cold admission and recovery through fresh authority before irreversible cleanup', () => {
    const source = readFileSync(new URL('../src/background.ts', import.meta.url), 'utf8');
    const admission = source.slice(
      source.indexOf('async function executeScheduledTask('),
      source.indexOf('// A tab-originated message'),
    );
    expect(admission).toContain('await assertScheduledTaskSourceAuthority(task)');
    expect(admission).toContain('await handleDeleteScheduledTask(');
    expect(admission.indexOf('await assertScheduledTaskSourceAuthority(task)')).toBeLessThan(
      admission.indexOf('await handleDeleteScheduledTask('),
    );
    expect(admission).not.toContain('!isOriginApprovedForAutomation(task.createdByOrigin)');
    expect(admission).toContain('(current) => current.createdByOrigin === task.createdByOrigin');
    expect(admission).toContain(
      'if (!deletion.success || deletionGeneration === undefined) return;',
    );
    expect(admission).toContain(
      'if (scheduledTaskExecutions.generation(task.id) !== deletionGeneration) return;',
    );
    const resolver = source.slice(
      source.indexOf('async function assertScheduledTaskSourceAuthority('),
      source.indexOf('async function assertScheduledJournalSourceAuthority('),
    );
    expect(resolver).toContain(
      'const directPrompt = task.prompt?.slice(0, TASK_PROMPT_MAX_CHARS).trim();',
    );
    expect(resolver).toContain('if (!directPrompt && task.shortcutId)');
    expect(resolver).toContain(
      'userAllowlist: [...storedPolicy.userAllowlist, ...oneTimeGrantedOrigins()]',
    );
    const recovery = source.slice(
      source.indexOf('async function recoverScheduledTaskRun('),
      source.indexOf('const MAINTENANCE_ALARM'),
    );
    expect(recovery).toContain('if (error instanceof ScheduledTaskSourceUnavailableError) return;');
    expect(recovery).toContain('const latest =');
    expect(
      recovery.indexOf('if (error instanceof ScheduledTaskSourceUnavailableError) return;'),
    ).toBeLessThan(recovery.indexOf('const latest ='));
    expect(source).toContain('await assertScheduledJournalSourceAuthority(initialJournal);');
    expect(source).toContain('await assertScheduledJournalSourceAuthority(state.journal);');
  });
});
