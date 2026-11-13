import { render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../MathBlock', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    MathBlock: ({ latex, display }: { latex: string; display: boolean }) => (
      <MockText testID={display ? 'math-display' : 'math-inline'}>{latex}</MockText>
    ),
  };
});
jest.mock('../MermaidDiagramBlock', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    MermaidDiagramBlock: ({ source }: { source: string }) => (
      <MockText testID="mermaid-diagram">{source}</MockText>
    ),
  };
});

import { colors } from '@/src/ui/theme';
import { renderMarkdownContent } from '../MessageContentRenderer';

const answer = [
  '## Laptop comparison',
  '',
  '| Feature | Ultraportable | Creator 16" |',
  '| --- | --- | --- |',
  '| Typical weight | About 1.2 kg | About 2.2 kg |',
  '| Math | $E = mc^2$ | n/a |',
  '',
  '### Login flow',
  '',
  '```mermaid',
  'flowchart TD',
  '    A([User opens login page]) --> B[Enter email and password]',
  '    B --> C{Fields valid?}',
  '```',
  '',
  '### Compound interest',
  '',
  '$$A = P\\left(1 + \\frac{r}{n}\\right)^{nt}$$',
  '',
  'where $A$ is the final amount, as reported [1].',
  '',
  '```javascript',
  'function lastN(items, n) {',
  '  return items.slice(-n);',
  '}',
  '```',
  '',
  '```diff',
  ' function lastN(items, n) {',
  '-  return items.slice(-n);',
  '+  if (n <= 0) return [];',
  '+  return items.slice(-n);',
  ' }',
  '```',
  '',
  '- [x] Completed task',
  '- [ ] Open task',
].join('\n');

const sources = [{ url: 'https://example.com/interest', title: 'Interest explained' }];

function renderAnswer() {
  return render(<>{renderMarkdownContent(answer, colors, { citations: sources })}</>);
}

function closestStyle(node: ReactTestInstance, key: string): unknown {
  let current: ReactTestInstance | null = node;
  while (current) {
    const styles = [current.props?.style].flat(Infinity) as (Record<string, unknown> | null)[];
    for (const entry of styles) {
      if (entry && entry[key] !== undefined) return entry[key];
    }
    current = current.parent;
  }
  return undefined;
}

describe('the answer shapes the audit asked for, on mobile', () => {
  it('renders headings as headings and table cells without markdown syntax', () => {
    const screen = renderAnswer();
    expect(screen.queryByText(/^#+ /)).toBeNull();
    expect(screen.getByText('Laptop comparison')).toBeTruthy();
    expect(screen.getByText('About 2.2 kg')).toBeTruthy();
    expect(screen.queryByText(/\|/)).toBeNull();
  });

  it('typesets display, inline and table-cell math instead of showing dollar signs', () => {
    const screen = renderAnswer();
    expect(screen.getByTestId('math-display').props.children).toContain('\\frac{r}{n}');
    const inline = screen.getAllByTestId('math-inline').map((node) => node.props.children);
    expect(inline).toEqual(expect.arrayContaining(['A', 'E = mc^2']));
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('draws the mermaid flowchart and gives every code block a copy control', () => {
    const screen = renderAnswer();
    expect(screen.getByTestId('mermaid-diagram').props.children).toContain('flowchart TD');
    expect(screen.getAllByLabelText('Copy code')).toHaveLength(2);
  });

  it('links a citation marker to its source', () => {
    const screen = renderAnswer();
    expect(screen.getByLabelText('Citation 1: Interest explained')).toBeTruthy();
  });

  it('colours diff additions and removals with the diff tokens', () => {
    const screen = renderAnswer();
    const added = screen.getByText('+  if (n <= 0) return [];');
    const removed = screen.getByText('-  return items.slice(-n);');
    expect(closestStyle(added, 'color')).toBe(colors.diffAddedText);
    expect(closestStyle(added, 'backgroundColor')).toBe(colors.diffAddedFill);
    expect(closestStyle(removed, 'color')).toBe(colors.diffRemovedText);
    expect(closestStyle(removed, 'backgroundColor')).toBe(colors.diffRemovedFill);
    expect(closestStyle(screen.getByText(' }'), 'color')).toBe(colors.textPrimary);
  });

  it('shows task list items as checked and unchecked boxes, not literal brackets', () => {
    const screen = renderAnswer();
    expect(screen.queryByText(/\[x\]|\[ \]/)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Completed task', checked: true })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Open task', checked: false })).toBeTruthy();
  });
});
