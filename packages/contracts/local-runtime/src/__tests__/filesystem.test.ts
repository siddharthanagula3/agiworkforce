import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GIT_METADATA_ENTRY,
  HOOK_MANAGER_PATHS,
  PROJECT_CONFIG_PATHS,
  PROTECTED_WORKSPACE_PATHS,
  foldedFileName,
  isCredentialPath,
  isProtectedWorkspacePath,
} from '../filesystem';

/**
 * Every code point an APFS volume that ignores case reads as ASCII letters,
 * found by asking one: each of U+0080 to U+1FFFF was looked up against every
 * name of one to three lower-case letters. Lower case alone folds only the
 * Kelvin sign among them.
 */
const VOLUME_FOLDS: ReadonlyArray<[spelled: string, opens: string]> = [
  ['\u017F', 's'],
  ['\u212A', 'k'],
  ['\u00DF', 'ss'],
  ['\u1E9E', 'ss'],
  ['\uFB00', 'ff'],
  ['\uFB01', 'fi'],
  ['\uFB02', 'fl'],
  ['\uFB03', 'ffi'],
  ['\uFB04', 'ffl'],
  ['\uFB05', 'st'],
  ['\uFB06', 'st'],
];

describe('foldedFileName', () => {
  it.each(VOLUME_FOLDS)('reads %s as %s, as the volume does', (spelled, opens) => {
    expect(foldedFileName(`p${spelled}q`)).toBe(`p${opens}q`);
  });

  it('folds what lower case leaves alone', () => {
    const lowered = VOLUME_FOLDS.filter(([spelled, opens]) => spelled.toLowerCase() === opens);

    expect(lowered).toEqual([['\u212A', 'k']]);
  });

  it('reads either case, either normal form and a compatibility form as one name', () => {
    expect(foldedFileName('.MCP.Json')).toBe('.mcp.json');
    expect(foldedFileName('caf\u00E9')).toBe(foldedFileName('cafe\u0301'));
    expect(foldedFileName('\uFF4Dcp.json')).toBe('mcp.json');
    expect(foldedFileName('.g\u0131t')).toBe('.git');
  });

  it('drops the characters an HFS+ volume skips when it compares names', () => {
    expect(foldedFileName('.mcp\u200D.json')).toBe('.mcp.json');
    expect(foldedFileName('\uFEFF.git\u200E')).toBe('.git');
    expect(foldedFileName('.hus\u202Eky')).toBe('.husky');
    expect(isProtectedWorkspacePath('.mcp\u200C.json')).toBe(true);
    expect(isCredentialPath('.s\u200Dsh/id_ed25519')).toBe(true);
  });

  it('settles: folding a folded name changes nothing', () => {
    for (const [spelled] of VOLUME_FOLDS) {
      const once = foldedFileName(`.${spelled}.X`);
      expect(foldedFileName(once)).toBe(once);
    }
  });
});

describe('isCredentialPath', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    'apps/web/.env.staging',
    '.ENV.Development',
    '.envrc',
    'services/api/.envrc',
    'production.env',
    'deploy/staging.ENV',
    '.pypirc',
    '.yarnrc.yml',
    '.docker/config.json',
    '/Users/me/.docker/config.json',
    '.kube/config',
    '.git/config',
    'vendor/lib/.git/config',
    '.env.example.local',
    '.env.production.backup',
    '.npmrc',
    '.netrc',
    '.pgpass',
    '.git-credentials',
    'credentials',
    '.aws/credentials',
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    'id_dsa',
    'id_ed25519_sk',
    'keys/id_rsa_github',
    'keys/id_ed25519-work',
    'tls/server.pem',
    'tls/server.key',
    'tls/bundle.p12',
    'tls/bundle.PFX',
    '.ssh/config',
    '.ssh/known_hosts',
    'home/me/.ssh/authorized_keys',
    '/Users/me/project/.ssh/id_rsa.pub',
    'C:\\Users\\me\\project\\.env.local',
  ])('refuses %s', (candidate) => {
    expect(isCredentialPath(candidate)).toBe(true);
  });

  it.each([
    'README.md',
    'src/index.ts',
    'src/env.ts',
    'env.example',
    'src/environment.ts',
    'config.json',
    'docker/config.json',
    'kube/config',
    'src/config',
    '.git/HEAD',
    '.yarnrc',
    '.env.example',
    '.env.sample',
    'apps/web/.env.local.template',
    'src/id_generator.ts',
    'id_rsa.pub',
    'keys/id_ed25519.pub',
    'src/credentials.ts',
    'docs/pem-format.md',
    'src/keyboard.ts',
    '.sshconfig',
    '',
  ])('leaves %s readable', (candidate) => {
    expect(isCredentialPath(candidate)).toBe(false);
  });

  // The names a case-folding volume opens the same file for.
  it.each([
    '.\u1E9Eh/id_ed25519',
    '.\u00DFh/config',
    '.\u017F\u017Fh/known_hosts',
    '.pgpa\u00DF',
    '.pgpa\u017Fs',
    'deploy/id_r\u017Fa',
    'certs/server.\u212Aey',
    'cert\u017F/server.KEY',
    '.docker/con\uFB01g.json',
    '.\u212Aube/config',
    '.git-credential\u017F',
    '.env.\u017Ftaging',
    'config/.\uFF45nv',
  ])('refuses %s, which opens a credential file', (candidate) => {
    expect(isCredentialPath(candidate)).toBe(true);
  });

  it('reads a template and a public key from the name as written, so a look-alike is not let through', () => {
    expect(isCredentialPath('.env.example')).toBe(false);
    expect(isCredentialPath('.ENV.EXAMPLE')).toBe(false);
    expect(isCredentialPath('.env.\uFF45xample')).toBe(true);
    expect(isCredentialPath('id_rsa.pub')).toBe(false);
    expect(isCredentialPath('id_rsa.\uFF50ub')).toBe(true);
  });
});

