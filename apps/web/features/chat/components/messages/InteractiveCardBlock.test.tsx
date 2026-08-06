import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InteractiveCard } from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { InteractiveCardBlock } from './InteractiveCardBlock';

/**
 * Slice 1's "done": a card-bearing SSE delta reaches the transcript and renders
 * its server-authored fallback inside card chrome, with the assistant's prose
 * intact around it.
 *
 * Every card renders the fallback in this slice, because no kind-specific
 * renderer is registered yet. That is deliberate — the degradation path ships
 * before any producer, so it is exercised while it is the only path there is
 * rather than being retrofitted the first time a body fails validation.
 *
 * The fixtures are built by running real payloads through the real parser, not
 * by hand-constructing the parsed union. A test that skips the parser would
 * still pass if the parser started dropping cards.
 */

const envelope = {
  schemaVersion: 1,
  cardId: 'toolu_01abc',
  kind: 'clarify.v1',
  createdAt: '2026-08-05T10:00:00.000Z',
  fallback: {
    headline: 'A few questions about your trip',
    text: 'What kind of day are you in the mood for?\nWho is coming along?\nHow will you get around?',
  },
  producedBy: { toolCallId: 'toolu_01abc', toolName: 'ask_clarifying_questions' },
  body: {
    questions: [
      {
        id: 'q1',
        header: 'Mood',
        question: 'What kind of day are you in the mood for?',
        options: [
          { id: 'o1', label: 'Relaxed', description: 'Slow pace' },
          { id: 'o2', label: 'Packed', description: 'See everything' },
        ],
        multiSelect: false,
        isOther: true,
        isSecret: false,
      },
    ],
    state: { status: 'pending' },
  },
};

/** Decode exactly as the stream hook does: one `x_interactive_card` delta. */
function decodeDelta(raw: unknown): InteractiveCard {
  const card = parseInteractiveCardDelta({ card: raw });
  if (!card) throw new Error('fixture did not parse as an envelope');
  return card;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('InteractiveCardBlock', () => {
  it('renders nothing when a message carries no cards', () => {
    const { container } = render(<InteractiveCardBlock cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the authored fallback for a recognized card with no renderer yet', () => {
    render(<InteractiveCardBlock cards={[decodeDelta(envelope)]} />);
    expect(screen.getByText('A few questions about your trip')).toBeInTheDocument();
    expect(screen.getByText(/Who is coming along\?/)).toBeInTheDocument();
  });

  it('renders the fallback for a kind this build has never heard of', () => {
    const unknown = clone(envelope);
    unknown.kind = 'weather.v1';
    render(<InteractiveCardBlock cards={[decodeDelta(unknown)]} />);

    const card = screen.getByTestId('interactive-card-fallback');
    expect(card).toHaveAttribute('data-card-recognized', 'false');
    expect(card).toHaveAttribute('data-card-kind', 'weather.v1');
    // The message is never blank: the words the server authored still show.
    expect(screen.getByText(/How will you get around\?/)).toBeInTheDocument();
  });

  it('renders the fallback for a newer schemaVersion rather than dropping the card', () => {
    const newer = clone(envelope);
    newer.schemaVersion = 2;
    render(<InteractiveCardBlock cards={[decodeDelta(newer)]} />);
    expect(screen.getByTestId('interactive-card-fallback')).toHaveAttribute(
      'data-card-recognized',
      'false',
    );
    expect(screen.getByText('A few questions about your trip')).toBeInTheDocument();
  });

  it('renders the fallback when the body fails validation', () => {
    const broken = clone(envelope) as Record<string, unknown>;
    broken['body'] = { questions: [] };
    render(<InteractiveCardBlock cards={[decodeDelta(broken)]} />);
    expect(screen.getByTestId('interactive-card-fallback')).toHaveAttribute(
      'data-card-recognized',
      'false',
    );
    expect(screen.getByText(/What kind of day/)).toBeInTheDocument();
  });

  it('labels the card for assistive tech with its headline', () => {
    render(<InteractiveCardBlock cards={[decodeDelta(envelope)]} />);
    expect(screen.getByRole('region', { name: 'A few questions about your trip' })).toBeVisible();
  });

  it('renders the fallback as plain text, not markdown', () => {
    // `fallback.text` is plain text by contract: the CLI paints it into
    // terminal cells and the Chrome panel sanitises it. Rendering it through
    // markdown here would make an itinerary's literal asterisks into bullets on
    // one surface and leave them visible on another.
    const literal = clone(envelope);
    literal.fallback.text = '*8:30* Ferry Building — _not italic_';
    render(<InteractiveCardBlock cards={[decodeDelta(literal)]} />);
    expect(screen.getByText('*8:30* Ferry Building — _not italic_')).toBeInTheDocument();
    expect(document.querySelector('em')).toBeNull();
    expect(document.querySelector('strong')).toBeNull();
  });

  it('keys cards by cardId so a re-emitted card replaces rather than duplicates', () => {
    const second = clone(envelope);
    second.cardId = 'toolu_02def';
    second.producedBy.toolCallId = 'toolu_02def';
    second.fallback.headline = 'One more thing';
    render(<InteractiveCardBlock cards={[decodeDelta(envelope), decodeDelta(second)]} />);
    expect(screen.getAllByTestId('interactive-card-fallback')).toHaveLength(2);
  });
});
