import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MermaidDiagramModule = typeof import('../MermaidDiagram');
type HighlightedCodeModule = typeof import('../HighlightedCode');

vi.mock('../MermaidDiagram', async (importOriginal) => ({
  ...(await importOriginal<MermaidDiagramModule>()),
  MermaidDiagram: ({ source }: { source: string }) => <pre>{source}</pre>,
}));

vi.mock('../HighlightedCode', async (importOriginal) => ({
  ...(await importOriginal<HighlightedCodeModule>()),
  HighlightedCode: ({ code }: { code: string }) => <code>{code}</code>,
}));

const { MarkdownContent } = await import('../MarkdownContent');

const EMAIL_FENCE = [
  'Here is a draft:',
  '',
  '```email',
  'To: jane@example.com',
  'Subject: Thursday review',
  '',
  'Hi Jane,',
  '',
  'Can we move the review to Thursday?',
  '',
  'Thanks,',
  'Sam',
  '```',
].join('\n');

const WRITING_FENCE = [
  '```writing',
  '## Launch note',
  '',
  'We are **live** today.',
  '',
  '- Faster replies',
  '- Any model',
  '```',
].join('\n');

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function emailCard(container: HTMLElement): HTMLElement {
  const card = container.querySelector<HTMLElement>('[data-rich-block="email"]');
  if (!card) throw new Error('email card not rendered');
  return card;
}

describe('email blocks', () => {
  it('renders the fence as an email card with editable fields, not as code', () => {
    const { container } = render(<MarkdownContent content={EMAIL_FENCE} />);
    const card = emailCard(container);

    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('.code-block-container')).toBeNull();
    expect(within(card).getByLabelText('To')).toHaveProperty('value', 'jane@example.com');
    expect(within(card).getByLabelText('Subject')).toHaveProperty('value', 'Thursday review');
    expect(within(card).getByLabelText('Message')).toHaveProperty(
      'value',
      'Hi Jane,\n\nCan we move the review to Thursday?\n\nThanks,\nSam',
    );
    expect(screen.getByText('Here is a draft:')).toBeTruthy();
  });

  it('copies the edited email as clean plain text', async () => {
    const { container } = render(<MarkdownContent content={EMAIL_FENCE} />);
    const card = emailCard(container);

    fireEvent.change(within(card).getByLabelText('To'), {
      target: { value: 'jane@example.org' },
    });
    fireEvent.change(within(card).getByLabelText('Subject'), {
      target: { value: 'Friday review' },
    });
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Copy email' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      'To: jane@example.org\nSubject: Friday review\n\nHi Jane,\n\nCan we move the review to Thursday?\n\nThanks,\nSam',
    );
    expect(within(card).getByRole('button', { name: 'Email copied' })).toBeTruthy();
  });

  it('opens the mail app with every field encoded and follows edits', () => {
    const { container } = render(<MarkdownContent content={EMAIL_FENCE} />);
    const card = emailCard(container);
    const link = within(card).getByRole('link', { name: 'Open in mail app' });

    expect(link.getAttribute('href')).toBe(
      'mailto:jane%40example.com?subject=Thursday%20review&body=Hi%20Jane%2C%0D%0A%0D%0ACan%20we%20move%20the%20review%20to%20Thursday%3F%0D%0A%0D%0AThanks%2C%0D%0ASam',
    );

    fireEvent.change(within(card).getByLabelText('Message'), { target: { value: 'Short.' } });
    expect(link.getAttribute('href')).toBe(
      'mailto:jane%40example.com?subject=Thursday%20review&body=Short.',
    );
  });

  it('copies a body too long for a mail link and says so before opening the app', async () => {
    const longBody = 'paragraph '.repeat(400).trim();
    const { container } = render(
      <MarkdownContent
        content={`\`\`\`email\nTo: jane@example.com\nSubject: Notes\n\n${longBody}\n\`\`\``}
      />,
    );
    const card = emailCard(container);
    const link = within(card).getByRole('link', { name: 'Open in mail app' });
    expect(link.getAttribute('href')).toBe('mailto:jane%40example.com?subject=Notes');

    await act(async () => {
      fireEvent.click(link);
    });

    expect(writeText).toHaveBeenCalledWith(longBody);
    expect(within(card).getByRole('status').textContent).toContain('too long for a mail link');
  });

  it('offers no Send action, because no surface can send email from a card yet', () => {
    const { container } = render(<MarkdownContent content={EMAIL_FENCE} />);
    const card = emailCard(container);
    expect(within(card).queryByRole('button', { name: /send/i })).toBeNull();
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  it('renders several fences as separate cards', () => {
    const second = EMAIL_FENCE.replace('jane@example.com', 'bob@example.com');
    const { container } = render(<MarkdownContent content={`${EMAIL_FENCE}\n\n${second}`} />);
    const cards = container.querySelectorAll('[data-rich-block="email"]');
    expect(cards).toHaveLength(2);
    expect(within(cards[1] as HTMLElement).getByLabelText('To')).toHaveProperty(
      'value',
      'bob@example.com',
    );
  });

  it('holds the fields read-only and hides the actions while the fence streams', () => {
    const { container } = render(
      <MarkdownContent content={'```email\nTo: jane@example.com\nSubject: Thu'} isStreaming />,
    );
    const card = emailCard(container);
    expect(within(card).getByLabelText('Subject')).toHaveProperty('readOnly', true);
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).queryByRole('link')).toBeNull();
  });

  it('falls back to ordinary markdown when the fence is not an email', () => {
    const { container } = render(
      <MarkdownContent content={'```email\nHi Jane,\n\n**See** you Thursday.\n```'} />,
    );
    expect(container.querySelector('[data-rich-block]')).toBeNull();
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('See');
  });
});

