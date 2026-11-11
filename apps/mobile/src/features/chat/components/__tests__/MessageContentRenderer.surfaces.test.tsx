import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { renderMarkdownContent } from '../MessageContentRenderer';
import {
  MIXED_ASSISTANT_REPLY,
  MIXED_REPLY_THROUGH_EMAIL,
} from '@agiworkforce/unified-chat/assistant-fence';

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

function renderReply(content: string, onFollowUp?: (text: string) => void) {
  return render(<>{renderMarkdownContent(content, undefined, onFollowUp ? { onFollowUp } : {})}</>);
}

function joinedText(view: { toJSON: () => unknown }): string {
  const tree = view.toJSON();
  return tree ? JSON.stringify(tree) : '';
}

describe('mobile mixed assistant reply', () => {
  it.each([
    ['form', 'title: Choices\ntext: Name | Sample\nsubmit: Apply'],
    ['card', 'title: Project\n\nA readable body.'],
    ['stats', 'Requests | 120 | This month'],
    ['carousel', 'One | First description\nTwo | Second description'],
  ])('keeps unsupported %s content readable and copyable', async (language, source) => {
    const onFollowUp = jest.fn();
    const view = renderReply(`\`\`\`${language}\n${source}\n\`\`\``, onFollowUp);
    expect(joinedText(view)).toContain(language);
    expect(screen.queryByTestId('answer-surface-tool')).toBeNull();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Copy code' })));
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(source);
    expect(onFollowUp).not.toHaveBeenCalled();
  });

  it('renders one mixed reply in order, with chart values, fallbacks, copy, follow-up, and one email after growth', async () => {
    const partial = renderReply(MIXED_REPLY_THROUGH_EMAIL);
    expect(partial.getAllByTestId('answer-surface-email')).toHaveLength(1);
    partial.unmount();

    const onFollowUp = jest.fn();
    const view = renderReply(`${MIXED_ASSISTANT_REPLY}\n\nMore prose.`, onFollowUp);
    const text = joinedText(view);
    let at = -1;
    for (const part of [
      'Here is the plan in ordinary prose.',
      'ada@example.com',
      'ready',
      'Inspect the application.',
      'pnpm test',
      'Passed',
      'Jan',
      '10',
      'Feb',
      '30',
      '1 of 2',
      'Writing blocks',
      '2 assertions failed',
      'Show the document',
      'title: Missing the address',
      'A widget this client does not draw.',
      'Open the application.',
      'More prose.',
    ]) {
      const next = text.indexOf(part, at + 1);
      if (next <= at) throw new Error(`Missing or reordered mixed reply segment: ${part}`);
      expect(next).toBeGreaterThan(at);
      at = next;
    }

    expect(screen.getAllByTestId('answer-surface-email')).toHaveLength(1);
    expect(screen.getByLabelText('Jan 10')).toBeTruthy();
    expect(screen.getByLabelText('Feb 30')).toBeTruthy();
    const fallbacks = screen.getAllByTestId('answer-fallback');
    expect(fallbacks).toHaveLength(2);
    expect(screen.getByText('title: Missing the address')).toBeTruthy();
    expect(screen.getByText('A widget this client does not draw.')).toBeTruthy();
    expect(text).not.toContain('javascript:');
    expect(screen.queryByText('Send')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.getByText(/have not been executed/)).toBeTruthy();
    expect(screen.getByText(/Passed/)).toBeTruthy();
    expect(screen.getByText(/Pending/)).toBeTruthy();
    expect(screen.getAllByText(/Failed/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('answer-surface-tool')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy full prompt' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Inspect the application.');
    const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls.at(-1)?.[0] as string;
    expect(copied).not.toContain('Copy full prompt');
    expect(copied).not.toContain('Prompt');

    fireEvent.press(screen.getByRole('checkbox', { name: 'Verify chat rendering' }));
    expect(screen.getByText('2 of 2')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Show the document' }));
    expect(onFollowUp).toHaveBeenCalledWith('Show the document');
  });
});

describe('mobile citation and gallery fences keep their resources reachable', () => {
  beforeEach(() => {
    jest.mocked(openUntrustedUrlInAppBrowser).mockClear();
  });

  it('opens a citation source through the approved link policy', () => {
    renderReply(
      '```citation\ntitle: Annual report\nsource: Example Corp\nurl: https://example.com/report\nsummary: Revenue grew.\n```',
    );

    const link = screen.getByRole('link', { name: 'https://example.com/report' });
    fireEvent.press(link);

    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/report');
  });

  it('asks before handing a mailto citation to Mail', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderReply('```citation\ntitle: Contact\nurl: mailto:team@example.com\n```');

    fireEvent.press(screen.getByRole('link', { name: 'mailto:team@example.com' }));

    expect(alertSpy).toHaveBeenCalledWith('Open in Mail?', 'mailto:team@example.com', [
      expect.objectContaining({ text: 'Cancel' }),
      expect.objectContaining({ text: 'Open' }),
    ]);
    expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('offers a link for each gallery image instead of dropping the resource', () => {
    renderReply(
      [
        '```gallery',
        'Reference photo | https://example.com/photo.png',
        '![Chart](https://example.com/chart.png)',
        'Brand colour | #ff8800',
        '```',
      ].join('\n'),
    );

    expect(screen.getByText('Reference photo')).toBeTruthy();
    expect(screen.getByText('Brand colour #ff8800')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(2);

    fireEvent.press(screen.getByRole('link', { name: 'Open image: Chart' }));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://example.com/chart.png');
  });

  it('shows no image link for an unsafe or missing source and loads nothing by itself', () => {
    renderReply(['```gallery', 'Bad | javascript:alert(1)', 'Plain | #123456', '```'].join('\n'));

    expect(screen.queryByRole('link')).toBeNull();
    expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
  });
});
