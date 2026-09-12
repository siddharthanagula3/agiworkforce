import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { hasPrivateContext } from './tool-loop';

/**
 * `WEB-SEC-SCAN-2026-09-09-F39`.
 *
 * One leg of the lethal-trifecta gate: untrusted content, a sensitive source,
 * and an egress path together escalate a tool call. Interactively the
 * escalation asks a human. On an unattended run there is nobody to ask, so the
 * gate's answer is allow or deny, and getting this leg wrong there is the
 * difference between denying an injected instruction and acting on it.
 *
 * Every other signal is read off the shape of the conversation, which is how a
 * scheduled run defeated it: built as exactly one system message and one user
 * message, it looks like a first turn with nothing private in it, even when
 * `loadProjectContext` folded the project's private context into that system
 * prompt.
 */
type Message = Parameters<typeof hasPrivateContext>[1][number];

const USER: Message = { role: 'user', content: 'hello' } as Message;
const SYSTEM: Message = { role: 'system', content: 'you are helpful' } as Message;

describe('the sensitive-source leg of the trifecta gate', () => {
  it('sees nothing private in a plain first turn', () => {
    expect(hasPrivateContext({}, [SYSTEM, USER])).toBe(false);
  });

  /** The shape a scheduled run has, which is why it needs the explicit flag. */
  it('still sees nothing private in a scheduled run that carries no project', () => {
    expect(hasPrivateContext({ sensitiveContextPresent: false }, [SYSTEM, USER])).toBe(false);
  });

  it('sees the project context a scheduled run folded into its system prompt', () => {
    expect(hasPrivateContext({ sensitiveContextPresent: true }, [SYSTEM, USER])).toBe(true);
  });

  it('sees memory facts', () => {
    expect(hasPrivateContext({ autoMemoryFacts: ['the user lives in Austin'] }, [USER])).toBe(true);
  });

  it('ignores an empty memory list', () => {
    expect(hasPrivateContext({ autoMemoryFacts: [] }, [USER])).toBe(false);
  });

  it('sees an earlier user turn', () => {
    expect(hasPrivateContext({}, [USER, USER])).toBe(true);
  });

  it('sees a non-text part, which is how an attachment arrives', () => {
    const withImage = {
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'https://example.test/a.png' } }],
    } as Message;

    expect(hasPrivateContext({}, [withImage])).toBe(true);
  });

  it('does not count a text-only array part as an attachment', () => {
    const textParts = { role: 'user', content: [{ type: 'text', text: 'hello' }] } as Message;

    expect(hasPrivateContext({}, [textParts])).toBe(false);
  });

  it('only ever adds: the explicit flag never suppresses another signal', () => {
    expect(hasPrivateContext({ sensitiveContextPresent: false }, [USER, USER])).toBe(true);
  });
});
