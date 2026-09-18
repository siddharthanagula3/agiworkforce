import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * The image editor is a hand-rolled dialog with a hand-rolled menu inside it,
 * and generation state changes with no text of its own. None of that is visible
 * to a mouse-driven sweep, so it is pinned here: keyboard operation, the two
 * ARIA contracts the markup claims, and the announcements a screen reader has
 * to hear to know a revision started and landed.
 */

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    admissionFor: () => ({ supports_edit: true }),
    models: [],
    isLoading: false,
  }),
}));

import { getModelsForProvider, isExecutableImageModel } from '@agiworkforce/types';
import { ImageGenerationCard, ShareModal } from '../ImageGenerationCard';

const IMAGE_URL = '/api/files/55555555-5555-4555-8555-555555555555';
const PROMPT = 'a lighthouse at dusk';

// Read from the catalog rather than naming a model: the aspect menu only has
// rows for a model the catalog knows, and a literal id here would rot.
const IMAGE_MODEL_ID = getModelsForProvider('openai', {
  includeDeprecated: false,
  modelTypes: ['image'],
}).filter(isExecutableImageModel)[0]?.id;

function renderCard(onRegenerate?: (opts: unknown) => Promise<string>) {
  return render(
    <ImageGenerationCard
      imageUrl={IMAGE_URL}
      prompt={PROMPT}
      aspectRatio="1:1"
      modelId={IMAGE_MODEL_ID}
      onRegenerate={onRegenerate as never}
    />,
  );
}

async function openEditor(): Promise<HTMLElement> {
  const trigger = screen.getByRole('button', { name: /new version/i });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Revise this image' });
  return dialog;
}

describe('ImageGenerationCard accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('announces that a generation is running while there is no image yet', () => {
    render(<ImageGenerationCard isGenerating aspectRatio="1:1" prompt={PROMPT} />);
    expect(screen.getByRole('status', { name: 'Generating image' })).toBeInTheDocument();
  });

  it('gives the delivered image the prompt as its accessible name', () => {
    renderCard();
    expect(screen.getByAltText(PROMPT)).toBeInTheDocument();
  });

  it('moves focus into the editor and back to the trigger when it closes', async () => {
    renderCard();
    const trigger = screen.getByRole('button', { name: /new version/i });
    const dialog = await openEditor();

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Revise this image' })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps Tab inside the editor, which is what aria-modal promises', async () => {
    renderCard();
    const dialog = await openEditor();
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    const last = focusables[focusables.length - 1]!;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => expect(document.activeElement).toBe(focusables[0]));
  });

  it('runs the aspect-ratio menu from the keyboard and returns focus to its trigger', async () => {
    renderCard();
    await openEditor();

    const aspectTrigger = screen.getByRole('button', { name: 'Aspect ratio' });
    expect(aspectTrigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(aspectTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(aspectTrigger);
    expect(aspectTrigger).toHaveAttribute('aria-expanded', 'true');

    const menu = await screen.findByRole('menu', { name: 'Aspect ratio' });
    const items = screen.getAllByRole('menuitemradio');
    expect(items.length).toBeGreaterThan(1);
    expect(menu.contains(items[0]!)).toBe(true);

    await waitFor(() => expect(document.activeElement).toBe(items[0]));

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Aspect ratio' })).toBeNull());
    expect(document.activeElement).toBe(aspectTrigger);
    // The menu answered Escape; the dialog it sits in stays open.
    expect(screen.getByRole('dialog', { name: 'Revise this image' })).toBeInTheDocument();
  });

  it('marks the aspect ratio the image was generated at', async () => {
    renderCard();
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Aspect ratio' }));
    const checked = screen
      .getAllByRole('menuitemradio')
      .filter((item) => item.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
  });

  it('announces the start and the end of a revision', async () => {
    let resolveRegenerate: ((url: string) => void) | undefined;
    const onRegenerate = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRegenerate = resolve;
        }),
    );
    renderCard(onRegenerate);
    await openEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Aspect ratio' }));
    const unchecked = screen
      .getAllByRole('menuitemradio')
      .find((item) => item.getAttribute('aria-checked') !== 'true')!;
    fireEvent.click(unchecked);

    await waitFor(() =>
      expect(
        screen.getByText('Generating a new version of this image', { selector: 'p' }),
      ).toBeInTheDocument(),
    );

    resolveRegenerate?.('/api/files/66666666-6666-4666-8666-666666666666');

    await waitFor(() =>
      expect(
        screen.getByText('The new version of this image is ready', { selector: 'p' }),
      ).toBeInTheDocument(),
    );
  });

  it('names the video player in the share modal, which native controls cannot do', () => {
    render(
      <ShareModal
        imageUrl="/api/files/clip"
        prompt={PROMPT}
        mediaKind="video"
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(`Preview of ${PROMPT}`)).toHaveAttribute('controls');
  });
});
