import { describe, expect, it } from 'vitest';
import {
  PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS,
  ProjectMemoryEditHandshakeSchema,
  ProjectMemoryEditRequestSchema,
  ProjectMemoryEditResponseSchema,
} from '../project-memory-edit';

describe('project memory edit contract', () => {
  it('trims the message and bounds it', () => {
    expect(ProjectMemoryEditRequestSchema.parse({ message: '  Change the deadline  ' })).toEqual({
      message: 'Change the deadline',
    });
    expect(ProjectMemoryEditRequestSchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(
      ProjectMemoryEditRequestSchema.safeParse({
        message: 'x'.repeat(PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS + 1),
      }).success,
    ).toBe(false);
  });

  it('reads changes and removals, and refuses a removed action in the changes', () => {
    const answer = {
      changed: [{ id: 'm-2', action: 'updated', content: 'The deadline is March' }],
      removals: [{ id: 'm-1', content: 'The deadline is February' }],
      reply: ' Updated: deadline is March ',
    };

    expect(ProjectMemoryEditResponseSchema.parse(answer)).toEqual({
      ...answer,
      reply: 'Updated: deadline is March',
    });
    expect(
      ProjectMemoryEditResponseSchema.safeParse({
        ...answer,
        changed: [{ id: 'm-1', action: 'removed', content: 'The deadline is February' }],
      }).success,
    ).toBe(false);
    expect(ProjectMemoryEditResponseSchema.safeParse({ changed: [], reply: '' }).success).toBe(
      false,
    );
  });

  it('accepts only a positive whole limit in the handshake', () => {
    expect(
      ProjectMemoryEditHandshakeSchema.parse({
        maxMessageChars: PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS,
      }),
    ).toEqual({ maxMessageChars: PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS });
    expect(ProjectMemoryEditHandshakeSchema.safeParse({ maxMessageChars: 0 }).success).toBe(false);
    expect(ProjectMemoryEditHandshakeSchema.safeParse({}).success).toBe(false);
  });
});
