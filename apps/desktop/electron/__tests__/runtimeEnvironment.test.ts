import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUARD_LIFTING_ENVIRONMENT, withoutGuardLifting } from '../runtime/runtimeEnvironment';

const CLI_SOURCE = path.resolve(__dirname, '../../../cli/src');
const CRATES_SOURCE = path.resolve(__dirname, '../../../../crates');

function rustSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return rustSources(entryPath);
    return entry.name.endsWith('.rs') ? [entryPath] : [];
  });
}

const sources = [...rustSources(CLI_SOURCE), ...rustSources(CRATES_SOURCE)].map((file) => ({
  file,
  text: readFileSync(file, 'utf8'),
}));

describe('withoutGuardLifting', () => {
  it('drops every variable that turns the CLI sandbox or a CLI guard off, and keeps the rest', () => {
    const cleaned = withoutGuardLifting({
      PATH: '/usr/bin',
      HOME: '/Users/qa',
      AGIWORKFORCE_NO_SANDBOX: '1',
      AGIWORKFORCE_SANDBOX_HOOKS: '0',
      AGIWORKFORCE_SANDBOX_MCP: '0',
      AGI_POWERSHELL_ALLOW_UNSAFE: '1',
      AGI_A2A_ALLOW_PRIVATE: '1',
      AGI_A2A_ALLOW_FILE_READS: '1',
      AGIWORKFORCE_NO_KEYRING: '1',
      AGIWORKFORCE_VOICE_ALLOW_CLOUD: '1',
      AGIWORKFORCE_SANDBOX_SCRUB_ENV: '1',
      AGIWORKFORCE_HOME: '/Users/qa/.agi',
    });

    expect(cleaned).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/qa',
      AGIWORKFORCE_SANDBOX_SCRUB_ENV: '1',
      AGIWORKFORCE_HOME: '/Users/qa/.agi',
    });
  });

  it('drops one whatever its value, since the CLI only asks whether it is set', () => {
    expect(withoutGuardLifting({ AGIWORKFORCE_NO_SANDBOX: '' })).toEqual({});
    expect(withoutGuardLifting({ AGIWORKFORCE_NO_SANDBOX: '0' })).toEqual({});
  });

  it('drops one spelled in another case, which Windows reads as the same variable', () => {
    expect(withoutGuardLifting({ agiworkforce_no_sandbox: '1', Path: 'C:\\bin' })).toEqual({
      Path: 'C:\\bin',
    });
  });

  // The names belong to the CLI. One it renamed would be passed on again under
  // its new name while this list went on removing a name nothing reads.
  it.each(GUARD_LIFTING_ENVIRONMENT)('names %s as the CLI source still spells it', (name) => {
    const readers = sources.filter(({ text }) => text.includes(`"${name}"`));

    expect(readers).not.toEqual([]);
  });

  /**
   * Names that read as if they loosened something and do not: each was opened
   * at the source. A name the CLI gains that reads that way belongs here, with
   * its reason, or in the list above.
   */
  const READ_AND_KEPT: Record<string, string> = {
    AGIWORKFORCE_SANDBOX_SCRUB_ENV: 'turns environment scrubbing on, which tightens the sandbox',
    AGIWORKFORCE_SANDBOX_FILTER_ENV:
      'turns on keeping credential variables out of a sandboxed command, which tightens it',
    AGIWORKFORCE_SANDBOX_PASS_ENV:
      'names credentials that filter still passes; without the filter every variable passes anyway',
    AGIWORKFORCE_NO_UPDATE_CHECK: 'stops the CLI asking whether a newer release exists',
    AGI_SANDBOX_ENV_REGRESSION_SENTINEL: 'a value a CLI regression test plants and looks for',
    AGI_SANDBOX_SCRUB_REGRESSION_CHILD: 'marks the child run of that same CLI regression test',
    AGIWORKFORCE_NO_TUI: 'chooses plain output over the full-screen interface',
    AGIWORKFORCE_TRUST_ACTOR: 'the name written beside a trust record, read before USER',
    AGIWORKFORCE_TRUST_MACHINE: 'the machine written beside a trust record, read before HOSTNAME',
  };
  const LOOSENS = /ALLOW|UNSAFE|NO_|DISABLE|SKIP|INSECURE|TRUST|SANDBOX|BYPASS|DANGER/u;

  it('has an answer for every CLI variable whose name reads as lifting a check', () => {
    const named = new Set(
      sources.flatMap(({ text }) =>
        [...text.matchAll(/"((?:AGI|AGIWORKFORCE)_[A-Z0-9_]+)"/gu)].map((match) => match[1] ?? ''),
      ),
    );
    const suspect = [...named].filter((name) => LOOSENS.test(name)).sort();

    expect(named.size).toBeGreaterThan(25);
    expect(suspect).toEqual([...GUARD_LIFTING_ENVIRONMENT, ...Object.keys(READ_AND_KEPT)].sort());
  });
});
