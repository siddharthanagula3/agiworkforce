import { render, screen } from '@testing-library/react-native';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));

import { renderMarkdownContent } from '../MessageContentRenderer';

function renderMarkdown(content: string) {
  return render(<>{renderMarkdownContent(content, undefined, {})}</>);
}

describe('inline formatting that wraps onto the next line', () => {
  it('shows bold, italic and strike across a single line break without their markers', () => {
    const view = renderMarkdown('**bold\ncontinues** end\n\n_slant\nwrap_ and ~~gone\nlines~~');
    const tree = JSON.stringify(view.toJSON());

    expect(tree).not.toContain('**');
    expect(tree).not.toContain('~~');
    expect(tree).not.toContain('_slant');
    expect(screen.getByText('bold\ncontinues')).toBeTruthy();
    expect(screen.getByText('slant\nwrap')).toBeTruthy();
    expect(screen.getByText('gone\nlines')).toBeTruthy();
  });

  it('shows a code span that crosses a line break as one span with a space', () => {
    renderMarkdown('run `npm\ninstall` now');

    expect(screen.getByText('npm install')).toBeTruthy();
  });
});

describe('named character references', () => {
  it('shows the Greek letter and the check mark for their names', () => {
    renderMarkdown('&alpha; &check; done');

    expect(screen.getByText('α ✓ done')).toBeTruthy();
  });
});

describe('a script or style element that starts a line', () => {
  it('leaves the text before and after it as two paragraphs', () => {
    renderMarkdown('Before\n<script>\nalert(1)\n</script>\nAfter');

    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
  });
});
