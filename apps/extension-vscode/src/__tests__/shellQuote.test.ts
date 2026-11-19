import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  shellExecutableForCurrentPlatform,
  shellQuoteForCurrentPlatform,
} from '../platform/workspaceFolders';

describe('shellQuoteForCurrentPlatform', () => {
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: p });
  }

  describe('POSIX (darwin / linux)', () => {
    it('wraps simple string in single quotes', () => {
      setPlatform('darwin');
      expect(shellQuoteForCurrentPlatform('hello world')).toBe(`'hello world'`);
    });

    it("escapes embedded single quote as '\\''", () => {
      setPlatform('linux');
      expect(shellQuoteForCurrentPlatform("it's a test")).toBe(`'it'\\''s a test'`);
    });

    it('preserves shell metacharacters inside single quotes (no expansion)', () => {
      setPlatform('darwin');
      expect(shellQuoteForCurrentPlatform('$(whoami) `id`')).toBe(`'$(whoami) \`id\`'`);
    });

    it('handles empty string', () => {
      setPlatform('linux');
      expect(shellQuoteForCurrentPlatform('')).toBe(`''`);
    });
  });

  describe('Windows', () => {
    it('wraps simple string in double quotes', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('hello world')).toBe('"hello world"');
    });

    it('strips backticks (PowerShell escape char)', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('test `whoami` end')).toBe('"test whoami end"');
    });

    it('strips $ to prevent variable expansion', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('cost is $5')).toBe('"cost is 5"');
    });

    it('escapes embedded double quote as ""', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('say "hi"')).toBe('"say ""hi"""');
    });

    it('handles empty string', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('')).toBe('""');
    });

    it('combination: backticks + dollars + quotes all neutralized', () => {
      setPlatform('win32');
      const result = shellQuoteForCurrentPlatform('`a` $b "c"');
      expect(result).not.toContain('`');
      expect(result).not.toContain('$');
      expect(result).toBe('"a b ""c"""');
    });
  });
});

describe('shellExecutableForCurrentPlatform', () => {
  const originalPlatform = process.platform;
  const env = vscode.env as { shell?: string };
  const originalShell = env.shell;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    env.shell = originalShell;
  });

  function setup(platform: NodeJS.Platform, shell: string | undefined) {
    Object.defineProperty(process, 'platform', { value: platform });
    env.shell = shell;
  }

  it.each([
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    '/usr/bin/pwsh',
  ])('invokes a quoted executable with the call operator under PowerShell %s', (shell) => {
    setup('win32', shell);
    expect(shellExecutableForCurrentPlatform('C:\\Tools\\agi.exe')).toBe('& "C:\\Tools\\agi.exe"');
  });

  it.each(['C:\\Windows\\System32\\cmd.exe', 'C:\\Program Files\\Git\\bin\\bash.exe', undefined])(
    'leaves the quoted executable alone under %s',
    (shell) => {
      setup('win32', shell);
      expect(shellExecutableForCurrentPlatform('C:\\Tools\\agi.exe')).toBe('"C:\\Tools\\agi.exe"');
    },
  );

  it('never adds the call operator on POSIX, even for a PowerShell shell', () => {
    setup('linux', '/usr/bin/pwsh');
    expect(shellExecutableForCurrentPlatform('/opt/agi')).toBe("'/opt/agi'");
  });
});
