import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { subscribeToLocalModelCatalogChanges } from '@/lib/localModelCatalog';

import { MASTER_PASSWORD_SCOPE } from '../masterPasswordScope';
import {
  VAULT_STATE_CHANGED_EVENT,
  changeMasterPassword,
  describeKeysNotUpgraded,
  describePasswordPolicy,
  describePasswordRuleViolation,
  lockMasterPassword,
  passwordRuleViolation,
  refusalMessage,
  removeMasterPassword,
  setUpMasterPassword,
  unlockMasterPassword,
} from '../masterPasswordVault';

function commandOrder(): string[] {
  return vi.mocked(invoke).mock.calls.map(([command]) => String(command));
}

describe('master password vault', () => {
  const onVaultChanged = vi.fn();
  const onCatalogChanged = vi.fn();
  let unsubscribeCatalog: () => void = () => {};

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    onVaultChanged.mockReset();
    onCatalogChanged.mockReset();
    window.addEventListener(VAULT_STATE_CHANGED_EVENT, onVaultChanged);
    unsubscribeCatalog = subscribeToLocalModelCatalogChanges(onCatalogChanged);
  });

  afterEach(() => {
    window.removeEventListener(VAULT_STATE_CHANGED_EVENT, onVaultChanged);
    unsubscribeCatalog();
  });

  it('locks, then registers the local runtimes again without their sealed keys', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await lockMasterPassword();

    const commands = commandOrder();
    expect(commands[0]).toBe('master_password_lock');
    expect(commands.filter((command) => command === 'llm_configure_provider')).toHaveLength(4);
    expect(invoke).toHaveBeenCalledWith(
      'llm_configure_provider',
      expect.objectContaining({ provider: 'lmstudio', apiKey: null }),
    );
    expect(onVaultChanged).toHaveBeenCalledOnce();
    expect(onCatalogChanged).toHaveBeenCalled();
  });

  it('announces nothing when the lock itself fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Failed to acquire lock'));

    await expect(lockMasterPassword()).rejects.toThrow('Failed to acquire lock');

    expect(commandOrder()).toEqual(['master_password_lock']);
    expect(onVaultChanged).not.toHaveBeenCalled();
  });

  it('unlocks, then registers the local runtimes with the keys now readable', async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === 'master_password_unlock' ? { success: true, message: 'ok' } : undefined,
    );

    await expect(unlockMasterPassword('Alpha-Beta-Unique-1')).resolves.toEqual({
      success: true,
      message: 'ok',
    });

    expect(commandOrder()[0]).toBe('master_password_unlock');
    expect(invoke).toHaveBeenCalledWith('llm_configure_provider', expect.anything());
    expect(onVaultChanged).toHaveBeenCalledOnce();
  });

  it('changes nothing when the password is wrong', async () => {
    vi.mocked(invoke).mockResolvedValue({ success: false, message: 'Invalid password' });

    await expect(unlockMasterPassword('Nonmatching-Phrase-9')).resolves.toEqual({
      success: false,
      message: 'Invalid password',
    });

    expect(commandOrder()).toEqual(['master_password_unlock']);
    expect(onVaultChanged).not.toHaveBeenCalled();
  });

  it('changes the password and then refreshes what the vault releases', async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === 'master_password_change' ? { success: true, message: 'ok' } : undefined,
    );

    await expect(
      changeMasterPassword('Alpha-Beta-Unique-1', 'Gamma-Delta-Other-7'),
    ).resolves.toEqual({ success: true, message: 'ok' });

    expect(invoke).toHaveBeenCalledWith('master_password_change', {
      currentPassword: 'Alpha-Beta-Unique-1',
      newPassword: 'Gamma-Delta-Other-7',
    });
    expect(commandOrder()[0]).toBe('master_password_change');
    expect(onVaultChanged).toHaveBeenCalledOnce();
  });

  it('announces nothing when the password change is refused', async () => {
    vi.mocked(invoke).mockResolvedValue({
      success: false,
      message: 'Current password is incorrect',
    });

    await expect(changeMasterPassword('wrong', 'Gamma-Delta-Other-7')).resolves.toEqual({
      success: false,
      message: 'Current password is incorrect',
    });

    expect(commandOrder()).toEqual(['master_password_change']);
    expect(onVaultChanged).not.toHaveBeenCalled();
  });

  it('removes the password and then registers the local runtimes with their keys', async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === 'master_password_remove' ? { success: true, message: 'ok' } : undefined,
    );

    await expect(removeMasterPassword('Alpha-Beta-Unique-1')).resolves.toEqual({
      success: true,
      message: 'ok',
    });

    expect(invoke).toHaveBeenCalledWith('master_password_remove', {
      password: 'Alpha-Beta-Unique-1',
    });
    expect(invoke).toHaveBeenCalledWith('llm_configure_provider', expect.anything());
    expect(onVaultChanged).toHaveBeenCalledOnce();
  });

  it('announces nothing when removal is refused', async () => {
    vi.mocked(invoke).mockResolvedValue({ success: false, message: 'Password is incorrect' });

    await removeMasterPassword('wrong');

    expect(commandOrder()).toEqual(['master_password_remove']);
    expect(onVaultChanged).not.toHaveBeenCalled();
  });

  it('still announces the change when a local runtime cannot be registered again', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'llm_configure_provider') throw new Error('runtime unreachable');
      return undefined;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await lockMasterPassword();

    expect(onVaultChanged).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

