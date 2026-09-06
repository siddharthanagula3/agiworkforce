import { describe, expect, it, vi } from 'vitest';

import { PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL } from '../constants';
import { fetchPluginSkillFiles, parseSkillFile } from '../skill-files';
import { LOCATION } from './fixtures';

const SKILL = [
  '---',
  'name: background-removal',
  'description: Remove backgrounds',
  '---',
  '',
  '# Steps',
  'Do it.',
].join('\n');

describe('parseSkillFile', () => {
  it('reads the name and description from frontmatter and keeps the body', () => {
    expect(parseSkillFile('skills/background-removal/SKILL.md', SKILL)).toEqual({
      name: 'background-removal',
      description: 'Remove backgrounds',
      body: '# Steps\nDo it.',
      path: 'skills/background-removal/SKILL.md',
    });
  });

  it('falls back to the directory name and rejects an empty body', () => {
    expect(parseSkillFile('skills/vectorize/SKILL.md', 'Just text')).toMatchObject({
      name: 'vectorize',
      description: '',
    });
    expect(parseSkillFile('skills/vectorize/SKILL.md', '---\nname: x\n---\n')).toBeNull();
  });
});

describe('fetchPluginSkillFiles', () => {
  it('fetches each SKILL.md at the pinned sha, drops failures and duplicate names', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('missing/SKILL.md')) return new Response('', { status: 404 });
      const name = url.split('/').at(-2);
      return new Response(SKILL.replace('background-removal', name ?? ''), { status: 200 });
    });
    const skills = await fetchPluginSkillFiles(
      LOCATION,
      [
        'skills/background-removal/SKILL.md',
        'skills/missing/SKILL.md',
        'skills/vectorize/SKILL.md',
        'skills/vectorize/SKILL.md',
      ],
      fetchImpl,
    );
    expect(skills.map((skill) => skill.name)).toEqual(['background-removal', 'vectorize']);
    expect(fetchImpl.mock.calls[0]![0]).toContain(`/adobe/skills/${LOCATION.sha}/`);
  });

  it('caps the number of skills fetched per install', async () => {
    const fetchImpl = vi.fn(async () => new Response(SKILL, { status: 200 }));
    const paths = Array.from(
      { length: PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL + 5 },
      (_, i) => `skills/s${i}/SKILL.md`,
    );
    await fetchPluginSkillFiles(LOCATION, paths, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL);
  });
});
