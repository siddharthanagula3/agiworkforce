import { describe, expect, it } from 'vitest';
import { resolveNewChatTemporary, temporaryChatAllowedIn } from '@/lib/temporary-chat-policy';

describe('a new chat in a project', () => {
  it('is never temporary, whatever the default or the armed choice says', () => {
    expect(resolveNewChatTemporary(true, true, 'project-1')).toBe(false);
    expect(resolveNewChatTemporary(null, true, 'project-1')).toBe(false);
    expect(temporaryChatAllowedIn('project-1')).toBe(false);
  });

  it('keeps the armed choice and the default outside a project', () => {
    expect(resolveNewChatTemporary(true, false, null)).toBe(true);
    expect(resolveNewChatTemporary(null, true, null)).toBe(true);
    expect(resolveNewChatTemporary(false, true, null)).toBe(false);
    expect(temporaryChatAllowedIn(null)).toBe(true);
  });
});
