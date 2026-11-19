import { fireEvent, render } from '@testing-library/react-native';
import { Pressable as MockPressable } from 'react-native';
import type { InteractiveCard } from '@agiworkforce/types';

const mockFullScreenProps = jest.fn();

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

jest.mock('../GeneratedImage', () => ({
  GeneratedImage: ({ imageUrl, onPress }: { imageUrl: string; onPress: () => void }) => (
    <MockPressable testID={`generated-image-${imageUrl}`} onPress={onPress} />
  ),
}));

jest.mock('../ImageFullScreen', () => ({
  ImageFullScreen: (props: Record<string, unknown>) => {
    mockFullScreenProps(props);
    return null;
  },
}));

import { InteractiveCardBlock } from '../InteractiveCardBlock';

const IMAGE_URL = 'https://cdn.agi.example/generated/card-image.png';

const imageCard: InteractiveCard = {
  schemaVersion: 1,
  cardId: 'fixture-image-call',
  createdAt: '2026-11-14T12:00:00.000Z',
  fallback: { headline: 'A lighthouse at dusk', text: 'Generated image.' },
  producedBy: { toolCallId: 'fixture-image-call', toolName: 'generate_image' },
  recognized: true,
  kind: 'image.v1',
  body: {
    operation: 'generate',
    prompt: 'A lighthouse at dusk',
    images: [{ assetId: 'asset-1', url: IMAGE_URL }],
  },
};

function lastFullScreenProps(): Record<string, unknown> {
  const calls = mockFullScreenProps.mock.calls;
  return calls[calls.length - 1]?.[0] as Record<string, unknown>;
}

describe('an image inside an interactive card', () => {
  beforeEach(() => mockFullScreenProps.mockClear());

  it('opens full screen with a report target for the message that made it', () => {
    const screen = render(
      <InteractiveCardBlock
        cards={[imageCard]}
        tileBaseUrl="https://app.agi.example/"
        canLoadManagedCloudTiles={false}
        messageId="msg-card"
        conversationId="conv-card"
      />,
    );

    expect(lastFullScreenProps().reportTarget).toBeUndefined();

    fireEvent.press(screen.getByTestId(`generated-image-${IMAGE_URL}`));

    expect(lastFullScreenProps()).toEqual(
      expect.objectContaining({
        imageUrl: IMAGE_URL,
        visible: true,
        reportTarget: {
          messageId: 'msg-card',
          conversationId: 'conv-card',
          contentExcerpt: 'A lighthouse at dusk',
          asset: { kind: 'image', url: IMAGE_URL },
        },
      }),
    );
  });
});
