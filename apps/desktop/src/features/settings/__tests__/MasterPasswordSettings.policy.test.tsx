import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { MasterPasswordSettings } from '../MasterPasswordSettings';
import { MASTER_PASSWORD_SCOPE } from '../masterPasswordScope';

interface VaultStub {
  configured?: boolean;
  unlocked?: boolean;
  needsMigration?: boolean;
  policy?: { min_length: number; min_character_classes: number };
  setup?: unknown;
  change?: unknown;
}

function stubVault(stub: VaultStub) {
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case 'master_password_get_status':
        return {
          is_configured: stub.configured ?? false,
          is_unlocked: stub.unlocked ?? false,
          last_changed: null,
          needs_migration: stub.needsMigration ?? false,
          password_policy: stub.policy ?? { min_length: 12, min_character_classes: 3 },
        };
      case 'master_password_setup':
        return stub.setup ?? { success: true, message: 'ok' };
      case 'master_password_change':
        return stub.change ?? { success: true, message: 'ok' };
      case 'master_password_migrate_credentials':
        return {
          api_keys_migrated: 2,
          rows_skipped_already_modern: 0,
          rows_skipped_undecryptable: 0,
        };
      default:
        return undefined;
    }
  });
}

function commands(): string[] {
  return vi.mocked(invoke).mock.calls.map(([command]) => String(command));
}

async function openSetup() {
  render(<MasterPasswordSettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set Up' }));
}

function typePassword(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('master password rules in settings', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  afterEach(() => cleanup());

  it('states the rule the native side reports, not a number of its own', async () => {
    stubVault({ policy: { min_length: 14, min_character_classes: 2 } });
    await openSetup();

    expect(
      screen.getByText(/Use at least 14 characters, with at least 2 of these/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/8 characters/)).not.toBeInTheDocument();
  });

  it('refuses a password that is too short before asking the vault', async () => {
    stubVault({});
    await openSetup();

    typePassword('Password', 'Short-1A');
    typePassword('Confirm Password', 'Short-1A');
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 12 characters.');
    expect(commands()).not.toContain('master_password_setup');
  });

  it('refuses a password of one kind of character before asking the vault', async () => {
    stubVault({});
    await openSetup();

    typePassword('Password', 'onlylowercaseletters');
    typePassword('Confirm Password', 'onlylowercaseletters');
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use at least 3 of these: a lowercase letter, an uppercase letter, a number, a symbol.',
    );
    expect(commands()).not.toContain('master_password_setup');
  });

  it('sets a password that meets the rule', async () => {
    stubVault({});
    await openSetup();

    typePassword('Password', 'Alpha-Beta-Unique-Phrase-9');
    typePassword('Confirm Password', 'Alpha-Beta-Unique-Phrase-9');
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('master_password_setup', {
        password: 'Alpha-Beta-Unique-Phrase-9',
      });
    });
  });

  it('shows a refusal from the native side in plain words', async () => {
    stubVault({
      policy: { min_length: 4, min_character_classes: 1 },
      setup: {
        success: false,
        message:
          'Use at least 3 of these: a lowercase letter, an uppercase letter, a number, a symbol.',
        violation: { rule: 'too_few_character_classes', min_character_classes: 3 },
      },
    });
    await openSetup();

    typePassword('Password', 'onlylowercaseletters');
    typePassword('Confirm Password', 'onlylowercaseletters');
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Use at least 3 of these: a lowercase letter');
    expect(alert).not.toHaveTextContent('Cryptographic');
    expect(commands()).toContain('master_password_setup');
  });

  it('holds a changed password to the same rule', async () => {
    stubVault({ configured: true, unlocked: true });
    render(<MasterPasswordSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));

    expect(screen.getByText(/Use at least 12 characters, with at least 3/)).toBeInTheDocument();
    typePassword('Current Password', 'Alpha-Beta-Unique-Phrase-9');
    typePassword('New Password', 'Short-1A');
    typePassword('Confirm New Password', 'Short-1A');
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 12 characters.');
    expect(commands()).not.toContain('master_password_change');
  });
});

describe('a master password the system dialog did not confirm', () => {
  const DECLINED = 'Setting a master password was not confirmed, so nothing was changed.';

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  afterEach(() => cleanup());

  it('keeps the setup form open and says nothing was set', async () => {
    stubVault({ setup: { success: false, message: DECLINED } });
    await openSetup();

    typePassword('Password', 'Alpha-Beta-Unique-Phrase-9');
    typePassword('Confirm Password', 'Alpha-Beta-Unique-Phrase-9');
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(DECLINED);
    expect(screen.getByRole('button', { name: 'Set Password' })).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
  });

  it('keeps the change form open and says nothing was changed', async () => {
    const declined = 'Changing the master password was not confirmed, so nothing was changed.';
    stubVault({
      configured: true,
      unlocked: true,
      change: { success: false, message: declined },
    });
    render(<MasterPasswordSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));

    typePassword('Current Password', 'Alpha-Beta-Unique-Phrase-9');
    typePassword('New Password', 'Gamma-Delta-Other-Phrase-7');
    typePassword('Confirm New Password', 'Gamma-Delta-Other-Phrase-7');
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(declined);
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
    expect(commands()).toContain('master_password_change');
  });
});

describe('what a master password protects', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  afterEach(() => cleanup());

  it('names provider keys only, and what keeps working while locked', async () => {
    stubVault({});
    render(<MasterPasswordSettings />);

    const scope = await screen.findByText(/seals your saved provider API keys and nothing else/);
    expect(scope).toHaveTextContent(MASTER_PASSWORD_SCOPE);
    expect(scope).toHaveTextContent('tool permissions stay under this device');
    expect(screen.queryByText(/connector app credentials are/)).not.toBeInTheDocument();
  });
});

describe('saved keys a master password does not protect yet', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  afterEach(() => cleanup());

  it('says so while locked and offers the unlock that comes first', async () => {
    stubVault({ configured: true, unlocked: false, needsMigration: true });
    render(<MasterPasswordSettings />);

    expect(await screen.findByText('Some saved keys are not protected yet')).toBeInTheDocument();
    expect(screen.getByText(/can still be used while locked\. Unlock to/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Migrate' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Unlock' }).length).toBeGreaterThan(0);
  });

  it('re-encrypts them with one command once unlocked', async () => {
    stubVault({ configured: true, unlocked: true, needsMigration: true });
    render(<MasterPasswordSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Migrate' }));
    expect(
      screen.getByText(
        /connector app credentials, MCP server credentials and tool permissions stay/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Re-encrypt keys' }));

    await waitFor(() => {
      expect(commands()).toContain('master_password_migrate_credentials');
    });
    expect(commands().filter((command) => command.includes('migration'))).toEqual([]);
  });

  it('shows nothing when every saved key is protected', async () => {
    stubVault({ configured: true, unlocked: true, needsMigration: false });
    render(<MasterPasswordSettings />);

    expect(await screen.findByText('Unlocked')).toBeInTheDocument();
    expect(screen.queryByText('Some saved keys are not protected yet')).not.toBeInTheDocument();
  });
});
