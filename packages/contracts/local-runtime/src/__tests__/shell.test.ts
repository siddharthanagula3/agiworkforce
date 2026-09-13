import { describe, expect, it } from 'vitest';
import {
  EMPTY_SHELL_POLICY,
  evaluateShellPolicy,
  findControlCharacter,
  normalizeShellPolicy,
  parseCommandLine,
  type ShellPolicy,
} from '../shell';

describe('parseCommandLine', () => {
  it('splits on whitespace', () => {
    expect(parseCommandLine('git status --short')).toEqual(['git', 'status', '--short']);
  });

  it('keeps quoted arguments whole', () => {
    expect(parseCommandLine('git commit -m "one two"')).toEqual(['git', 'commit', '-m', 'one two']);
    expect(parseCommandLine("ls 'my folder'")).toEqual(['ls', 'my folder']);
  });

  it('treats a backslash as an escape outside quotes', () => {
    expect(parseCommandLine('ls my\\ folder')).toEqual(['ls', 'my folder']);
  });

  it('keeps an empty quoted argument', () => {
    expect(parseCommandLine('node -e ""')).toEqual(['node', '-e', '']);
  });

  it('refuses an unterminated quote rather than guessing', () => {
    expect(parseCommandLine('git commit -m "oops')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parseCommandLine('   ')).toBeNull();
  });
});

describe('findControlCharacter', () => {
  it('finds the characters that would chain or redirect', () => {
    expect(findControlCharacter('ls; rm -rf /')).toBe(';');
    expect(findControlCharacter('cat a | wc -l')).toBe('|');
    expect(findControlCharacter('echo $HOME')).toBe('$');
    expect(findControlCharacter('echo hi > out.txt')).toBe('>');
    expect(findControlCharacter('echo `id`')).toBe('`');
  });

  it('passes an ordinary command', () => {
    expect(findControlCharacter('pnpm --filter web test')).toBeNull();
  });

  it('ignores control characters inside quotes, which are arguments', () => {
    expect(findControlCharacter('git commit -m "fix; ship it"')).toBeNull();
    expect(findControlCharacter('node -e "console.log(1)"')).toBeNull();
    expect(findControlCharacter("grep 'a|b' file.txt")).toBeNull();
  });

  it('still finds one after a closing quote', () => {
    expect(findControlCharacter('git commit -m "fix" ; rm -rf /')).toBe(';');
  });

  it('ignores an escaped control character', () => {
    expect(findControlCharacter('echo a\\;b')).toBeNull();
  });
});

describe('evaluateShellPolicy', () => {
  const policy: ShellPolicy = { allow: ['git', 'pnpm'], deny: ['rm'] };

  it('allows a listed program', () => {
    expect(evaluateShellPolicy(policy, 'git status')).toMatchObject({
      decision: 'allow',
      program: 'git',
    });
  });

  it('denies a blocked program', () => {
    expect(evaluateShellPolicy(policy, 'rm -rf build')).toMatchObject({
      decision: 'deny',
      reason: 'denied-by-policy',
    });
  });

  it('asks for anything unlisted', () => {
    expect(evaluateShellPolicy(policy, 'make build')).toMatchObject({
      decision: 'ask',
      program: 'make',
    });
  });

  it('refuses privilege escalation even when the user allow-listed it', () => {
    expect(evaluateShellPolicy({ allow: ['sudo'], deny: [] }, 'sudo rm -rf /')).toMatchObject({
      decision: 'deny',
      reason: 'always-refused',
    });
  });

  it('matches on the program basename, not the path used to reach it', () => {
    expect(evaluateShellPolicy({ allow: [], deny: ['rm'] }, '/bin/rm file')).toMatchObject({
      decision: 'deny',
    });
    expect(evaluateShellPolicy({ allow: ['git'], deny: [] }, '/usr/bin/git log')).toMatchObject({
      decision: 'allow',
    });
  });

  it('denies wins over allow for the same program', () => {
    expect(
      evaluateShellPolicy({ allow: ['curl'], deny: ['curl'] }, 'curl example.com'),
    ).toMatchObject({ decision: 'deny' });
  });

  it('asks under the empty policy', () => {
    expect(evaluateShellPolicy(EMPTY_SHELL_POLICY, 'ls')).toMatchObject({ decision: 'ask' });
  });

  it('denies an unparseable command', () => {
    expect(evaluateShellPolicy(EMPTY_SHELL_POLICY, 'git commit -m "oops')).toMatchObject({
      decision: 'deny',
      reason: 'unparseable',
    });
  });
});

describe('normalizeShellPolicy', () => {
  it('lowercases, strips paths and extensions, and dedupes', () => {
    expect(
      normalizeShellPolicy({ allow: ['Git', 'C:\\tools\\git.exe', '/usr/bin/git', ''], deny: [] }),
    ).toEqual({ allow: ['git'], deny: [] });
  });
});
