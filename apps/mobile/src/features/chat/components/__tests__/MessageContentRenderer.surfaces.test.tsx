import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert, Dimensions } from 'react-native';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { renderMarkdownContent } from '../MessageContentRenderer';
import {
  MIXED_ASSISTANT_REPLY,
  MIXED_REPLY_THROUGH_EMAIL,
  MODES_NOTE,
} from '@agiworkforce/unified-chat/assistant-fence';

jest.mock('@/lib/safeOpenURL', () => ({
  ...jest.requireActual('@/lib/safeOpenURL'),
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
  it('draws a card with its title, tags and a Markdown body', () => {
    renderReply(
      '```card\ntitle: Project\nsubtitle: Spring plan\ntags: Design, Mobile\n\nA **readable** body.\n```',
    );
    expect(screen.getByTestId('answer-surface-card')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Project' })).toBeTruthy();
    expect(screen.getByText('Spring plan')).toBeTruthy();
    expect(screen.getByText('Mobile')).toBeTruthy();
    expect(screen.getByText('readable')).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull();
  });

  it('draws stats as label and value tiles', () => {
    renderReply('```stats\nRequests | 120 | This month\nErrors | 3 | Down from 9\n```');
    expect(screen.getByTestId('answer-surface-stats')).toBeTruthy();
    expect(screen.getByLabelText('Requests, 120, This month')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('draws a carousel with one slide per item and a position', () => {
    renderReply('```carousel\nOne | First description\nTwo | Second description\n```');
    expect(screen.getByTestId('answer-surface-carousel')).toBeTruthy();
    expect(screen.getByText('First description')).toBeTruthy();
    expect(screen.getByLabelText('2 of 2: Two')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('draws a form whose fields hold the values from the reply', () => {
    renderReply('```form\ntitle: Choices\ntext: Name | Sample\nsubmit: Apply\n```');
    expect(screen.getByTestId('answer-surface-form')).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('Sample');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull();
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
    expect(screen.getByLabelText(/Jan 10, Feb 30/)).toBeTruthy();
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

    expect(alertSpy).toHaveBeenCalledWith('Open in Mail?', 'To: team@example.com', [
      expect.objectContaining({ text: 'Cancel' }),
      expect.objectContaining({ text: 'Open' }),
    ]);
    expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('offers each gallery image behind a load control instead of dropping the resource', () => {
    renderReply(
      [
        '```gallery',
        'Reference photo | https://example.com/photo.png',
        '![Chart](https://example.com/chart.png)',
        'Brand colour | #ff8800',
        '```',
      ].join('\n'),
    );

    expect(screen.getAllByText('Reference photo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chart').length).toBeGreaterThan(0);
    expect(screen.getByText('Brand colour')).toBeTruthy();
    expect(screen.getByText('#ff8800')).toBeTruthy();
    expect(screen.getAllByLabelText('Load image from example.com')).toHaveLength(2);
    expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
  });

  it('shows no image link for an unsafe or missing source and loads nothing by itself', () => {
    renderReply(['```gallery', 'Bad | javascript:alert(1)', 'Plain | #123456', '```'].join('\n'));

    expect(screen.queryByRole('link')).toBeNull();
    expect(openUntrustedUrlInAppBrowser).not.toHaveBeenCalled();
  });
});

describe('answer surface fields from the shared classifier', () => {
  it('shows a card grid title as a heading and labels the grid with it', () => {
    renderReply(
      [
        '```cards',
        'title: Launch options',
        'columns: 1',
        'Fast | Ship today',
        'Safe | Ship Friday',
        '```',
      ].join('\n'),
    );

    expect(screen.getByRole('header', { name: 'Launch options' })).toBeTruthy();
    expect(screen.getByLabelText('Launch options').props.testID).toBe('answer-surface-cards');
    expect(screen.getByText('Ship Friday')).toBeTruthy();
    expect(screen.queryByText('title: Launch options')).toBeNull();
  });

  it('lays card tiles out by the columns the fence asks for and the window allows', () => {
    const { width } = Dimensions.get('window');
    expect(width).toBeGreaterThanOrEqual(600);
    expect(width).toBeLessThan(900);
    const grid = (columns: number) =>
      ['```cards', `columns: ${columns}`, 'Fast | Ship today', 'Safe | Ship Friday', '```'].join(
        '\n',
      );

    const single = renderReply(grid(1));
    expect(joinedText(single)).toContain('"width":"100%"');
    expect(joinedText(single)).not.toContain('"width":"48%"');
    single.unmount();

    const triple = renderReply(grid(3));
    expect(joinedText(triple)).toContain('"width":"48%"');
    expect(joinedText(triple)).not.toContain('"width":"31%"');
    triple.unmount();
  });

  it('adds the modes note under a modes fence', () => {
    renderReply(
      ['```modes', 'Focus | Fewer panels', 'Review | Every panel open', '```'].join('\n'),
    );

    expect(screen.getByLabelText('Display modes')).toBeTruthy();
    expect(screen.getByText(MODES_NOTE)).toBeTruthy();
  });

  it('shows the date of a dated timeline step', () => {
    renderReply(
      [
        '```timeline',
        'Design | Mar 4 | Sketch the screens | complete',
        'Build | Write the code | todo',
        '```',
      ].join('\n'),
    );

    expect(screen.getByText('Mar 4')).toBeTruthy();
    expect(screen.getByText('Sketch the screens')).toBeTruthy();
    expect(screen.getByText('Write the code')).toBeTruthy();
  });

  it('keeps follow-up rows untappable while the answer is still being written', () => {
    const onFollowUp = jest.fn();
    const fence = ['```followups', 'Compare prices', 'Show a map', '```'].join('\n');
    const view = render(
      <>{renderMarkdownContent(fence, undefined, { onFollowUp, streaming: true })}</>,
    );

    const row = screen.getByRole('button', { name: 'Compare prices' });
    expect(row.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(row);
    expect(onFollowUp).not.toHaveBeenCalled();

    view.rerender(<>{renderMarkdownContent(fence, undefined, { onFollowUp, streaming: false })}</>);
    const settled = screen.getByRole('button', { name: 'Compare prices' });
    expect(settled.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(settled);
    expect(onFollowUp).toHaveBeenCalledWith('Compare prices');
  });
});
