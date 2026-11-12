/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderAnswerInto } from '../src/features/content/in-page-panel/answerMarkdown';

function render(text: string): HTMLElement {
  const container = document.createElement('div');
  renderAnswerInto(container, text);
  return container;
}

describe('numbered and bulleted lists in an on-page answer', () => {
  it('keeps one numbered list when blank lines separate the items', () => {
    const area = render('1. First step\n\n2. Second step\n\n3. Third step');
    expect(area.querySelectorAll('ol')).toHaveLength(1);
    expect(Array.from(area.querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'First step',
      'Second step',
      'Third step',
    ]);
  });

  it('keeps one bulleted list across blank lines', () => {
    const area = render('- a\n\n- b');
    expect(area.querySelectorAll('ul')).toHaveLength(1);
    expect(area.querySelectorAll('li')).toHaveLength(2);
  });

  it('continues the numbering when a paragraph interrupts the list', () => {
    const area = render('1. One\n\nA remark between the steps.\n\n2. Two');
    const lists = area.querySelectorAll('ol');
    expect(lists).toHaveLength(2);
    expect(lists[1]!.start).toBe(2);
  });

  it('starts a new list when the kind changes', () => {
    const area = render('1. One\n\n- bullet');
    expect(area.querySelectorAll('ol')).toHaveLength(1);
    expect(area.querySelectorAll('ul')).toHaveLength(1);
  });

  it('closes the list at a paragraph that is not an item', () => {
    const area = render('- a\n\nafter the list');
    expect(area.querySelector('ul + p')?.textContent).toBe('after the list');
  });
});
