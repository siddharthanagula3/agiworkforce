import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { asksForPluginDraft } from '@/lib/server/tools/plugin-draft-tool';
import { SAVE_AS_SKILL_PROMPT } from './save-as-skill';

describe('SAVE_AS_SKILL_PROMPT', () => {
  it('is a request the gateway answers with the skill draft tool', () => {
    expect(asksForPluginDraft(SAVE_AS_SKILL_PROMPT)).toBe(true);
  });
});
