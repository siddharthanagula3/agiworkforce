import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options: { defaultValue?: string }) => options?.defaultValue ?? '',
    i18n: { language: 'en' },
  }),
}));

import { AuthPasswordField } from '../AuthPasswordField';

const AUTH_DIR = path.resolve(__dirname, '..');

function authSources(directory: string = AUTH_DIR, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') authSources(full, collected);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue;
    collected.push(full);
  }
  return collected;
}

const SOURCES = authSources();

function relative(file: string): string {
  return path.relative(AUTH_DIR, file).split(path.sep).join('/');
}

/** A value the user typed as a credential, under every name this surface gives it. */
const SECRET_IDENTIFIERS =
  /\b(password|newPassword|currentPassword|code|backupCode|otp|secret|token)\b/;

const LOG_CALL = /\b(?:console\.(?:log|info|warn|error|debug|trace)|logger\.[a-z]+)\s*\(/g;

describe('what the sign-in screens do with a credential', () => {
  it('reads a real directory, so an empty sweep cannot pass', () => {
    expect(SOURCES.length).toBeGreaterThan(20);
  });

  it('never hands a typed credential to a log call', () => {
    const offenders: string[] = [];

    for (const file of SOURCES) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(LOG_CALL)) {
        const start = (match.index ?? 0) + match[0].length;
        let depth = 1;
        let end = start;
        while (end < source.length && depth > 0) {
          if (source[end] === '(') depth += 1;
          if (source[end] === ')') depth -= 1;
          end += 1;
        }
        const args = source.slice(start, end - 1);
        if (SECRET_IDENTIFIERS.test(args)) offenders.push(`${relative(file)}: ${args.trim()}`);
      }
    }

    expect(offenders, `a credential reaches a log call:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps no password at rest, so there is no hashing choice for this product to get wrong', () => {
    const migrations = path.resolve(AUTH_DIR, '../../db/neon');
    const columns: string[] = [];

    for (const file of readdirSync(migrations)) {
      if (!file.endsWith('.sql')) continue;
      const sql = readFileSync(path.join(migrations, file), 'utf8').replace(/--[^\n]*/g, '');
      for (const match of sql.matchAll(
        /^\s*("?[a-z_]*password[a-z_]*"?)\s+(?:text|varchar|bytea|citext)/gim,
      )) {
        columns.push(`${file}: ${match[1]}`);
      }
    }

    expect(columns.length, `a password column exists:\n${columns.join('\n')}`).toBe(0);
  });

  it('never blocks paste, so a password manager and a copied code both work', () => {
    const offenders = SOURCES.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /onPaste|onCopy|onCut|onContextMenu/.test(source);
    }).map(relative);

    expect(offenders, `paste is intercepted in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('asks the browser for the right credential on every field that takes one', () => {
    const expected: Readonly<Record<string, string>> = {
      'AuthPasswordStep.tsx': 'autoComplete="current-password"',
      'AuthNewPasswordStep.tsx': 'autoComplete="new-password"',
      'AuthCodeStep.tsx': 'autoComplete="one-time-code"',
      'AuthSecondFactorStep.tsx': 'autoComplete="one-time-code"',
    };

    for (const [file, token] of Object.entries(expected)) {
      const source = readFileSync(path.join(AUTH_DIR, file), 'utf8');
      expect(source, `${file} does not ask for ${token}`).toContain(token);
    }
  });

  it('offers the discoverable credential on the address field where the browser has one', () => {
    const emailStep = readFileSync(path.join(AUTH_DIR, 'AuthEmailStep.tsx'), 'utf8');

    expect(emailStep).toContain("'email webauthn'");
    expect(emailStep).toContain('browserSupportsPasskeys()');
  });

  it('keeps every credential field masked until the person asks to see it', () => {
    const revealed = SOURCES.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        /type="password"/.test(source) || /type=\{revealed \? 'text' : 'password'\}/.test(source)
      );
    }).map(relative);

    expect(revealed).toContain('AuthPasswordField.tsx');
  });
});

describe('the password field itself', () => {
  function renderField(props: Partial<Parameters<typeof AuthPasswordField>[0]> = {}) {
    return render(
      <AuthPasswordField
        label="Password"
        value=""
        autoComplete="current-password"
        onChange={() => undefined}
        {...props}
      />,
    );
  }

  it('says nothing about Caps Lock until the key is actually down', () => {
    renderField();

    expect(screen.queryByText('Caps Lock is on')).toBeNull();
  });

  it('warns while Caps Lock is on, so a rejected password is not a mystery', () => {
    renderField();
    const field = screen.getByLabelText('Password');

    fireEvent.keyDown(field, { key: 'a', modifierCapsLock: true });

    const hint = screen.getByText('Caps Lock is on');
    expect(hint).toHaveAttribute('role', 'status');
    expect(field).toHaveAttribute('aria-describedby', hint.id);
  });

  it('takes the warning back when the key goes off', () => {
    renderField();
    const field = screen.getByLabelText('Password');

    fireEvent.keyDown(field, { key: 'a', modifierCapsLock: true });
    fireEvent.keyUp(field, { key: 'CapsLock', modifierCapsLock: false });

    expect(screen.queryByText('Caps Lock is on')).toBeNull();
  });

  it('drops the warning once the password is visible, where the case can be read', () => {
    renderField();
    const field = screen.getByLabelText('Password');
    fireEvent.keyDown(field, { key: 'a', modifierCapsLock: true });

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.queryByText('Caps Lock is on')).toBeNull();
  });

  it('keeps the error, not the hint, as the thing marked invalid', () => {
    renderField({ error: 'That password was not accepted' });
    const field = screen.getByLabelText('Password');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('That password was not accepted');
  });
});
