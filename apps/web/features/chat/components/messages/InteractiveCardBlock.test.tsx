import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InteractiveCard } from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { InteractiveCardBlock } from './InteractiveCardBlock';

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

  it('renders a registered clarify card as real UI, not the fallback', () => {
    render(<InteractiveCardBlock cards={[decodeDelta(envelope)]} />);

    const card = screen.getByTestId('interactive-card-clarify');
    expect(card).toHaveAttribute('data-card-state', 'pending');
    expect(screen.getByText('What kind of day are you in the mood for?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Packed' })).toBeInTheDocument();
    expect(screen.queryByTestId('interactive-card-fallback')).not.toBeInTheDocument();
  });

  it('renders a real map search card and opens only the selected provider URL', async () => {
    const mapCard = clone(envelope) as Record<string, unknown>;
    mapCard['kind'] = 'map-search.v1';
    mapCard['producedBy'] = { toolCallId: 'toolu_01abc', toolName: 'search_maps' };
    mapCard['fallback'] = {
      headline: 'Coffee near Austin',
      text: 'Map search: coffee shops near Austin, Texas',
    };
    mapCard['body'] = {
      title: 'Coffee near Austin',
      query: 'coffee shops near Austin, Texas',
      actions: [
        {
          provider: 'google_maps',
          label: 'Open in Google Maps',
          url: 'https://www.google.com/maps/search/?api=1&query=coffee',
        },
        {
          provider: 'openstreetmap',
          label: 'Open in OpenStreetMap',
          url: 'https://www.openstreetmap.org/search?query=coffee',
        },
      ],
    };
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<InteractiveCardBlock cards={[decodeDelta(mapCard)]} />);
    expect(await screen.findByTestId('interactive-card-map-search')).toBeVisible();
    expect(screen.getByText('coffee shops near Austin, Texas')).toBeVisible();
    screen.getByRole('button', { name: /Open in Google Maps/ }).click();
    expect(open).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=coffee',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  it('refuses an arbitrary HTTPS URL even if a caller bypasses card hydration', async () => {
    const mapCard = clone(envelope) as Record<string, unknown>;
    mapCard['kind'] = 'map-search.v1';
    mapCard['producedBy'] = { toolCallId: 'toolu_01abc', toolName: 'search_maps' };
    mapCard['body'] = {
      title: 'Coffee near Austin',
      query: 'coffee near Austin',
      actions: [
        {
          provider: 'google_maps',
          label: 'Open map',
          url: 'https://www.google.com/maps/search/?api=1&query=coffee',
        },
      ],
    };
    const parsed = decodeDelta(mapCard);
    if (!parsed.recognized || parsed.kind !== 'map-search.v1') {
      throw new Error('map fixture did not parse');
    }
    const bypassed = {
      ...parsed,
      body: {
        ...parsed.body,
        actions: [{ ...parsed.body.actions[0]!, url: 'https://example.test/collect' }],
      },
    } as InteractiveCard;
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<InteractiveCardBlock cards={[bypassed]} />);
    (await screen.findByRole('button', { name: 'Open map' })).click();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('renders a real mcp app card, the second kind this client advertises', () => {
    const payloadId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const mcpCard = clone(envelope) as Record<string, unknown>;
    mcpCard['kind'] = 'mcp-app.v1';
    mcpCard['cardId'] = `mcp-app-${payloadId}`;
    mcpCard['producedBy'] = { toolCallId: payloadId, toolName: 'mcp__linear__create_issue' };
    mcpCard['fallback'] = {
      headline: 'Interactive connector result',
      text: 'linear returned an MCP App.',
    };
    mcpCard['body'] = {
      payloadId,
      connectorId: 'linear',
      toolName: 'create_issue',
      resourceUri: 'ui://linear/create-issue',
    };
    const pending = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal('fetch', pending);

    render(<InteractiveCardBlock cards={[decodeDelta(mcpCard)]} />);
    expect(screen.queryByTestId('interactive-card-fallback')).not.toBeInTheDocument();
    expect(screen.getByTitle('create_issue interactive result')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('still renders the fallback for a recognized kind with no renderer yet', () => {
    const itinerary = clone(envelope) as Record<string, unknown>;
    itinerary['kind'] = 'itinerary.v1';
    render(<InteractiveCardBlock cards={[decodeDelta(itinerary)]} />);
    expect(screen.getByTestId('interactive-card-fallback')).toBeInTheDocument();
    expect(screen.getByText('A few questions about your trip')).toBeInTheDocument();
  });

  it('renders a clarify card read-only when the surface cannot respond', () => {
    render(<InteractiveCardBlock cards={[decodeDelta(envelope)]} />);
    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send answers' })).not.toBeInTheDocument();
  });

  it('renders the fallback for a kind this build has never heard of', () => {
    const unknown = clone(envelope);
    unknown.kind = 'weather.v1';
    render(<InteractiveCardBlock cards={[decodeDelta(unknown)]} />);

    const card = screen.getByTestId('interactive-card-fallback');
    expect(card).toHaveAttribute('data-card-recognized', 'false');
    expect(card).toHaveAttribute('data-card-kind', 'weather.v1');
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
    const literal = clone(envelope) as Record<string, unknown>;
    literal['kind'] = 'weather.v1';
    (literal['fallback'] as Record<string, unknown>)['text'] =
      '*8:30* Ferry Building, _not italic_';
    render(<InteractiveCardBlock cards={[decodeDelta(literal)]} />);
    expect(screen.getByText('*8:30* Ferry Building, _not italic_')).toBeInTheDocument();
    expect(document.querySelector('em')).toBeNull();
    expect(document.querySelector('strong')).toBeNull();
  });

  it('keys cards by cardId so a re-emitted card replaces rather than duplicates', () => {
    const second = clone(envelope);
    second.cardId = 'toolu_02def';
    second.producedBy.toolCallId = 'toolu_02def';
    second.fallback.headline = 'One more thing';
    render(<InteractiveCardBlock cards={[decodeDelta(envelope), decodeDelta(second)]} />);
    expect(screen.getAllByTestId('interactive-card-clarify')).toHaveLength(2);
  });
});
