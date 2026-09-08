import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL,
  PLUGIN_UPLOAD_MAX_MEMBERS,
  UPLOAD_EMPTY_MESSAGE,
  UPLOAD_EXPANDS_TOO_FAR_MESSAGE,
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
  UPLOAD_NO_PLUGIN_MESSAGE,
  UPLOAD_NO_SKILLS_MESSAGE,
  UPLOAD_TOO_MANY_MEMBERS_MESSAGE,
} from '../constants';
import { PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES } from '@agiworkforce/cloud-contracts';
import {
  PluginArchiveError,
  commonRootPrefix,
  pluginKeyFrom,
  readPluginArchive,
  unsafeArchivePath,
} from '../archive';
import { parseSkillFile } from '../skill-files';

const SYMLINK_MODE = 0o120777;
const UPLOAD_NAME = 'my-plugin';

function skillFile(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}

async function zipOf(
  files: Record<string, string | Uint8Array>,
  options: Record<string, JSZip.JSZipFileOptions> = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content, options[path]);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', platform: 'UNIX' });
}

function rewriteStoredPath(archive: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('a rewritten path must keep its byte length');
  const encoder = new TextEncoder();
  const needle = encoder.encode(from);
  const replacement = encoder.encode(to);
  for (let index = 0; index + needle.length <= archive.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (archive[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) archive.set(replacement, index);
  }
  return archive;
}

async function rejectionOf(archive: Uint8Array): Promise<PluginArchiveError> {
  try {
    await readPluginArchive(archive, UPLOAD_NAME);
  } catch (error) {
    if (error instanceof PluginArchiveError) return error;
    throw error;
  }
  throw new Error('the archive was accepted');
}

describe('unsafeArchivePath', () => {
  it.each([
    ['../escape/SKILL.md'],
    ['skills/../../etc/passwd'],
    ['/etc/passwd'],
    ['C:/windows/system32'],
    ['skills\\a\\SKILL.md'],
    ['./skills/a/SKILL.md'],
    [''],
    [`${'a'.repeat(401)}`],
  ])('refuses %s', (path) => {
    expect(unsafeArchivePath(path)).toBe(true);
  });

  it('accepts an ordinary relative path', () => {
    expect(unsafeArchivePath('skills/a/SKILL.md')).toBe(false);
  });
});

describe('pluginKeyFrom', () => {
  it('slugs a display name into the key shape the entries table demands', () => {
    expect(pluginKeyFrom('My Plugin')).toBe('my-plugin');
    expect(pluginKeyFrom('Team.Pack_2')).toBe('team.pack_2');
  });

  it('returns null when nothing usable survives', () => {
    expect(pluginKeyFrom('   ')).toBeNull();
    expect(pluginKeyFrom('!!!')).toBeNull();
  });
});

describe('commonRootPrefix', () => {
  it('strips a single wrapper directory', () => {
    expect(commonRootPrefix(['pack/skills/a/SKILL.md', 'pack/.claude-plugin/plugin.json'])).toBe(
      'pack/',
    );
  });

  it('keeps a plugin whose own directories are already at the root', () => {
    expect(commonRootPrefix(['skills/a/SKILL.md', 'skills/b/SKILL.md'])).toBe('');
    expect(commonRootPrefix(['.claude-plugin/plugin.json'])).toBe('');
  });

  it('keeps everything when the members share no single root', () => {
    expect(commonRootPrefix(['one/skills/a/SKILL.md', 'two/skills/b/SKILL.md'])).toBe('');
  });
});

describe('readPluginArchive rejections', () => {
  it('refuses bytes that are not a zip', async () => {
    const error = await rejectionOf(new TextEncoder().encode('not a zip at all'));
    expect(error.message).toBe(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  });

  it('refuses an empty archive', async () => {
    const error = await rejectionOf(await zipOf({}));
    expect(error.message).toBe(UPLOAD_EMPTY_MESSAGE);
  });

  it('yields no member above the archive root when the central directory names one', async () => {
    const archive = rewriteStoredPath(
      await zipOf({ 'aa/outside/SKILL.md': skillFile('a', 'd', 'b') }),
      'aa/outside/SKILL.md',
      '../outside/SKILL.md',
    );
    const loaded = await JSZip.loadAsync(archive);
    const paths: string[] = [];
    loaded.forEach((path) => paths.push(path));
    expect(paths).not.toContain('../outside/SKILL.md');
    expect(paths.every((path) => !unsafeArchivePath(path) || path.endsWith('/'))).toBe(true);
    const error = await rejectionOf(archive);
    expect(error.message).toBe(UPLOAD_NO_PLUGIN_MESSAGE);
  });

  it('refuses an absolute path', async () => {
    const archive = rewriteStoredPath(
      await zipOf({ 'aetc/passwd.md': skillFile('a', 'd', 'b') }),
      'aetc/passwd.md',
      '/etc/passwd.md',
    );
    const error = await rejectionOf(archive);
    expect(error.message).toContain('is not a safe path');
  });

  it('refuses a symbolic link member', async () => {
    const error = await rejectionOf(
      await zipOf(
        {
          'skills/a/SKILL.md': skillFile('a', 'd', 'b'),
          'link.md': '/etc/passwd',
        },
        { 'link.md': { unixPermissions: SYMLINK_MODE } },
      ),
    );
    expect(error.message).toContain('is a symbolic link');
  });

  it('refuses a member larger than the manifest ceiling', async () => {
    const error = await rejectionOf(
      await zipOf({ 'skills/a/SKILL.md': 'x'.repeat(PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES + 1) }),
    );
    expect(error.message).toContain(`larger than ${PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES} bytes`);
  });

  it('refuses an archive that expands past the total ceiling', async () => {
    const member = 'x'.repeat(PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES);
    const files: Record<string, string> = {};
    for (let index = 0; index < 11; index += 1) files[`skills/s${index}/SKILL.md`] = member;
    const error = await rejectionOf(await zipOf(files));
    expect(error.message).toBe(UPLOAD_EXPANDS_TOO_FAR_MESSAGE);
  });

  it('refuses an archive with more members than the ceiling allows', async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index <= PLUGIN_UPLOAD_MAX_MEMBERS; index += 1) {
      files[`docs/file-${index}.md`] = 'x';
    }
    const error = await rejectionOf(await zipOf(files));
    expect(error.message).toBe(UPLOAD_TOO_MANY_MEMBERS_MESSAGE);
  });

  it('refuses a skill body that is not valid UTF-8', async () => {
    const error = await rejectionOf(
      await zipOf({ 'skills/a/SKILL.md': new Uint8Array([0xff, 0xfe, 0xfd]) }),
    );
    expect(error.message).toContain('is not valid UTF-8 text');
  });

  it('refuses more skills than one install may carry', async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index <= PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL; index += 1) {
      files[`skills/s${index}/SKILL.md`] = skillFile(`s${index}`, 'd', 'b');
    }
    const error = await rejectionOf(await zipOf(files));
    expect(error.message).toContain(`more than ${PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL} skills`);
  });

  it('refuses an archive with no plugin in it', async () => {
    const error = await rejectionOf(await zipOf({ 'README.md': 'nothing to see' }));
    expect(error.message).toBe(UPLOAD_NO_PLUGIN_MESSAGE);
  });

  it('refuses a plugin whose only skill file has no readable frontmatter', async () => {
    const error = await rejectionOf(await zipOf({ 'skills/a/SKILL.md': '   ' }));
    expect(error.message).toBe(UPLOAD_NO_SKILLS_MESSAGE);
  });

  it('refuses a name that cannot become a plugin identifier', async () => {
    const archive = await zipOf({ 'skills/a/SKILL.md': skillFile('a', 'd', 'b') });
    await expect(readPluginArchive(archive, '!!!')).rejects.toThrow(
      'cannot be used as a plugin identifier',
    );
  });
});

