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
    expect(copy).not.toHaveStyle({ position: 'absolute' });

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
    const screen = renderFence('```   \nnothing\n```');

    expect(screen.getByText('Plain text')).toBeTruthy();
  });
});
