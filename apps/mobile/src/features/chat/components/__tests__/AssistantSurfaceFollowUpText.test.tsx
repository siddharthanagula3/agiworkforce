import { fireEvent, render, screen } from '@testing-library/react-native';
import { renderMarkdownContent } from '../MessageContentRenderer';

jest.mock('@/lib/safeOpenURL', () => ({
  ...jest.requireActual('@/lib/safeOpenURL'),
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

describe('follow-up rows the model writes in an answer', () => {
  it('show and ask plain text, without TeX delimiters or Markdown marks', () => {
    const onFollowUp = jest.fn();
    const fence = [
      '```followups',
      'How is \\(E = mc^2\\) derived?',
      'Why is **Rust** safe around `unsafe`?',
      'How do I center a <div>?',
      '```',
    ].join('\n');
    render(<>{renderMarkdownContent(fence, undefined, { onFollowUp })}</>);

    expect(screen.getByText('How is E = mc^2 derived?')).toBeTruthy();
    expect(screen.queryByText(/\\\(/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Why is Rust safe around unsafe?' }));
    expect(onFollowUp).toHaveBeenCalledWith('Why is Rust safe around unsafe?');
    fireEvent.press(screen.getByRole('button', { name: 'How do I center a <div>?' }));
    expect(onFollowUp).toHaveBeenLastCalledWith('How do I center a <div>?');
  });
});