describe('isProtectedWorkspacePath', () => {
  it('covers git metadata, every project config path and every hook manager path, and everything beneath them', () => {
    for (const entry of [GIT_METADATA_ENTRY, ...PROJECT_CONFIG_PATHS, ...HOOK_MANAGER_PATHS]) {
      expect(isProtectedWorkspacePath(entry)).toBe(true);
      expect(isProtectedWorkspacePath(`${entry}/child`)).toBe(true);
      expect(isProtectedWorkspacePath(`packages/app/${entry}`)).toBe(true);
      expect(isProtectedWorkspacePath(entry.toUpperCase())).toBe(true);
    }
  });

  it.each([
    '.git/hooks/pre-commit',
    '.git',
    'vendor/lib/.git/config',
    '.agiworkforce/hooks.json',
    '.mcp.json',
    'mcp.json',
    '.vscode/mcp.json',
    '.vscode\\mcp.json',
    '.husky/pre-commit',
    'packages/app/.githooks/pre-push',
    'lefthook.yml',
    'lefthook-local.yml',
    '.config/lefthook.toml',
    'packages/app/.lefthook-local.jsonc',
    '.huskyrc.json',
    'husky.config.js',
    '.overcommit.yml',
    '.git-hooks/pre_commit/check.rb',
    '.pre-commit-config.yaml',
  ])('protects %s', (candidate) => {
    expect(isProtectedWorkspacePath(candidate)).toBe(true);
  });

  it.each([
    '',
    '.gitignore',
    '.github/workflows/ci.yml',
    '.gitmodules',
    '.vscode/settings.json',
    'src/git.ts',
    'docs/mcp.json.md',
    'agiworkforce/readme.md',
    'husky/readme.md',
    'docs/lefthook.yml.md',
    '.config/nextest.toml',
    '.simple-git-hooks.json',
  ])('leaves %s writable', (candidate) => {
    expect(isProtectedWorkspacePath(candidate)).toBe(false);
  });

  // `.mcp.j\u017Fon` was written and read back as `.mcp.json`. The Rust list
  // lowers case only, so these are held here until it folds the same way.
  it.each([
    '.mcp.j\u017Fon',
    'mcp.j\u017Fon',
    'packages/app/.MCP.J\u017FON',
    '.githook\u017F/pre-commit',
    '.hu\u017F\u212Ay/pre-commit',
    '.hus\u212Ay/pre-push',
    'lefthoo\u212A.yml',
    '.lefthoo\u212A.yaml',
    '.pre-commit-con\uFB01g.yaml',
    '.v\u017Fcode/mcp.json',
    '.vscode/mcp.j\u017Fon',
    '.agiwor\u212Aforce/hooks.json',
    '\uFF0Egit/config',
    '.g\u0131t/hooks/pre-commit',
  ])('protects %s, which a case-folding volume opens as a protected name', (candidate) => {
    expect(isProtectedWorkspacePath(candidate)).toBe(true);
  });

  it('folds every code point the volume folds, in every protected and credential name that holds its letters', () => {
    const names = [...PROTECTED_WORKSPACE_PATHS, '.ssh', '.pgpass', '.git-credentials', 'id_rsa'];
    let checked = 0;
    for (const name of names) {
      for (const [spelled, opens] of VOLUME_FOLDS) {
        if (!name.includes(opens)) continue;
        const disguised = name.replace(opens, spelled);
        checked += 1;
        expect(
          isProtectedWorkspacePath(disguised) || isCredentialPath(disguised),
          `${disguised} for ${name}`,
        ).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('does not take a look-alike separator for a separator', () => {
    expect(isProtectedWorkspacePath('notes\uFF0F.git')).toBe(false);
    expect(isProtectedWorkspacePath('src/git\u017F.ts')).toBe(false);
  });
});

describe('the protected list and the sandbox-policy crate', () => {
  const source = readFileSync(
    new URL(
      '../../../../../crates/agiworkforce-sandbox-policy/src/protected_paths.rs',
      import.meta.url,
    ),
    'utf8',
  );
  const listed = (name: string): string[] => {
    const start = source.indexOf(`pub const ${name}:`);
    expect(start, `${name} is not in the crate's list`).toBeGreaterThan(-1);
    const assigned = source.indexOf('=', start);
    const value = source.slice(assigned, source.indexOf(';', assigned));
    return [...value.matchAll(/"([^"\\]*)"/g)].map((match) => match[1] ?? '');
  };

  it('names the same entries as the one Rust definition, in the same order', () => {
    expect([GIT_METADATA_ENTRY]).toEqual(listed('GIT_METADATA_ENTRY'));
    expect([...PROJECT_CONFIG_PATHS]).toEqual(listed('PROJECT_CONFIG_PATHS'));
    expect([...HOOK_MANAGER_PATHS]).toEqual(listed('HOOK_MANAGER_PATHS'));
    expect([...PROTECTED_WORKSPACE_PATHS]).toEqual([
      ...listed('GIT_METADATA_ENTRY'),
      ...listed('PROJECT_CONFIG_PATHS'),
      ...listed('HOOK_MANAGER_PATHS'),
    ]);
    expect(PROTECTED_WORKSPACE_PATHS).toHaveLength(47);
  });

  /** A Rust string literal with its `\\u{...}` escapes as the text it stands for. */
  const rustText = (literal: string): string =>
    literal
      .replace(/\\u\{([0-9a-fA-F]+)\}/gu, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/\\(.)/gu, '$1');
  const spellingsIn = (block: string): string[] =>
    [...block.matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((match) => rustText(match[1] ?? ''));

  it('gives the answer the crate own test gives for every folded spelling it lists', () => {
    const test = source.slice(
      source.indexOf('fn a_name_the_filesystem_reads_as_a_protected_one_is_protected()'),
      source.indexOf('fn ordinary_project_files_are_not_protected()'),
    );
    const [protectedBlock, plainBlock] = test.split('for spelling in [').slice(1);
    const held = spellingsIn((protectedBlock ?? '').split(']')[0] ?? '');
    const plain = spellingsIn((plainBlock ?? '').split(']')[0] ?? '');

    expect(held.length).toBeGreaterThanOrEqual(11);
    expect(plain.length).toBeGreaterThanOrEqual(3);
    for (const spelling of held) expect(isProtectedWorkspacePath(spelling), spelling).toBe(true);
    for (const spelling of plain) expect(isProtectedWorkspacePath(spelling), spelling).toBe(false);
  });

  it('folds every character the crate folds, the way the crate folds it', () => {
    const fold = source.slice(
      source.indexOf('fn folded('),
      source.indexOf('fn names_a_protected_entry('),
    );
    const ranges = (block: string): Array<[number, number]> =>
      [...block.matchAll(/'\\u\{([0-9a-f]+)\}'(?:\.\.='\\u\{([0-9a-f]+)\}')?/gu)].map((match) => [
        parseInt(match[1] ?? '', 16),
        parseInt(match[2] ?? match[1] ?? '', 16),
      ]);
    const fullwidth = ranges(fold.slice(0, fold.indexOf('fn ignored_by_hfs(')));
    const ignored = ranges(fold.slice(fold.indexOf('fn ignored_by_hfs(')));
    const offset = Number(/const FULLWIDTH_OFFSET: u32 = (0x[0-9a-f]+);/u.exec(source)?.[1]);

    expect(fold).toContain('unfolded.to_uppercase().to_lowercase()');
    expect(fullwidth).toEqual([[0xff01, 0xff5e]]);
    expect(ignored).toHaveLength(4);
    expect(offset).toBe(0xfee0);
    for (const [first, last] of fullwidth) {
      for (let code = first; code <= last; code += 1) {
        const ascii = String.fromCodePoint(code - offset);
        expect(foldedFileName(String.fromCodePoint(code)), code.toString(16)).toBe(
          ascii.toUpperCase().toLowerCase(),
        );
      }
    }
    for (const [first, last] of ignored) {
      for (let code = first; code <= last; code += 1) {
        expect(foldedFileName(`a${String.fromCodePoint(code)}b`), code.toString(16)).toBe('ab');
      }
    }
  });

  // The capital sharp s takes a second round of case mapping; the crate
  // repeats its fold until it settles too. This side still folds more than
  // the crate in one respect: compatibility forms other than the fullwidth
  // ones, which are refused here where the crate would allow.
  it('folds the capital sharp s, which one round of case mapping leaves as a sharp s', () => {
    expect('\u1E9E'.toUpperCase().toLowerCase()).toBe('\u00DF');
    expect(foldedFileName('.\u1E9Eh')).toBe('.ssh');
  });

  it('matches every entry the Rust list holds, so neither side protects a name the other leaves out', () => {
    for (const entry of [
      ...listed('GIT_METADATA_ENTRY'),
      ...listed('PROJECT_CONFIG_PATHS'),
      ...listed('HOOK_MANAGER_PATHS'),
    ]) {
      expect(isProtectedWorkspacePath(entry), entry).toBe(true);
      expect(isProtectedWorkspacePath(`nested/${entry.toUpperCase()}/inner`), entry).toBe(true);
    }
  });
});
