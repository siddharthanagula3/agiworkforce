import { describe, expect, it } from 'vitest';

import golden from '../__fixtures__/skill-manifests.golden.json';
import { parseFrontmatter } from '../frontmatter';
import { readSkillVersion } from '../integrity';

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

describe('SKILL.md manifests match the golden fixtures shared with the CLI', () => {
  for (const fixture of golden) {
    it(fixture.case, () => {
      const { data, body } = parseFrontmatter(fixture.source);
      const requires = (data['requires'] ?? {}) as Record<string, unknown>;
      expect({
        name: typeof data['name'] === 'string' ? data['name'] : null,
        description: typeof data['description'] === 'string' ? data['description'] : null,
        version: readSkillVersion(data) ?? null,
        body: body.trim(),
        tools: strings(requires['tools']),
        env: strings(requires['env']),
      }).toEqual(fixture.expected);
    });
  }
});
