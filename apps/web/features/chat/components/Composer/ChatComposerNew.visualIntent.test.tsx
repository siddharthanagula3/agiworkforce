import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew, resetSendPendingFlagForTests } from './ChatComposerNew';
import { useChatStore } from '@shared/stores/web-chat-store';
import { getProviderOfferings } from '@agiworkforce/types';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@shared/stores/web-auth-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: () => ({ state: 'enabled' }),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

const CONVERSATION_ID = 'visual-intent-conversation';

function send(text: string) {
  const input = screen.getByRole('textbox', { name: /message input/i });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

type OnSend = React.ComponentProps<typeof ChatComposerNew>['onSend'];
type OnGenerateImage = NonNullable<React.ComponentProps<typeof ChatComposerNew>['onGenerateImage']>;

function renderInImageMode(handlers: { onSend: OnSend; onGenerateImage: OnGenerateImage }) {
  useChatStore.getState().setComposerToggles({ imageMode: true }, CONVERSATION_ID);
  render(
    <ChatComposerNew
      onSend={handlers.onSend}
      onGenerateImage={handlers.onGenerateImage}
      conversationId={CONVERSATION_ID}
    />,
  );
}

beforeEach(() => {
  useChatStore.getState().reset();
  useModelStore.getState().setSelectedModelId('auto');
  resetSendPendingFlagForTests();
  useBillingStore.setState({
    subscription: {
      tier: 'pro',
      display_name: 'Pro',
      status: 'active',
      current_period_end: null,
      plan_name: 'Pro',
    },
    featureFlags: { generic_web_search: true, advanced_model_access: true },
  });
});

describe('image mode routes a structured visual to Artifacts, not to a raster model', () => {
  it('keeps the authored prompt visible and carries the Mermaid directive as hidden metadata', () => {
    const onSend = vi.fn<OnSend>();
    const onGenerateImage = vi.fn<OnGenerateImage>();
    renderInImageMode({ onSend, onGenerateImage });

    send('a flowchart of our onboarding steps');

    expect(onGenerateImage).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toBe('a flowchart of our onboarding steps');
    expect(onSend.mock.calls[0]?.[3]?.artifactInstruction).toContain('```mermaid');
    expect(onSend.mock.calls[0]?.[3]?.artifactInstruction).toContain('%% @artifact');
  });

  it('still reaches the raster model for a photographic request', () => {
    const onSend = vi.fn<OnSend>();
    const onGenerateImage = vi.fn<OnGenerateImage>();
    renderInImageMode({ onSend, onGenerateImage });

    send('a photo of a golden retriever on a beach');

    expect(onSend).not.toHaveBeenCalled();
    expect(onGenerateImage).toHaveBeenCalledTimes(1);
    expect(onGenerateImage.mock.calls[0]?.[0]).toBe('a photo of a golden retriever on a beach');
  });

  it('keeps a photo of a diagram on the raster path', () => {
    const onSend = vi.fn<OnSend>();
    const onGenerateImage = vi.fn<OnGenerateImage>();
    renderInImageMode({ onSend, onGenerateImage });

    send('a photo of a whiteboard flowchart');

    expect(onSend).not.toHaveBeenCalled();
    expect(onGenerateImage).toHaveBeenCalledTimes(1);
  });
});

describe('explicit free model media routing', () => {
  it.each(['image-sync', 'video-async'])(
    'keeps %s selection out of paid media modes',
    (protocol) => {
      const offering = Object.entries(getProviderOfferings()).find(
        ([, entry]) => entry.quotaProbeProtocol === protocol,
      )![0];
      useModelStore.getState().setSelectedModelId(offering);
      useChatStore
        .getState()
        .setComposerToggles(
          { imageMode: protocol === 'image-sync', videoMode: protocol === 'video-async' },
          CONVERSATION_ID,
        );
      const onSend = vi.fn<OnSend>();
      const onGenerateImage = vi.fn();
      const onGenerateVideo = vi.fn();
      render(
        <ChatComposerNew
          onSend={onSend}
          onGenerateImage={onGenerateImage}
          onGenerateVideo={onGenerateVideo}
          conversationId={CONVERSATION_ID}
        />,
      );
      send('Draw a blue boat');
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onGenerateImage).not.toHaveBeenCalled();
      expect(onGenerateVideo).not.toHaveBeenCalled();
      expect(useModelStore.getState().selectedModelId).toBe(offering);
    },
  );
});
