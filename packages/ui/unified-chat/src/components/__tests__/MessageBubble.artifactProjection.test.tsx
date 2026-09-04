/**
 * MessageBubble.artifactProjection.test.tsx, DES-C05 / DES-C06.
 *
 * Desktop Cloud could not show an artifact because the transcript only ever
 * rendered `message.artifacts`, and the managed completions wire never attaches
 * any. The bubble now accepts a host-derived projection; these tests pin the two
 * properties that make it safe to swap in: the artifact's fenced block leaves
 * the BODY but not the CLIPBOARD, and a host that wires nothing sees no change.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import type { ChatMessage, MessageArtifactProjection } from '../../lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const HTML = '<div id="app">hello</div>';

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: `Intro.\n\n\`\`\`html\n${HTML}\n\`\`\`\n\nOutro.`,
    ...overrides,
  };
}

const projection: MessageArtifactProjection = {
  artifacts: [{ id: 'art-1', type: 'html', title: 'Landing page', content: HTML }],
  displayContent: 'Intro.\n\nOutro.',
};

describe('MessageBubble artifact projection', () => {
  it('renders the derived artifact card and drops its fence from the body', () => {
    render(<MessageBubble message={assistantMessage()} artifactProjection={projection} />);

    expect(screen.getByTestId('message-artifacts')).toBeTruthy();
    expect(screen.getByText('Landing page')).toBeTruthy();
    expect(screen.getByText(/Intro\./)).toBeTruthy();
    expect(screen.queryByText(HTML)).toBeNull();
  });

  it('still copies the ORIGINAL content, fenced block included', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const message = assistantMessage();
    render(<MessageBubble message={message} artifactProjection={projection} />);

    screen.getByLabelText('Copy message').click();
    expect(writeText).toHaveBeenCalledWith(message.content);
    expect(writeText.mock.calls[0]![0]).toContain(HTML);
  });

  it('opens the derived artifact through the host handler', () => {
    const onArtifactClick = vi.fn();
    render(
      <MessageBubble
        message={assistantMessage()}
        artifactProjection={projection}
        onArtifactClick={onArtifactClick}
      />,
    );

    screen.getByText('Landing page').click();
    expect(onArtifactClick).toHaveBeenCalledWith(projection.artifacts[0]);
  });

  it('is a no-op for hosts that wire no derivation', () => {
    render(<MessageBubble message={assistantMessage()} />);

    expect(screen.queryByTestId('message-artifacts')).toBeNull();
    expect(screen.getByText(HTML)).toBeTruthy();
  });

  it('keeps rendering runtime-attached artifacts when no projection is supplied', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          artifacts: [{ id: 'a9', type: 'html', title: 'From runtime', content: HTML }],
        })}
      />,
    );

    expect(screen.getByText('From runtime')).toBeTruthy();
  });
});

describe('MessageBubble trimmed-metadata note (DES-C06)', () => {
  it('tells the user which side-panels did not fit, naming them', () => {
    render(
      <MessageBubble
        message={assistantMessage({ metadata: { metadataTrimmed: ['artifacts', 'thinking'] } })}
      />,
    );

    const note = screen.getByTestId('message-metadata-trimmed');
    expect(note.textContent).toContain('artifacts');
    expect(note.textContent).toContain('the thinking trace');
    expect(note.textContent).toContain('saved');
  });

  it('renders nothing when the whole turn fit', () => {
    render(<MessageBubble message={assistantMessage({ metadata: { finishReason: 'stop' } })} />);
    expect(screen.queryByTestId('message-metadata-trimmed')).toBeNull();
  });

  it('ignores a malformed metadataTrimmed value instead of throwing', () => {
    render(
      <MessageBubble message={assistantMessage({ metadata: { metadataTrimmed: 'artifacts' } })} />,
    );
    expect(screen.queryByTestId('message-metadata-trimmed')).toBeNull();
  });
});
