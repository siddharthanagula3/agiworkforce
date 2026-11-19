import { answerClipboardText, answerPlainText } from '../markdownPlainText';

const EMAIL_ANSWER = [
  'Here is a draft.',
  '',
  '```email',
  'To: sam@example.com',
  'Subject: Launch',
  '',
  'Hi Sam,',
  'We ship on Friday.',
  '```',
].join('\n');

describe('answer plain text', () => {
  it('keeps the lines of a code fence exactly as written', () => {
    const code = [
      '# a comment',
      '> prompt',
      '- item',
      'def __init__(self):',
      '    print(`x`, "\\"q\\"")',
      '| a | b |',
    ].join('\n');

    expect(answerPlainText(`Run this:\n\n\`\`\`python\n${code}\n\`\`\`\n\nDone.`)).toBe(
      `Run this:\n\n${code}\n\nDone.`,
    );
  });

  it('shows the words of the answer without markup, entities, tags or footnote syntax', () => {
    const answer = [
      '## Results &amp; notes',
      '',
      '> A **quoted** line',
      '- one with `code`',
      '  - nested [link](https://example.com)',
      '1. first<br>part',
      '- [x] done',
      '',
      '| Name | Score |',
      '| --- | ---: |',
      '| *Ada* | 10 |',
      '',
      '---',
      'Energy $E=mc^2$ claim[^1] <b>bold</b> <script>x()</script>',
      '',
      '$$',
      'a^2 + b^2',
      '$$',
      '',
      '[^1]: The source.',
    ].join('\n');

    expect(answerPlainText(answer)).toBe(
      [
        'Results & notes',
        '',
        'A quoted line',
        '• one with code',
        '  • nested link',
        '1. first\npart',
        '• done',
        '',
        'Name\tScore',
        'Ada\t10',
        '',
        'Energy E=mc^2 claim¹ bold ',
        '',
        'a^2 + b^2',
        '',
        '1. The source.',
      ].join('\n'),
    );
  });

  it('turns an email draft into its card text and a chart into its title and rows', () => {
    expect(answerPlainText(EMAIL_ANSWER)).toBe(
      'Here is a draft.\n\nTo: sam@example.com\nSubject: Launch\n\nHi Sam,\nWe ship on Friday.',
    );

    const chart = answerPlainText(
      [
        '```chart',
        JSON.stringify({
          type: 'bar',
          title: 'Sales',
          xLabel: 'Quarter',
          yLabel: 'Units',
          data: [
            { label: 'Q1', value: 4 },
            { label: 'Q2', value: 7 },
          ],
        }),
        '```',
      ].join('\n'),
    );
    expect(chart).not.toContain('{');
    expect(chart).toContain('Sales');
    expect(chart).toContain('Q2\t7');
  });
});

describe('answer plain text, tables, diagrams and notes', () => {
  it('turns every table row into tab-separated cells, with or without outer pipes', () => {
    const answer = [
      'Name | Score',
      '--- | ---:',
      '**Ada** | 10',
      '[Bob](https://b.test) | 9 \\| 8',
      '',
      '| A | B |',
      '|---|---|',
      '| `x` | y |',
    ].join('\n');

    expect(answerPlainText(answer)).toBe(
      ['Name\tScore', 'Ada\t10', 'Bob\t9 | 8', '', 'A\tB', 'x\ty'].join('\n'),
    );
  });

  it('does not read a heading underline or a lone pipe line as a table', () => {
    expect(answerPlainText('Title\n---\nOne | two')).toBe('Title\nOne | two');
  });

  it('shows a diagram as its title, its chart values or its node labels, never its source', () => {
    expect(
      answerPlainText('```mermaid\ntitle: Release flow\nflowchart TD\nA[Build] --> B[Ship]\n```'),
    ).toBe('Release flow');
    expect(answerPlainText('```mermaid\nflowchart TD\nA[Build] --> B{Ship it}\n```')).toBe(
      'Build, Ship it',
    );
    expect(
      answerPlainText(
        '```mermaid\nsequenceDiagram\nparticipant Ann\nparticipant B as Bob\nAnn->>B: Hi\n```',
      ),
    ).toBe('Ann, Bob');
    expect(answerPlainText('```mermaid\npie title Pets\n"Dogs" : 3\n"Cats" : 1\n```')).toContain(
      'Pie chart, Pets',
    );
    expect(answerPlainText('```mermaid\ngraph\n```')).toBe('Diagram');
  });

  it('leaves a script or style block with its content out, over several lines', () => {
    const answer = 'Before\n<script>\nsteal();\n</script>\nAfter <style>\na{}\n</style> end';

    expect(answerPlainText(answer)).toBe('Before\n\nAfter  end');
  });

  it('numbers named footnotes by position and leaves link definitions out', () => {
    const answer = [
      'Claim[^first] and more[^second] see [the docs][d].',
      '',
      '[d]: https://example.com/docs "Docs"',
      '[^first]: One.',
      '[^second]: Two.',
    ].join('\n');

    expect(answerPlainText(answer)).toBe(
      'Claim\u00b9 and more\u00b2 see the docs.\n\n1. One.\n2. Two.',
    );
  });
});

describe('answer plain text for badges and headings', () => {
  it('shows a badge as its label and strips the closing hashes of a heading', () => {
    expect(answerPlainText('## Plan ##\n\nStatus [[Verified]] now\n\n> # Quoted heading #')).toBe(
      'Plan\n\nStatus Verified now\n\nQuoted heading',
    );
  });

  it('keeps a badge marker inside a code fence as written', () => {
    expect(answerPlainText('```\n[[Verified]]\n```')).toBe('[[Verified]]');
  });
});

describe('answer clipboard text', () => {
  it('copies an email draft as its card text without fence markers', () => {
    expect(answerClipboardText(EMAIL_ANSWER)).toBe(
      'Here is a draft.\n\nTo: sam@example.com\nSubject: Launch\n\nHi Sam,\nWe ship on Friday.',
    );
  });

  it('leaves ordinary markdown and code fences as written, as web copies them', () => {
    const answer = '**Bold** and\n\n```js\nconst a = 1;\n```';
    expect(answerClipboardText(answer)).toBe(answer);
  });
});