describe('master password rules', () => {
  const policy = { min_length: 12, min_character_classes: 3 };

  it('names the first rule a new password breaks', () => {
    expect(passwordRuleViolation('Tiny-1A', policy)).toEqual({
      rule: 'too_short',
      min_length: 12,
    });
    expect(passwordRuleViolation('onlylowercaseletters', policy)).toEqual({
      rule: 'too_few_character_classes',
      min_character_classes: 3,
    });
    expect(passwordRuleViolation('lowercase words 123', policy)).toEqual({
      rule: 'too_few_character_classes',
      min_character_classes: 3,
    });
    expect(passwordRuleViolation('Alpha-Beta-Unique-Phrase-9', policy)).toBeNull();
    expect(passwordRuleViolation('lowercase-words-123', policy)).toBeNull();
  });

  it('takes its numbers from the policy it is given', () => {
    const stricter = { min_length: 30, min_character_classes: 4 };

    expect(passwordRuleViolation('Alpha-Beta-Unique-Phrase-9', stricter)).toEqual({
      rule: 'too_short',
      min_length: 30,
    });
    expect(describePasswordPolicy(stricter)).toBe(
      'Use at least 30 characters, with at least 4 of these: a lowercase letter, an uppercase letter, a number, a symbol.',
    );
  });

  it('counts characters the way the native side does, not UTF-16 units', () => {
    const elevenCharacters = '\u{1F600}'.repeat(8) + 'aA1';

    expect(elevenCharacters.length).toBeGreaterThan(12);
    expect(passwordRuleViolation(elevenCharacters, policy)).toEqual({
      rule: 'too_short',
      min_length: 12,
    });
  });

  it('explains a refusal in plain words, whichever side refused', () => {
    expect(describePasswordRuleViolation({ rule: 'too_short', min_length: 12 })).toBe(
      'Use at least 12 characters.',
    );
    expect(
      refusalMessage({
        success: false,
        message: 'ignored when a rule is named',
        violation: { rule: 'too_few_character_classes', min_character_classes: 3 },
      }),
    ).toBe('Use at least 3 of these: a lowercase letter, an uppercase letter, a number, a symbol.');
    expect(refusalMessage({ success: false, message: 'Current password is incorrect' })).toBe(
      'Current password is incorrect',
    );
  });

  it('sets the password through the native command', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({ success: true, message: 'ok' });

    await expect(setUpMasterPassword('Alpha-Beta-Unique-Phrase-9')).resolves.toEqual({
      success: true,
      message: 'ok',
    });

    expect(invoke).toHaveBeenCalledWith('master_password_setup', {
      password: 'Alpha-Beta-Unique-Phrase-9',
    });
  });

  it('keeps the browser fixture on the numbers the native side enforces', () => {
    const desktopRoot = resolve(__dirname, '../../../..');
    const native = readFileSync(
      resolve(desktopRoot, 'src-tauri/src/sys/security/master_password.rs'),
      'utf8',
    );
    const fixture = readFileSync(resolve(desktopRoot, 'src/lib/tauri-mock.ts'), 'utf8');

    const minLength = native.match(/const MIN_PASSWORD_LENGTH: usize = (\d+);/);
    const minClasses = native.match(/const MIN_PASSWORD_CHARACTER_CLASSES: u32 = (\d+);/);
    const fixturePolicy = fixture.match(
      /password_policy: \{ min_length: (\d+), min_character_classes: (\d+) \}/,
    );

    expect(minLength).not.toBeNull();
    expect(minClasses).not.toBeNull();
    expect(fixturePolicy).not.toBeNull();
    expect(fixturePolicy?.[1]).toBe(minLength?.[1]);
    expect(fixturePolicy?.[2]).toBe(minClasses?.[1]);
  });
});

describe('what the interface says a master password protects', () => {
  it('matches the families the native vault owns', () => {
    const vault = readFileSync(
      resolve(__dirname, '../../../../src-tauri/src/sys/security/vault_credentials.rs'),
      'utf8',
    );

    const owned = vault.match(/const VAULT_OWNED_SETTING_PREFIXES: \[&str; \d+\] = \[([^\]]*)\];/);
    const released = vault.match(/const RELEASED_SETTING_PREFIXES: \[&str; \d+\] = \[([^\]]*)\];/);

    expect(owned?.[1]).toBe('"api_key_"');
    expect(released?.[1]).toBe('"mcp_oauth_config_"');
    expect(MASTER_PASSWORD_SCOPE).toContain('seals your saved provider API keys and nothing else');
    expect(MASTER_PASSWORD_SCOPE).toContain('connector app credentials');
    expect(MASTER_PASSWORD_SCOPE).toContain('stay under this device');
  });
});

describe('an unlock that left saved keys behind', () => {
  it('names the providers and says nothing was removed', () => {
    const told = describeKeysNotUpgraded({
      success: true,
      message: 'App unlocked successfully',
      keys_not_upgraded: ['openai', 'anthropic'],
    });

    expect(told).toContain('the saved keys for openai, anthropic could not be read');
    expect(told).toContain('nothing was removed');
    expect(told).toContain('Models & Keys');
  });

  it('has nothing to say when every key was upgraded', () => {
    expect(describeKeysNotUpgraded({ success: true, message: 'ok' })).toBeNull();
    expect(
      describeKeysNotUpgraded({ success: true, message: 'ok', keys_not_upgraded: [] }),
    ).toBeNull();
  });
});
