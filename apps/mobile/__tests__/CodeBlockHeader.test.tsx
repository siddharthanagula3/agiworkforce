import { StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { lightColors } from '../src/ui/theme';
import { typeScale } from '../src/ui/theme/tokens';

function renderFence(markdown: string) {
  return render(<View>{renderMarkdownContent(markdown, lightColors)}</View>);
}

describe('code-card header row', () => {
  it('labels a fence that declares its language', () => {
    const screen = renderFence('```python\nprint("hi")\n```');

    expect(screen.getByText('python')).toHaveStyle({
      fontSize: typeScale.caption,
      color: lightColors.textMuted,
    });
    expect(screen.queryByText('Plain text')).toBeNull();
    expect(screen.toJSON()).toMatchSnapshot();
  });

  it('labels an unlabelled fence "Plain text"', () => {
    const screen = renderFence('```\nplain block content\n```');

    expect(screen.getByText('Plain text')).toHaveStyle({
      fontSize: typeScale.caption,
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

  it('draws Download and Copy as bare symbols with no box behind them, each with a full-size tap area', () => {
    const screen = renderFence('```ts\nconst x = 1;\n```');

    for (const label of ['Download code.ts', 'Copy code']) {
      const control = screen.getByLabelText(label);
      const style = StyleSheet.flatten(control.props.style) ?? {};
      expect(style.backgroundColor).toBeUndefined();
      expect(style.borderWidth).toBeUndefined();
      expect(style.borderRadius).toBeUndefined();
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
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
