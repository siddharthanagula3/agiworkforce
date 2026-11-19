import { fireEvent, render, within } from '@testing-library/react-native';
import type { InteractiveCard, ProductComparisonCardBody } from '@agiworkforce/types';

const mockOpenUntrustedUrl = jest.fn();

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrustedUrl(...args),
}));

import { InteractiveCardBlock } from '../../InteractiveCardBlock';
import { MOBILE_INTERACTIVE_CARD_CAPABILITY } from '../../../utils/clarifyCard';
import { formatProductPrice } from '../ProductComparisonCard';

const BODY: ProductComparisonCardBody = {
  title: 'Noise cancelling headphones',
  checkedAt: '2026-11-14T12:00:00.000Z',
  specLabels: ['Battery', 'Weight'],
  products: [
    {
      id: 'one',
      name: 'Quiet One',
      bestFor: 'Long flights',
      price: { amount: 299, currency: 'USD', sourceUrl: 'https://shop.example/one' },
      merchant: 'Shop Example',
      buyUrl: 'https://shop.example/one/buy',
      specs: ['30 h', '250 g'],
      sources: [{ url: 'https://www.reviews.example/one', title: 'Quiet One review' }],
    },
    {
      id: 'two',
      name: 'Calm Two',
      specs: ['24 h', ''],
      sources: [],
    },
  ],
};

function card(): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'compare',
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: 'Compared headphones', text: 'Quiet One and Calm Two.' },
    producedBy: { toolCallId: 'compare-call', toolName: 'compare_products' },
    recognized: true,
    kind: 'product-comparison.v1',
    body: BODY,
  } as InteractiveCard;
}

function renderCard() {
  return render(
    <InteractiveCardBlock
      cards={[card()]}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles
      messageId="msg"
      conversationId="conv"
    />,
  );
}

describe('product comparison card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenUntrustedUrl.mockResolvedValue(true);
  });

  it('tells the server it renders product comparisons', () => {
    expect(MOBILE_INTERACTIVE_CARD_CAPABILITY.supported).toContain('product-comparison.v1');
  });

  it('shows each product with its price, merchant, best-for line and a missing price', () => {
    const { getByTestId, getAllByTestId, queryByTestId } = renderCard();

    expect(getByTestId('interactive-card-product-comparison')).toBeTruthy();
    expect(queryByTestId('interactive-card-fallback')).toBeNull();
    const [first, second] = getAllByTestId('product-comparison-product');
    const one = within(first!);
    expect(one.getByText('Quiet One')).toBeTruthy();
    expect(one.getByText('Long flights')).toBeTruthy();
    expect(one.getByText(formatProductPrice(BODY.products[0]!.price!))).toBeTruthy();
    expect(one.getByText('  at Shop Example')).toBeTruthy();
    expect(within(second!).getByText('Price not found')).toBeTruthy();
  });

  it('offers no buy or view-product control, because version 1 sells nothing', () => {
    const { queryByText, queryByLabelText, getAllByRole } = renderCard();

    expect(queryByText(/Buy at/)).toBeNull();
    expect(queryByText('View product')).toBeNull();
    expect(queryByLabelText(/Buy/)).toBeNull();
    for (const link of getAllByRole('link')) {
      fireEvent.press(link);
    }
    expect(mockOpenUntrustedUrl).not.toHaveBeenCalledWith('https://shop.example/one/buy');
  });

  it('opens a product source in the in-app browser', () => {
    const { getByLabelText, getByText } = renderCard();

    expect(getByText('reviews.example')).toBeTruthy();
    fireEvent.press(getByLabelText('Source 1, Quiet One review'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith('https://www.reviews.example/one');
  });

  it('lays the specs out by product and marks a missing value', () => {
    const { getByTestId } = renderCard();

    const specs = within(getByTestId('product-comparison-specs'));
    expect(specs.getByText('Battery')).toBeTruthy();
    expect(specs.getByText('30 h')).toBeTruthy();
    expect(specs.getByText('24 h')).toBeTruthy();
    expect(specs.getByText('250 g')).toBeTruthy();
    expect(specs.getByText('Not listed')).toBeTruthy();
  });
});
