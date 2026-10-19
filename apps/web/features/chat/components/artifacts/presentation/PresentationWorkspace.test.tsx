import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationWorkspace } from './PresentationWorkspace';
import { parseDeck, slideSegments } from './deck-model';
import { parseShapes } from './deck-shapes';

const DECK =
  '# Launch\n\nThe plan\n\n---\n\n## Market\n\n- Big\n- Growing\n\n---\n\n## Ask\n\nFunding';

function renderDeck(overrides: Partial<Parameters<typeof PresentationWorkspace>[0]> = {}) {
  const onSave = vi.fn();
  const onRequestEdits = vi.fn(() => true);
  const view = render(
    <PresentationWorkspace
      title="Pitch"
      content={DECK}
      editable
      handEdited={false}
      onSave={onSave}
      onRequestEdits={onRequestEdits}
      {...overrides}
    />,
  );
  return { onSave, onRequestEdits, ...view };
}

function savedDeck(onSave: ReturnType<typeof vi.fn>) {
  const last = onSave.mock.calls.at(-1) as [string] | undefined;
  if (!last) throw new Error('nothing was saved');
  return parseDeck(last[0]);
}

function openMenu(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
}

describe('PresentationWorkspace', () => {
  it('shows the first slide and a thumbnail per slide', () => {
    renderDeck();
    const thumbs = within(screen.getByTestId('deck-thumbnails')).getAllByRole('button');
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]).toHaveAttribute('aria-current', 'true');
    expect(thumbs[1]).toHaveAccessibleName('Slide 2: Market');
  });

  it('applies a theme as a saved version of the deck', () => {
    const { onSave } = renderDeck();
    openMenu('deck-theme-menu');
    fireEvent.click(screen.getByTestId('deck-menu-theme-midnight'));
    const deck = savedDeck(onSave);
    expect(deck.meta['theme']).toBe('midnight');
    expect(deck.slides).toHaveLength(3);
  });

  it('applies a saved brand to the deck', () => {
    const { onSave } = renderDeck({
      brandThemes: [
        {
          id: 'acme',
          name: 'Acme',
          meta: {
            theme: 'custom',
            name: 'Acme',
            bg: '#101820',
            text: '#ffffff',
            accent: '#f2aa4c',
          },
        },
      ],
    });
    openMenu('deck-theme-menu');
    fireEvent.click(screen.getByTestId('deck-menu-brand-acme'));
    expect(savedDeck(onSave).meta).toMatchObject({ theme: 'custom', bg: '#101820', name: 'Acme' });
  });

  it('inserts a table, a chart and a diagram on the current slide', () => {
    const { onSave } = renderDeck();
    fireEvent.click(within(screen.getByTestId('deck-thumbnails')).getAllByRole('button')[1]!);
    openMenu('deck-insert-menu');
    fireEvent.click(screen.getByTestId('deck-menu-insert-table'));
    expect(savedDeck(onSave).slides[1]).toContain('| Item | Detail | Owner |');

    openMenu('deck-insert-menu');
    fireEvent.click(screen.getByTestId('deck-menu-insert-chart'));
    expect(slideSegments(savedDeck(onSave).slides[1]!).some((s) => s.kind === 'chart')).toBe(true);

    openMenu('deck-insert-menu');
    fireEvent.click(screen.getByTestId('deck-menu-insert-diagram'));
    expect(savedDeck(onSave).slides[1]).toContain('```mermaid');
  });

  it('adds a shape, moves it with the keyboard and saves on Done', () => {
    const { onSave } = renderDeck();
    openMenu('deck-insert-menu');
    fireEvent.click(screen.getByTestId('deck-menu-insert-shape-diamond'));
    expect(onSave).not.toHaveBeenCalled();
    const shape = screen.getByRole('button', { name: 'Diamond' });
    fireEvent.keyDown(shape, { key: 'ArrowRight', shiftKey: true });
    fireEvent.change(screen.getByTestId('deck-shape-label'), { target: { value: 'Go?' } });
    fireEvent.click(screen.getByTestId('deck-finish-editing'));

    const segment = slideSegments(savedDeck(onSave).slides[0]!).find((s) => s.kind === 'shapes');
    const shapes = parseShapes(segment && segment.kind !== 'markdown' ? segment.source : '[]');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ kind: 'diamond', x: 40, text: 'Go?' });
  });

  it('edits slide text in place and saves it as the slide', async () => {
    const { onSave } = renderDeck();
    fireEvent.click(screen.getByTestId('deck-edit-slide'));
    const textStyle = (await screen.findByTestId('document-text-style')) as HTMLSelectElement;
    expect(textStyle.value).toBe('h1');
    fireEvent.change(textStyle, { target: { value: 'h2' } });
    await waitFor(() => expect(textStyle.value).toBe('h2'));
    fireEvent.click(screen.getByTestId('deck-finish-editing'));
    expect(savedDeck(onSave).slides[0]!.startsWith('## Launch')).toBe(true);
  });

  it('edits chart data in a grid', () => {
    const { onSave, rerender } = renderDeck();
    openMenu('deck-insert-menu');
    fireEvent.click(screen.getByTestId('deck-menu-insert-chart'));
    const withChart = (onSave.mock.calls.at(-1) as [string])[0];
    rerender(
      <PresentationWorkspace
        title="Pitch"
        content={withChart}
        editable
        handEdited
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByTestId('deck-edit-chart'));
    fireEvent.change(screen.getByLabelText('value, row 1'), { target: { value: '99' } });
    fireEvent.click(screen.getByTestId('chart-data-apply'));
    const chart = slideSegments(savedDeck(onSave).slides[0]!).find((s) => s.kind === 'chart');
    expect(chart && chart.kind !== 'markdown' ? JSON.parse(chart.source).data[0].value : null).toBe(
      99,
    );
  });

  it('asks the assistant to change only the current slide', () => {
    const { onRequestEdits } = renderDeck();
    fireEvent.click(within(screen.getByTestId('deck-thumbnails')).getAllByRole('button')[2]!);
    fireEvent.click(screen.getByTestId('deck-ask-slide'));
    fireEvent.change(screen.getByPlaceholderText('What should change on slide 3?'), {
      target: { value: 'Name the amount' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change request' }));
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('Change only slide 3 of 3');
    expect(prompt).toContain('## Ask');
    expect(prompt).toContain('Requested change: Name the amount');
    expect(prompt).not.toContain('edited since you last wrote it');
  });

  it('rewrites the slide in one click and carries the current deck after hand edits', () => {
    const { onRequestEdits } = renderDeck({ handEdited: true });
    fireEvent.click(screen.getByTestId('deck-ask-slide'));
    fireEvent.click(screen.getByTestId('deck-rewrite-slide'));
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('Rewrite this slide');
    expect(prompt).toContain('edited since you last wrote it');
  });

  it('deletes, duplicates and reorders slides from the Slide menu', () => {
    const saves: string[] = [];
    function Harness() {
      const [content, setContent] = useState(DECK);
      return (
        <PresentationWorkspace
          title="Pitch"
          content={content}
          editable
          handEdited={false}
          onSave={(next) => {
            saves.push(next);
            setContent(next);
          }}
        />
      );
    }
    render(<Harness />);
    const latest = () => parseDeck(saves.at(-1)!);
    openMenu('deck-slide-menu');
    fireEvent.click(screen.getByTestId('deck-menu-slide-duplicate'));
    expect(latest().slides).toHaveLength(4);
    openMenu('deck-slide-menu');
    fireEvent.click(screen.getByTestId('deck-menu-slide-move-forward'));
    expect(latest().slides.map((slide) => slide.split('\n')[0])).toEqual([
      '# Launch',
      '## Market',
      '# Launch',
      '## Ask',
    ]);
    openMenu('deck-slide-menu');
    fireEvent.click(screen.getByTestId('deck-menu-slide-delete'));
    expect(latest().slides).toHaveLength(3);
  });

  it('offers no editing controls on a read-only version', () => {
    renderDeck({ editable: false });
    expect(screen.queryByTestId('deck-edit-slide')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deck-theme-menu')).not.toBeInTheDocument();
  });
});
