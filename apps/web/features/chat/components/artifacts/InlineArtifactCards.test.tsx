import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { useArtifactsStore } from '../../stores/artifacts-store';
import type { ArtifactData } from './ArtifactPreview';
import { InlineArtifactCards } from './InlineArtifactCards';
import {
  INLINE_PREVIEW_DEFAULT_HEIGHT,
  INLINE_PREVIEW_MIN_HEIGHT,
  clampInlinePreviewHeight,
} from './InlineArtifactPreview';

const SANDBOX_ORIGIN = 'https://sandbox.agiworkforce.com';
const VIEWPORT_HEIGHT = 1_000;
const MAX_HEIGHT = 700;

const CALCULATOR: ArtifactData = {
  id: 'artifact-calculator',
  type: 'html',
  title: 'Desk Calculator',
  language: 'html',
  content:
    '<!-- @artifact -->\n<!doctype html><html><head><title>Desk Calculator</title></head><body><main>0</main></body></html>',
};

const BRIEF: ArtifactData = {
  id: 'artifact-brief',
  type: 'document',
  title: 'Launch brief',
  language: 'markdown',
  content: '# Launch brief\n\nShip it.',
};

function frameHeight(): number {
  return Number.parseFloat(screen.getByTestId('inline-artifact-frame').style.height);
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useArtifactsStore.getState().setPanelOpen(false);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('inline preview height', () => {
  it('fits the reported content, never below the floor or above 70% of the viewport', () => {
    expect(clampInlinePreviewHeight(120, VIEWPORT_HEIGHT)).toBe(INLINE_PREVIEW_MIN_HEIGHT);
    expect(clampInlinePreviewHeight(560.4, VIEWPORT_HEIGHT)).toBe(561);
    expect(clampInlinePreviewHeight(4_000, VIEWPORT_HEIGHT)).toBe(MAX_HEIGHT);
    expect(clampInlinePreviewHeight(4_000, 300)).toBe(INLINE_PREVIEW_MIN_HEIGHT);
  });
});

describe('InlineArtifactCards: renderable artifacts', () => {
  it('runs an HTML artifact in the message through the same null-origin sandbox as the panel', () => {
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    const preview = screen.getByTestId('inline-artifact-preview');
    expect(within(preview).getByText('Desk Calculator')).toBeVisible();
    expect(within(preview).getByText('HTML · Artifact')).toBeVisible();
    expect(frameHeight()).toBe(INLINE_PREVIEW_DEFAULT_HEIGHT);

    const frame = preview.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-modals');
    expect(frame?.getAttribute('srcdoc')).toContain('Content-Security-Policy');
    expect(frame?.getAttribute('srcdoc')).toContain('Desk Calculator');
  });

  it('sizes the frame to the height the sandbox renderer reports for its own frame', async () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', SANDBOX_ORIGIN);
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);
    const frame = screen.getByTestId('inline-artifact-preview').querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'content-size', height: 552 },
          origin: SANDBOX_ORIGIN,
          source: frame?.contentWindow ?? null,
        }),
      );
    });
    await waitFor(() => expect(frameHeight()).toBe(552));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'content-size', height: 9_000 },
          origin: SANDBOX_ORIGIN,
          source: frame?.contentWindow ?? null,
        }),
      );
    });
    await waitFor(() => expect(frameHeight()).toBe(MAX_HEIGHT));
  });

  it('ignores a size report from a window that is not its frame', async () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', SANDBOX_ORIGIN);
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'content-size', height: 600 },
          origin: SANDBOX_ORIGIN,
          source: { closed: false } as unknown as Window,
        }),
      );
    });
    await waitFor(() => expect(frameHeight()).toBe(INLINE_PREVIEW_DEFAULT_HEIGHT));
  });

  it('moves the artifact to the panel on Open and leaves only its header in the message', () => {
    render(<InlineArtifactCards artifacts={[CALCULATOR]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open in panel: Desk Calculator' }));

    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(CALCULATOR.id);
    expect(screen.queryByTestId('inline-artifact-frame')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in panel: Desk Calculator' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a stopped artifact as a file card instead of running half a document', () => {
    render(<InlineArtifactCards artifacts={[{ ...CALCULATOR, interrupted: true }]} />);

    expect(screen.queryByTestId('inline-artifact-preview')).toBeNull();
    expect(screen.getByTestId('artifact-file-card')).toBeVisible();
  });
});

describe('InlineArtifactCards: documents and files', () => {
  it('shows a compact file card that opens the document view', () => {
    render(<InlineArtifactCards artifacts={[BRIEF]} />);

    const card = screen.getByTestId('artifact-file-card');
    expect(within(card).getByText('Launch brief')).toBeVisible();
    expect(within(card).getByText('Document · MD')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Open artifact: Launch brief' })).toHaveAccessibleDescription(
      'Document · MD',
    );
    expect(within(card).getByRole('button', { name: 'Download Launch brief' })).toBeVisible();
    expect(card.querySelector('iframe')).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: 'Open artifact: Launch brief' }));
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(BRIEF.id);
  });

  it('draws every card from theme role tokens, never a fixed hue that fails in one theme', () => {
    const { container } = render(<InlineArtifactCards artifacts={[CALCULATOR, BRIEF]} />);

    const classes = Array.from(container.querySelectorAll('[class]'), (node) =>
      node.getAttribute('class'),
    ).join(' ');
    expect(classes).not.toMatch(
      /\b(?:text|bg|border)-(?:orange|sky|violet|fuchsia|emerald|amber)-\d{2,3}\b/u,
    );
  });

  it('caps the message at three artifacts and opens the rest from one row', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...BRIEF,
      id: `artifact-${index}`,
      title: `File ${index}`,
    }));
    render(<InlineArtifactCards artifacts={many} />);

    expect(screen.getAllByTestId('artifact-file-card')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'View 2 more artifacts' }));
    expect(useArtifactsStore.getState().selectedArtifactId).toBe('artifact-3');
    expect(screen.getByRole('button', { name: 'Download all' })).toBeVisible();
  });
});
