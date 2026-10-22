import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { managedMediaVideoInputImageLimit } from '@agiworkforce/cloud-contracts';
import { getModelMetadataById } from '@agiworkforce/types';
import { onePixelPng } from '@features/chat/lib/__tests__/picture-fixtures';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { ChatComposerNew, VIDEO_MODELS, resetSendPendingFlagForTests } from './ChatComposerNew';

const mediaAvailability = vi.hoisted(() => ({
  admissionFor: vi.fn(),
}));

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
    admissionFor: mediaAvailability.admissionFor,
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

type OnGenerateVideo = NonNullable<React.ComponentProps<typeof ChatComposerNew>['onGenerateVideo']>;

const CONVERSATION_ID = 'video-input-conversation';

const capableModel = VIDEO_MODELS.find(
  (model) => managedMediaVideoInputImageLimit('openrouter', getModelMetadataById(model.id)) > 0,
);
const promptOnlyModel = VIDEO_MODELS.find((model) => model.id !== capableModel?.id);
const capableLimit = managedMediaVideoInputImageLimit(
  'openrouter',
  getModelMetadataById(capableModel!.id),
);

function admitAll(inputProvider: string) {
  mediaAvailability.admissionFor.mockImplementation((modelId: string) => ({
    model_id: modelId,
    name: modelId,
    kind: 'video',
    provider: modelId === capableModel!.id ? inputProvider : 'fixture',
    state: 'enabled',
  }));
}

function attach(...files: File[]) {
  fireEvent.change(screen.getByLabelText('File upload'), { target: { files } });
}

function renderComposer(onGenerateVideo = vi.fn<OnGenerateVideo>()) {
  render(
    <ChatComposerNew
      onSend={vi.fn()}
      onGenerateVideo={onGenerateVideo}
      conversationId={CONVERSATION_ID}
    />,
  );
  return onGenerateVideo;
}

function enterVideoMode() {
  useChatStore.getState().setComposerToggles({ videoMode: true }, CONVERSATION_ID);
}

async function submit(prompt: string) {
  const input = screen.getByRole('textbox', { name: /message input/i });
  fireEvent.change(input, { target: { value: prompt } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  useChatStore.getState().reset();
  useModelStore.getState().setSelectedModelId('auto');
  resetSendPendingFlagForTests();
  mediaAvailability.admissionFor.mockReset();
  admitAll('openrouter');
  useBillingStore.setState({
    subscription: {
      tier: 'max_15x',
      display_name: 'Max 20x',
      status: 'active',
      current_period_end: null,
      plan_name: 'Max 20x',
    },
    featureFlags: { generic_web_search: true, advanced_model_access: true },
  });
});

describe('video input images in the composer', () => {
  it('offers a Video chip for an attached image and enters video mode with the image kept', async () => {
    renderComposer();
    expect(
      screen.queryByRole('button', { name: /make a video from the attached image/i }),
    ).toBeNull();

    attach(onePixelPng('still.png'));
    const chip = await screen.findByRole('button', {
      name: /make a video from the attached image/i,
    });
    fireEvent.click(chip);

    expect(screen.getByRole('button', { name: /exit video generation mode/i })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /how the attached image is used/i }),
    ).toHaveTextContent('First frame');
    expect(screen.queryByTestId('media-attachment-conflict')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /make a video from the attached image/i }),
    ).toBeNull();
  });

  it('carries the attached image as the first frame of the request', async () => {
    enterVideoMode();
    const onGenerateVideo = renderComposer();
    attach(onePixelPng('still.png'));
    await screen.findByRole('button', { name: /how the attached image is used/i });

    await submit('a slow push in');

    await waitFor(() => expect(onGenerateVideo).toHaveBeenCalledTimes(1));
    const [prompt, options] = onGenerateVideo.mock.calls[0]!;
    expect(prompt).toBe('a slow push in');
    expect(options?.modelId).toBe(capableModel!.id);
    expect(options?.inputImages).toEqual({
      kind: 'first_frame',
      imageBase64: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
    });
  });

  it('sends the image as a reference when the user picks that', async () => {
    enterVideoMode();
    const onGenerateVideo = renderComposer();
    attach(onePixelPng('still.png'));
    fireEvent.click(await screen.findByRole('button', { name: /how the attached image is used/i }));
    fireEvent.click(screen.getByRole('button', { name: /reference image/i }));

    await submit('same style, new scene');

    await waitFor(() => expect(onGenerateVideo).toHaveBeenCalledTimes(1));
    expect(onGenerateVideo.mock.calls[0]![1]?.inputImages).toEqual({
      kind: 'reference',
      imagesBase64: [expect.any(String)],
    });
  });

  it('treats several images as references with no first-frame choice', async () => {
    enterVideoMode();
    const onGenerateVideo = renderComposer();
    attach(onePixelPng('a.png'), onePixelPng('b.png'));
    await screen.findByText('Reference images');
    expect(screen.queryByRole('button', { name: /how the attached image is used/i })).toBeNull();

    await submit('blend them');

    await waitFor(() => expect(onGenerateVideo).toHaveBeenCalledTimes(1));
    expect(onGenerateVideo.mock.calls[0]![1]?.inputImages).toEqual({
      kind: 'reference',
      imagesBase64: [expect.any(String), expect.any(String)],
    });
  });

  it('stops at the model limit and says how many were attached', async () => {
    enterVideoMode();
    renderComposer();
    const files = Array.from({ length: capableLimit + 1 }, (_, index) =>
      onePixelPng(`still-${index}.png`),
    );
    attach(...files);

    expect(
      await screen.findByText(
        `Video takes up to ${capableLimit} PNG, JPEG or WebP images, so only ${capableLimit} of ${capableLimit + 1} were attached.`,
      ),
    ).toBeVisible();
    await screen.findByText('Reference images');
    expect(screen.getAllByLabelText(/remove still-/i)).toHaveLength(capableLimit);
  });

  it('refuses a file that is not a PNG, JPEG or WebP image', async () => {
    enterVideoMode();
    renderComposer();
    attach(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByText(/Video takes PNG, JPEG or WebP images only/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /how the attached image is used/i })).toBeNull();
  });

  it('hides the Video chip when no model takes images', async () => {
    admitAll('fixture');
    renderComposer();
    attach(onePixelPng('still.png'));
    await screen.findByLabelText(/remove still\.png/i);
    expect(
      screen.queryByRole('button', { name: /make a video from the attached image/i }),
    ).toBeNull();
  });

  it('keeps attaching closed in video mode for a model that takes no images', async () => {
    admitAll('fixture');
    enterVideoMode();
    renderComposer();
    attach(onePixelPng('still.png'));

    expect(await screen.findByText(/Video generation works from your prompt only/)).toBeVisible();
    expect(screen.queryByLabelText(/remove still\.png/i)).toBeNull();
  });

  it('offers the capable model when the picked one takes no images', async () => {
    renderComposer();
    attach(onePixelPng('still.png'));
    fireEvent.click(
      await screen.findByRole('button', { name: /make a video from the attached image/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /select video model/i }));
    fireEvent.click(screen.getByRole('button', { name: promptOnlyModel!.label }));

    const conflict = await screen.findByTestId('media-attachment-conflict');
    fireEvent.click(screen.getByRole('button', { name: `Use ${capableModel!.label}` }));

    await waitFor(() => expect(screen.queryByTestId('media-attachment-conflict')).toBeNull());
    expect(conflict).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /how the attached image is used/i })).toBeVisible();
  });
});
