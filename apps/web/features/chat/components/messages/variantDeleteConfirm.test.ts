import { describe, expect, it } from 'vitest';
import { variantDeleteConfirm } from './variantDeleteConfirm';

describe('variantDeleteConfirm', () => {
  it('names the consequence rather than asking whether the reader is sure', () => {
    const copy = variantDeleteConfirm({ followerCount: 0, siblingCount: 1 });

    expect(copy.title).toBe('Delete this response?');
    expect(copy.description).toBe(
      'This response is deleted. The other answer to this message stays, and you are moved to it. This cannot be undone.',
    );
    expect(copy.confirmText).toBe('Delete response');
    expect(copy.variant).toBe('destructive');
  });

  it('counts what goes with the response, because the subtree mode takes it too', () => {
    expect(variantDeleteConfirm({ followerCount: 3, siblingCount: 2 }).description).toBe(
      'This response and the 3 messages that follow it are deleted. The other 2 answers to this message stay, and you are moved to the newest. This cannot be undone.',
    );
  });

  it('says one message rather than 1 messages', () => {
    expect(variantDeleteConfirm({ followerCount: 1, siblingCount: 1 }).description).toContain(
      'the message that follows it',
    );
  });

  it('promises a deletion that cannot be recovered, matching the hard delete it calls', () => {
    for (const followerCount of [0, 1, 5]) {
      for (const siblingCount of [1, 2]) {
        expect(variantDeleteConfirm({ followerCount, siblingCount }).description).toContain(
          'This cannot be undone.',
        );
      }
    }
  });
});
