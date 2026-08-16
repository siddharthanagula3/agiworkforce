
import { describe, expect, it } from 'vitest';
import { validateShortcutActions } from '../src/background/policy';

describe('handleRunPageActions / desktop-bridge plan validation', () => {
  it('accepts a plan of valid action types', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'navigate', value: 'https://example.com' },
        { id: '2', type: 'click', selector: '#submit' },
        { id: '3', type: 'wait_for_selector', selector: '#confirmed' },
      ] as never),
    ).toBe(true);
  });

  it('rejects a plan whose first action is unknown', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'evil_action' },
        { id: '2', type: 'click' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a plan whose LAST action is unknown', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'click' },
        { id: '2', type: 'type', value: 'hi' },
        { id: '3', type: 'inject_xss' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a plan with one valid + one bad action — fail-closed semantics', () => {
    expect(
      validateShortcutActions([
        { id: 'safe', type: 'get_page_info' },
        { id: 'bad', type: 'unknown' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a plan that uses browser-tool passthroughs the page cannot run', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'screenshot' },
        { id: '2', type: 'wait', delay: 500 },
        { id: '3', type: 'click' },
      ] as never),
    ).toBe(false);
  });

  it('rejects an empty-string action type', () => {
    expect(validateShortcutActions([{ id: '1', type: '' }] as never)).toBe(false);
  });

  it('rejects a navigate action with a javascript: url', () => {
    expect(
      validateShortcutActions([{ id: '1', type: 'navigate', url: 'javascript:alert(1)' }] as never),
    ).toBe(false);
  });

  it('rejects a navigate action with a data: url', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'navigate', url: 'data:text/html,<script>alert(1)</script>' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a click action with an oversized selector', () => {
    const huge = '#a' + ' > div'.repeat(500);
    expect(validateShortcutActions([{ id: '1', type: 'click', selector: huge }] as never)).toBe(
      false,
    );
  });

  it('rejects a type action with an oversized value', () => {
    const huge = 'x'.repeat(20_000);
    expect(validateShortcutActions([{ id: '1', type: 'type', value: huge }] as never)).toBe(false);
  });

  it('rejects a navigate action with a non-string url', () => {
    expect(
      validateShortcutActions([{ id: '1', type: 'navigate', url: { evil: true } }] as never),
    ).toBe(false);
  });

  it('accepts a navigate action with an https url under cap', () => {
    expect(
      validateShortcutActions([
        { id: '1', type: 'navigate', url: 'https://example.com/path' },
      ] as never),
    ).toBe(true);
  });
});
