import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { InteractiveCard } from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { AnswerUiFollowUpProvider } from './cards/answer-ui/answer-ui-follow-up';
import {
  ANSWER_UI_SEND_NEEDS_SAVED_CHAT,
  ANSWER_UI_SEND_WAITS_FOR_REPLY,
  InteractiveCardBlock,
} from './InteractiveCardBlock';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const CARD_ID = 'answer-ui-toolu_5';

const envelope = {
  schemaVersion: 1,
  cardId: CARD_ID,
  kind: 'answer-ui.v1',
  createdAt: '2026-10-25T10:00:00.000Z',
  fallback: { headline: 'Budget', text: 'Rent: $1,500 (from 0 to 4000)' },
  producedBy: { toolCallId: 'toolu_5', toolName: 'render_answer_ui' },
  body: {
    blocks: [
      {
        type: 'slider',
        id: 'rent',
        label: 'Rent',
        min: 0,
        max: 4000,
        step: 100,
        value: 1500,
        unit: '$',
        unitPosition: 'prefix',
      },
      {
        type: 'actions',
        id: 'go',
        buttons: [
          {
            id: 'apply',
            label: 'Apply',
            action: 'send',
            template: 'Use rent {rent}',
            primary: true,
          },
        ],
      },
    ],
  },
};

function decode(raw: unknown): InteractiveCard {
  const card = parseInteractiveCardDelta({ card: raw });
  if (!card?.recognized) throw new Error('fixture did not parse');
  return card;
}

function seed(card: InteractiveCard, options: { isTemporary?: boolean } = {}): void {
  const message: Message = {
    id: MESSAGE_ID,
    role: 'assistant',
    content: 'Move the slider.',
    createdAt: '2026-10-25T10:00:00.000Z',
    metadata: { interactiveCards: [card] },
  };
  const store = useChatStore.getState();
  store.setConversations([
    {
      id: CONVERSATION_ID,
      title: 'Budget',
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
      ...(options.isTemporary ? { isTemporary: true } : {}),
    },
  ]);
  store.setActiveConversationWithMessages(CONVERSATION_ID, [message]);
}

describe('InteractiveCardBlock with an answer UI card', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the server to compose the message, then sends it as a normal user turn', async () => {
    const card = decode(envelope);
    seed(card);
    const sendFollowUp = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, message: 'Use rent $2,000' }), { status: 200 }),
    );

    render(
      <AnswerUiFollowUpProvider value={sendFollowUp}>
        <InteractiveCardBlock cards={[card]} />
      </AnswerUiFollowUpProvider>,
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Rent' }), { target: { value: '2000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/interactive-cards/respond');
    expect(JSON.parse(String(init.body))).toEqual({
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      card_id: CARD_ID,
      response: { kind: 'message', action_id: 'apply', values: { rent: 2000 } },
    });
    expect(sendFollowUp).toHaveBeenCalledWith('Use rent $2,000');
  });

  it('sends nothing when the server refuses the values', async () => {
    const card = decode(envelope);
    seed(card);
    const sendFollowUp = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 400 }));

    render(
      <AnswerUiFollowUpProvider value={sendFollowUp}>
        <InteractiveCardBlock cards={[card]} />
      </AnswerUiFollowUpProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });
    expect(sendFollowUp).not.toHaveBeenCalled();
  });

  it('keeps sending disabled while the conversation streams, controls stay live', () => {
    const card = decode(envelope);
    seed(card);
    act(() => {
      useChatStore.getState().startStreaming(MESSAGE_ID, CONVERSATION_ID);
    });

    render(
      <AnswerUiFollowUpProvider value={vi.fn()}>
        <InteractiveCardBlock cards={[card]} />
      </AnswerUiFollowUpProvider>,
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByText(ANSWER_UI_SEND_WAITS_FOR_REPLY)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Rent' })).toBeEnabled();
  });

  it('explains that a temporary chat cannot send from the card', () => {
    const card = decode(envelope);
    seed(card, { isTemporary: true });
    render(
      <AnswerUiFollowUpProvider value={vi.fn()}>
        <InteractiveCardBlock cards={[card]} />
      </AnswerUiFollowUpProvider>,
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByText(ANSWER_UI_SEND_NEEDS_SAVED_CHAT)).toBeInTheDocument();
  });

  it('replays a persisted card with its controls back at their starting values', () => {
    const card = decode(envelope);
    seed(card);
    const first = render(<InteractiveCardBlock cards={[card]} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Rent' }), { target: { value: '3000' } });
    first.unmount();

    render(<InteractiveCardBlock cards={[decode(JSON.parse(JSON.stringify(envelope)))]} />);
    expect(screen.getByRole('slider', { name: 'Rent' })).toHaveValue('1500');
  });
});
