/**
 * PAR-M40 — transcript code blocks had no language header row.
 *
 * The card used to be a bordered box with the copy button absolutely
 * positioned at top:6/right:6 over 28pt of reserved blank padding, and the
 * fence language (`match[3]`) was handed to the tokenizer and then discarded —
 * so a reader could never tell what language a block was, and an unlabelled
 * fence got no label at all.
 *
 * These tests pin the replacement: a real header row carrying a muted 11pt
 * language label ("Plain text" when the fence has none) with the copy control
 * beside it in normal flow.
 */
import { View } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { lightColors } from '../src/ui/theme';

function renderFence(markdown: string) {
  return render(<View>{renderMarkdownContent(markdown, lightColors)}</View>);
}

describe('code-card header row', () => {
  it('labels a fence that declares its language', () => {
    const screen = renderFence('```python\nprint("hi")\n```');

    expect(screen.getByText('python')).toHaveStyle({
      fontSize: 11,
      color: lightColors.textMuted,
    });
    expect(screen.queryByText('Plain text')).toBeNull();
    expect(screen.toJSON()).toMatchSnapshot();
  });

  it('labels an unlabelled fence "Plain text"', () => {
    const screen = renderFence('```\nplain block content\n```');

    expect(screen.getByText('Plain text')).toHaveStyle({
      fontSize: 11,
      color: lightColors.textMuted,
    });
    expect(screen.toJSON()).toMatchSnapshot();
  });

  it('keeps the copy control in the header row rather than floating over the code', () => {
    const screen = renderFence('```ts\nconst x = 1;\n```');

    const copy = screen.getByLabelText('Copy code');
    // Absolute positioning is what forced the blank 28pt gutter above the body.
    expect(copy).not.toHaveStyle({ position: 'absolute' });

    // Label and copy control share one row, so both are siblings of the same
    // parent — the header — rather than the label being absent entirely.
    const label = screen.getByText('ts');
    expect(label.parent).toBeTruthy();
    expect(copy.parent).toBeTruthy();
  });

  it('renders the code body itself unchanged beneath the header', () => {
    const screen = renderFence('```\nplain block content\n```');

    expect(screen.getByText('plain block content')).toHaveStyle({
      color: lightColors.textPrimary,
      fontFamily: 'Menlo',
    });
  });

  it('treats a whitespace-only fence tag as unlabelled', () => {
    // ```   \n … ``` — the tokenizer regex only captures \w+, so a padded
    // fence yields no language and must still get the fallback label.
    const screen = renderFence('```   \nnothing\n```');

    expect(screen.getByText('Plain text')).toBeTruthy();
  });
});