describe('writing blocks', () => {
  it('renders the text as formatted prose inside a labelled card', () => {
    const { container } = render(<MarkdownContent content={WRITING_FENCE} />);
    const card = container.querySelector<HTMLElement>('[data-rich-block="writing"]');
    expect(card?.getAttribute('aria-label')).toBe('Writing');
    expect(card?.querySelector('h2')?.textContent).toBe('Launch note');
    expect(card?.querySelector('strong')?.textContent).toBe('live');
    expect(card?.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('pre')).toBeNull();
  });

  it('keeps its header sticky so Copy and Expand stay reachable in a long block', () => {
    const { container } = render(<MarkdownContent content={WRITING_FENCE} />);
    const card = container.querySelector<HTMLElement>('[data-rich-block="writing"]');
    const header = card?.querySelector<HTMLElement>('[data-rich-block-header]');
    expect(header?.className).toContain('sticky');
    expect(header?.className).toContain('top-0');
    expect(card?.className).toContain('overflow-clip');
    expect(card?.className).not.toContain('overflow-hidden');
    expect(
      within(header as HTMLElement).getByRole('button', { name: 'Copy this text' }),
    ).toBeTruthy();
    expect(
      within(header as HTMLElement).getByRole('button', { name: 'Open larger to read and edit' }),
    ).toBeTruthy();
  });

  it('copies only the block text, not the rest of the message', async () => {
    const { container } = render(
      <MarkdownContent content={`Intro line.\n\n${WRITING_FENCE}\n\nOutro line.`} />,
    );
    const card = container.querySelector<HTMLElement>('[data-rich-block="writing"]');
    await act(async () => {
      fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Copy this text' }));
    });
    expect(writeText).toHaveBeenCalledWith(
      '## Launch note\n\nWe are **live** today.\n\n- Faster replies\n- Any model',
    );
  });

  it('opens a larger editor whose edits the card and Copy then use', async () => {
    const { container } = render(<MarkdownContent content={WRITING_FENCE} />);
    const card = container.querySelector<HTMLElement>('[data-rich-block="writing"]');
    fireEvent.click(
      within(card as HTMLElement).getByRole('button', { name: 'Open larger to read and edit' }),
    );

    const dialog = await screen.findByRole('dialog');
    const editor = within(dialog).getByLabelText('Edit text');
    fireEvent.change(editor, { target: { value: 'Rewritten paragraph.' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Copy this text' }));
    });
    expect(writeText).toHaveBeenCalledWith('Rewritten paragraph.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close expanded text' }));
    expect(card?.textContent).toContain('Rewritten paragraph.');
  });

  it('shows the card without actions while it streams', () => {
    const { container } = render(
      <MarkdownContent content={'```writing\nFirst line of the dr'} isStreaming />,
    );
    const card = container.querySelector<HTMLElement>('[data-rich-block="writing"]');
    expect(card?.textContent).toContain('First line of the dr');
    expect(within(card as HTMLElement).queryAllByRole('button')).toHaveLength(0);
  });

  it('renders nothing for an empty finished block', () => {
    const { container } = render(<MarkdownContent content={'```writing\n\n```'} />);
    expect(container.querySelector('[data-rich-block]')).toBeNull();
  });
});

describe('ordinary code fences', () => {
  it('still render inside a pre with the code block header', () => {
    const { container } = render(<MarkdownContent content={'```python\nprint(1)\n```'} />);
    expect(container.querySelector('pre .code-block-container')).not.toBeNull();
    expect(container.querySelector('[data-rich-block]')).toBeNull();
  });
});
