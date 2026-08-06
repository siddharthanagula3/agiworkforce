import { describe, expect, it } from 'vitest';
import { describeComputerUseAction } from '../src/features/computer-use/describeAction';

/**
 * The ask-before-acting gate is the user's only chance to stop an agent from
 * acting on their browser. It used to render a stringified function call
 * (`click(selector="#submit-order")`), which is not something a non-developer
 * can consent to.
 */
describe('describeComputerUseAction', () => {
  it('never renders a function-call signature', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['click', { selector: '#submit-order', index: 3 }],
      ['type', { selector: '#card', text: '4242424242424242' }],
      ['navigate', { url: 'https://example.com/checkout' }],
      ['read_dom', {}],
      ['some_future_tool', { a: 1 }],
    ];
    for (const [tool, args] of cases) {
      const text = describeComputerUseAction(tool, args);
      expect(text).not.toMatch(/\w+\(.*=.*\)/);
      expect(text.endsWith('.')).toBe(true);
    }
  });

  it('names the concrete target so the user knows what is affected', () => {
    expect(describeComputerUseAction('click', { selector: '#submit-order' })).toContain(
      '#submit-order',
    );
    expect(describeComputerUseAction('type', { text: 'hello' })).toContain('hello');
  });

  it('shows the host for a navigation, since leaving the page is the risk', () => {
    const text = describeComputerUseAction('navigate', { url: 'https://evil.example.com/x?y=1' });
    expect(text).toContain('evil.example.com');
    expect(text).toMatch(/leaving the current page/i);
  });

  it('says plainly that a page read includes on-screen text', () => {
    expect(describeComputerUseAction('read_dom', {})).toMatch(/contents of this page/i);
  });

  it('admits when it cannot describe an unknown tool rather than reassuring', () => {
    const text = describeComputerUseAction('unheard_of_tool', {});
    expect(text).toContain('unheard_of_tool');
    expect(text).toMatch(/not one AGI can describe/i);
  });

  it('truncates a hostile selector instead of letting it blow out the card', () => {
    const text = describeComputerUseAction('click', { selector: 'a'.repeat(500) });
    expect(text.length).toBeLessThan(120);
    expect(text).toContain('…');
  });
});
