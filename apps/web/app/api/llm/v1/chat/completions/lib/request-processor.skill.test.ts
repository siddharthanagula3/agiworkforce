import { describe, expect, it } from 'vitest';

import type { Skill } from '@agiworkforce/skills';

import {
  applyManagedSkillSelection,
  ChatCompletionRequestSchema,
  collectManagedPromptMaterials,
} from './request-processor';

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'design-review',
    description: 'Review UI for release polish.',
    body: 'PRIVATE SKILL BODY',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: '/srv/private/skills/design-review/SKILL.md',
    source: 'personal',
    metadata: {},
    frontmatter: {},
    ...overrides,
  };
}

describe('managed Skill request contract', () => {
  it('accepts a bounded catalog name and rejects path-shaped or control-character input', () => {
    const base = { model: 'test-model', messages: [{ role: 'user', content: 'Review this' }] };

    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: 'design-review' }).success,
    ).toBe(true);
    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: '../../secret' }).success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: 'bad\\name' }).success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: 'bad\u0000name' }).success,
    ).toBe(false);
  });

  it('injects selected metadata and the server-owned tool without sending the body or host location', () => {
    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Review this' }],
      skill_name: 'design-review',
    });

    const result = applyManagedSkillSelection(request, [skill()]);

    expect(result).toEqual({ ok: true });
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(String(request.messages[0]?.content)).toContain('<selected>true</selected>');
    expect(String(request.messages[0]?.content)).toContain('action=load');
    expect(JSON.stringify(request.messages)).not.toContain('PRIVATE SKILL BODY');
    expect(JSON.stringify(request.messages)).not.toContain('/srv/private');
    expect(request.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'skill' }),
      }),
    ]);
    expect(request.tool_choice).toEqual({
      type: 'function',
      function: { name: 'skill' },
    });

    const promptMaterials = collectManagedPromptMaterials(request);
    expect(promptMaterials).toEqual(
      expect.arrayContaining([
        expect.stringContaining('<selected>true</selected>'),
        expect.stringContaining('"name":"skill"'),
      ]),
    );
    expect(JSON.stringify(promptMaterials)).not.toContain('PRIVATE SKILL BODY');
    expect(JSON.stringify(promptMaterials)).not.toContain('/srv/private');
  });

  it('fails explicitly when the selected name is absent instead of silently falling back', () => {
    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Review this' }],
      skill_name: 'missing-skill',
    });

    expect(applyManagedSkillSelection(request, [skill()])).toEqual({
      ok: false,
      code: 'skill_not_found',
      message: 'The selected skill is not available.',
    });
    expect(request.messages).toEqual([{ role: 'user', content: 'Review this' }]);
    expect(request.tools).toBeUndefined();
  });
});
