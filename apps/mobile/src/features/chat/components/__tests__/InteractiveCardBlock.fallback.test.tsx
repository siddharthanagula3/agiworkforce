import { render } from '@testing-library/react-native';
import type { InteractiveCard } from '@agiworkforce/types';

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

import { InteractiveCardBlock } from '../InteractiveCardBlock';
import { MOBILE_INTERACTIVE_CARD_CAPABILITY } from '../../utils/clarifyCard';

function unknownCard(cardId: string, kind: string): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId,
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: `Headline ${cardId}`, text: `Text ${cardId}` },
    producedBy: { toolCallId: `call-${cardId}`, toolName: 'tool' },
    recognized: false,
    kind,
    body: {},
  } as unknown as InteractiveCard;
}

function renderBlock(
  cards: InteractiveCard[],
  extra: Partial<Parameters<typeof InteractiveCardBlock>[0]> = {},
) {
  return render(
    <InteractiveCardBlock
      cards={cards}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={false}
      messageId="msg"
      conversationId="conv"
      {...extra}
    />,
  );
}

describe('InteractiveCardBlock fallback and placement', () => {
  it('shows an unrecognised card as its headline and text with no control in it', () => {
    const { getByTestId, getByText, queryAllByRole } = renderBlock([
      unknownCard('a', 'future-card.v9'),
    ]);

    expect(getByTestId('interactive-card-fallback')).toBeTruthy();
    expect(getByText('Headline a')).toBeTruthy();
    expect(getByText('Text a')).toBeTruthy();
    expect(queryAllByRole('button')).toHaveLength(0);
    expect(queryAllByRole('link')).toHaveLength(0);
  });

  it('places a card by its recorded text offset when the message has one', () => {
    const cards = [unknownCard('lead', 'future-card.v9'), unknownCard('trail', 'future-card.v9')];
    const textOffsets = { lead: 0, trail: 120 };

    const before = renderBlock(cards, { placement: 'before-prose', textOffsets });
    expect(before.getByText('Headline lead')).toBeTruthy();
    expect(before.queryByText('Headline trail')).toBeNull();
    before.unmount();

    const after = renderBlock(cards, { placement: 'after-prose', textOffsets });
    expect(after.getByText('Headline trail')).toBeTruthy();
    expect(after.queryByText('Headline lead')).toBeNull();
  });

  it('tells the server it renders places cards', () => {
    expect(MOBILE_INTERACTIVE_CARD_CAPABILITY.supported).toContain('places.v1');
  });
});
