import { describe, expect, it } from 'vitest';
import { markdownLineText } from '../markdownDocument';

describe('markdownLineText, the words a follow-up suggestion shows and sends', () => {
  it.each([
    [
      'How is the energy equation \\(E = mc^2\\) derived?',
      'How is the energy equation E = mc^2 derived?',
    ],
    ['Why does \\(\\sum_{i=1}^{3} I = 6\\) hold?', 'Why does \\sum_{i=1}^{3} I = 6 hold?'],
    ['Why is $x^2$ always positive?', 'Why is x^2 always positive?'],
    [
      'Can you explain **memory safety** in `unsafe` blocks?',
      'Can you explain memory safety in unsafe blocks?',
    ],
    ['Is it *really* faster than __Rust__?', 'Is it really faster than Rust?'],
    ['Is $5 cheaper than $10?', 'Is $5 cheaper than $10?'],
    [
      'What does the <script> tag do in zebrafish markup?',
      'What does the <script> tag do in zebrafish markup?',
    ],
    ['What does   the\nindex   do?', 'What does the index do?'],
    ['How do I center a <div>?', 'How do I center a <div>?'],
    ['What does the <a> tag do?', 'What does the <a> tag do?'],
    ['When should I use <p> or <span>?', 'When should I use <p> or <span>?'],
    ['Why close <script> with </script>?', 'Why close <script> with </script>?'],
    ['Why does <style> sit in <head>?', 'Why does <style> sit in <head>?'],
    [
      'When is a <br> tag or <!-- comment --> useful?',
      'When is a <br> tag or <!-- comment --> useful?',
    ],
    ['What does `<div>` do?', 'What does <div> do?'],
    ['Is **<details>** supported?', 'Is <details> supported?'],
    ['Is <https://example.com> still up?', 'Is https://example.com still up?'],
    ['Why is $a<b$ true?', 'Why is a<b true?'],
    [
      'What is the difference between $HOME and $PATH?',
      'What is the difference between $HOME and $PATH?',
    ],
    ['Why does \\( x \\) need padding?', 'Why does x need padding?'],
  ])('shows %p as %p', (raw, shown) => {
    expect(markdownLineText(raw)).toBe(shown);
  });
});