describe('readPluginArchive acceptance', () => {
  it('reads a plugin whose skills sit at the archive root', async () => {
    const archive = await zipOf({
      'skills/summarise/SKILL.md': skillFile('summarise', 'Summarise things', 'Do it.'),
    });
    const result = await readPluginArchive(archive, UPLOAD_NAME);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]).toMatchObject({
      key: 'my-plugin',
      name: 'my-plugin',
      version: '0.0.0',
    });
    expect(result.plugins[0]!.skills).toEqual([
      {
        name: 'summarise',
        description: 'Summarise things',
        path: 'skills/summarise/SKILL.md',
        content: skillFile('summarise', 'Summarise things', 'Do it.'),
      },
    ]);
  });

  it('keeps the whole SKILL.md, so the stored copy still carries its frontmatter', async () => {
    const source = skillFile('summarise', 'Summarise things', 'Do it.');
    const archive = await zipOf({ 'skills/summarise/SKILL.md': source });
    const result = await readPluginArchive(archive, UPLOAD_NAME);
    const stored = result.plugins[0]!.skills[0]!;
    expect(stored.content).toBe(source);
    expect(parseSkillFile(stored.path, stored.content)).toMatchObject({
      name: 'summarise',
      description: 'Summarise things',
      body: 'Do it.',
    });
  });

  it('strips the wrapper directory a folder zip adds', async () => {
    const archive = await zipOf({
      'my-pack/skills/summarise/SKILL.md': skillFile('summarise', 'Summarise', 'Do it.'),
    });
    const result = await readPluginArchive(archive, UPLOAD_NAME);
    expect(result.plugins[0]!.skills[0]!.path).toBe('skills/summarise/SKILL.md');
  });

  it('takes the version, description and skill list from plugin.json when present', async () => {
    const archive = await zipOf({
      '.claude-plugin/plugin.json': JSON.stringify({
        version: '2.1.0',
        description: 'A pack of things',
        skills: ['./skills/summarise'],
      }),
      'skills/summarise/SKILL.md': skillFile('summarise', 'Summarise', 'Do it.'),
      'skills/ignored/SKILL.md': skillFile('ignored', 'Not declared', 'Skip.'),
    });
    const result = await readPluginArchive(archive, UPLOAD_NAME);
    expect(result.plugins[0]).toMatchObject({
      version: '2.1.0',
      description: 'A pack of things',
    });
    expect(result.plugins[0]!.skills.map((skill) => skill.name)).toEqual(['summarise']);
  });

  it('reads every plugin a marketplace manifest declares', async () => {
    const archive = await zipOf({
      '.claude-plugin/marketplace.json': JSON.stringify({
        name: 'team-pack',
        plugins: [
          { name: 'first', source: './plugins/first', description: 'The first' },
          { name: 'second', source: './plugins/second', description: 'The second' },
        ],
      }),
      'plugins/first/skills/one/SKILL.md': skillFile('one', 'One', 'Do one.'),
      'plugins/second/skills/two/SKILL.md': skillFile('two', 'Two', 'Do two.'),
    });
    const result = await readPluginArchive(archive, UPLOAD_NAME);
    expect(result.sourceName).toBe('team-pack');
    expect(result.plugins.map((plugin) => plugin.key)).toEqual(['first', 'second']);
    expect(result.plugins[1]!.skills[0]!.path).toBe('plugins/second/skills/two/SKILL.md');
  });

  it('drops a declared plugin whose directory carries no skill', async () => {
    const archive = await zipOf({
      '.claude-plugin/marketplace.json': JSON.stringify({
        name: 'team-pack',
        plugins: [
          { name: 'first', source: './plugins/first' },
          { name: 'empty', source: './plugins/empty' },
        ],
      }),
      'plugins/first/skills/one/SKILL.md': skillFile('one', 'One', 'Do one.'),
      'plugins/empty/README.md': 'no skills here',
    });
    const result = await readPluginArchive(archive, UPLOAD_NAME);
    expect(result.plugins.map((plugin) => plugin.key)).toEqual(['first']);
  });
});
