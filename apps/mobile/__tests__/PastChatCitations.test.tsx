import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { PastChatCitations } from '../src/features/chat/components/PastChatCitations';
import {
  pastChatCitationsFromMetadata,
  readPastChatCitationsHeader,
  readProjectFileCitationsHeader,
} from '../src/features/chat/utils/referenceCitations';

const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000e1';
const MESSAGE_ID = '0190a000-0000-7000-8000-0000000000e2';

const ROW = {
  id: 'source-1',
  conversationId: CONVERSATION_ID,
  messageId: MESSAGE_ID,
  title: 'Planning the tulip beds',
  createdAt: '2026-10-02T12:00:00.000Z',
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function headers(values: Record<string, string>): Pick<Headers, 'get'> {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

beforeEach(() => mockPush.mockReset());

describe('previous chats an answer drew on', () => {
  it('reads the stored list and drops rows that cannot be opened', () => {
    expect(
      pastChatCitationsFromMetadata({
        pastChatSources: [ROW, { ...ROW, id: 'x', messageId: '' }, { title: 'No ids' }, 'text'],
      }),
    ).toEqual([ROW]);
    expect(pastChatCitationsFromMetadata(null)).toEqual([]);
    expect(pastChatCitationsFromMetadata({ pastChatSources: 'nope' })).toEqual([]);
  });

  it('shows each chat by its title and date', () => {
    const screen = render(<PastChatCitations citations={[ROW]} />);
    const chip = screen.getByLabelText(/^Open the source conversation Planning the tulip beds, /);
    expect(chip.props.accessibilityRole).toBe('link');
    expect(screen.getByText('Planning the tulip beds')).toBeTruthy();
    expect(screen.getByText(/^· /)).toBeTruthy();
  });

  it('opens that chat at the cited message', () => {
    const screen = render(<PastChatCitations citations={[ROW]} />);
    fireEvent.press(screen.getByText('Planning the tulip beds'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: CONVERSATION_ID, highlightMessage: MESSAGE_ID },
    });
  });

  it('shows nothing for an answer that used no earlier chat', () => {
    const screen = render(<PastChatCitations citations={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('gives each chip a 44 point tap area', () => {
    const screen = render(<PastChatCitations citations={[ROW]} />);
    const chip = screen.getByLabelText(/^Open the source conversation/);
    const style = Object.assign({}, ...[chip.props.style].flat());
    expect(
      style.minHeight + chip.props.hitSlop.top + chip.props.hitSlop.bottom,
    ).toBeGreaterThanOrEqual(44);
  });
});

describe('the reference headers of a live turn', () => {
  it('reads the past chats from the response header', () => {
    expect(
      readPastChatCitationsHeader(
        headers({ 'x-agi-past-chat-citations': encode([ROW, { title: 'broken' }]) }),
      ),
    ).toEqual([ROW]);
  });

  it('reads the project files with their page from the response header', () => {
    expect(
      readProjectFileCitationsHeader(
        headers({
          'x-agi-project-sources': encode([
            { fileName: 'report.pdf', fileId: 'f1', projectId: 'p1', anchor: { page: 3 } },
          ]),
        }),
      ),
    ).toEqual([{ fileName: 'report.pdf', fileId: 'f1', projectId: 'p1', anchor: { page: 3 } }]);
  });

  it('treats a missing or damaged header as no citations', () => {
    expect(readPastChatCitationsHeader(headers({}))).toEqual([]);
    expect(
      readPastChatCitationsHeader(headers({ 'x-agi-past-chat-citations': '%%%not-base64' })),
    ).toEqual([]);
    expect(
      readProjectFileCitationsHeader(headers({ 'x-agi-project-sources': encode('text') })),
    ).toEqual([]);
  });
});

describe('the shared past chat reading', () => {
  it('serves the shared names and parser through the mobile entry', () => {
    const shared = jest.requireActual('@agiworkforce/types');
    const local = jest.requireActual('../src/features/chat/utils/referenceCitations');
    expect(local.PAST_CHAT_CITATIONS_HEADER).toBe(shared.PAST_CHAT_CITATIONS_HEADER);
    expect(local.PAST_CHAT_CITATIONS_METADATA_KEY).toBe(shared.PAST_CHAT_CITATIONS_METADATA_KEY);
    expect(local.PAST_CHAT_HIGHLIGHT_PARAM).toBe(shared.PAST_CHAT_HIGHLIGHT_PARAM);
    expect(local.parsePastChatCitations).toBe(shared.parsePastChatCitations);
    expect(local.pastChatCitationsFromMetadata).toBe(shared.pastChatCitationsFromMetadata);
    expect(local.pastChatCitationDate).toBe(shared.pastChatCitationDate);
  });
});
