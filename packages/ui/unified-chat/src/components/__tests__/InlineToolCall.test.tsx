import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Box } from 'lucide-react';

import {
  InlineToolCall,
  InlineToolCallStack,
  inferKindFromLabel,
  KIND_TO_BADGE,
  type InlineToolKind,
} from '../InlineToolCall';

afterEach(() => {
  cleanup();
});

describe('InlineToolCall — collapsed/expanded toggle', () => {
  it('starts collapsed by default and reveals body on click', () => {
    render(
      <InlineToolCall
        id="t1"
        label="bash"
        status="success"
        body={<pre data-testid="body">ls -la</pre>}
      />,
    );
    const bar = screen.getByRole('button', { name: /bash/i });
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('body')).toBeNull();

    fireEvent.click(bar);

    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByTestId('body')).not.toBeNull();
  });

  it('honors defaultOpen=true', () => {
    render(
      <InlineToolCall
        id="t2"
        label="read"
        status="success"
        defaultOpen
        body={<pre data-testid="body">file contents</pre>}
      />,
    );
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByTestId('body')).not.toBeNull();
  });

  it('renders no chevron and no role=button when body is omitted', () => {
    render(<InlineToolCall id="t3" label="thinking" status="running" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('thinking')).not.toBeNull();
  });
});

describe('InlineToolCall — status states', () => {
  it('pending renders ellipsis suffix and muted color', () => {
    const { container } = render(
      <InlineToolCall id="s1" label="bash" status="pending" body={<span />} />,
    );
    expect(within(container).queryByText('…')).not.toBeNull();
    expect(container.querySelector('[data-status="pending"]')).not.toBeNull();
  });

  it('running renders "Running" suffix + spinning loader', () => {
    const { container } = render(
      <InlineToolCall id="s2" label="bash" status="running" body={<span />} />,
    );
    expect(within(container).queryByText('Running')).not.toBeNull();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('success renders no suffix and no trailing indicator', () => {
    const { container } = render(
      <InlineToolCall id="s3" label="bash" status="success" body={<span />} />,
    );
    expect(within(container).queryByText('Running')).toBeNull();
    expect(within(container).queryByText(/Error/)).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('error renders prefixed error message and danger color class', () => {
    const { container } = render(
      <InlineToolCall
        id="s4"
        label="web-fetch"
        status="error"
        errorMessage="timeout"
        body={<span />}
      />,
    );
    expect(within(container).queryByText('Error: timeout')).not.toBeNull();
    const suffix = container.querySelector('.inline-tool-call__suffix');
    expect(suffix?.className).toMatch(/state-danger/);
  });

  it('partial renders "Partial — see body" suffix', () => {
    const { container } = render(
      <InlineToolCall id="s5" label="fs-list" status="partial" body={<span />} />,
    );
    expect(within(container).queryByText(/Partial — see body/)).not.toBeNull();
  });
});

describe('InlineToolCall — icon mapping', () => {
  it('inferKindFromLabel maps common tool names to canonical kinds', () => {
    expect(inferKindFromLabel('bash')).toBe('bash');
    expect(inferKindFromLabel('Terminal')).toBe('bash');
    expect(inferKindFromLabel('Read')).toBe('read');
    expect(inferKindFromLabel('write_file')).toBe('write');
    expect(inferKindFromLabel('edit_file')).toBe('edit');
    expect(inferKindFromLabel('web_search')).toBe('web-search');
    expect(inferKindFromLabel('fetch_url')).toBe('web-fetch');
    expect(inferKindFromLabel('list_directory')).toBe('fs-list');
    expect(inferKindFromLabel('image_gen')).toBe('image-gen');
    expect(inferKindFromLabel('mcp__filesystem__read')).toBe('mcp-custom');
    expect(inferKindFromLabel('thinking')).toBe('thinking');
    expect(inferKindFromLabel('totally_unknown')).toBe('unknown');
  });

  it('renders the Lucide icon resolved from kind=auto by label', () => {
    const { container } = render(
      <InlineToolCall id="i1" label="bash" status="success" body={<span />} />,
    );
    expect(container.querySelector('svg.inline-tool-call__icon')).not.toBeNull();
  });

  it('accepts an explicit kind override that beats heuristics', () => {
    const { container } = render(
      <InlineToolCall id="i2" label="bash" kind="thinking" status="success" body={<span />} />,
    );
    expect(container.querySelector('svg.inline-tool-call__icon')).not.toBeNull();
  });

  it('accepts iconOverride to bypass mapping entirely', () => {
    const { container } = render(
      <InlineToolCall id="i3" label="custom" status="success" iconOverride={Box} body={<span />} />,
    );
    expect(container.querySelector('svg.inline-tool-call__icon')).not.toBeNull();
  });
});

describe('InlineToolCall — arg summary', () => {
  it('renders arg summary text with truncation classes + title for tooltip', () => {
    const arg = '/Users/foo/bar/baz/extremely/long/path/that/should/truncate.json';
    const { container } = render(
      <InlineToolCall id="a1" label="Read" status="success" argSummary={arg} body={<span />} />,
    );
    const summary = container.querySelector('.inline-tool-call__summary');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toBe(arg);
    expect(summary?.className).toMatch(/text-ellipsis/);
    expect(summary?.className).toMatch(/whitespace-nowrap/);
    expect(summary?.className).toMatch(/overflow-hidden/);
    expect(summary?.className).toMatch(/max-w-\[360px\]/);
    expect(summary?.getAttribute('title')).toBe(arg);
  });

  it('omits the summary slot when no argSummary is provided', () => {
    const { container } = render(
      <InlineToolCall id="a2" label="bash" status="success" body={<span />} />,
    );
    expect(container.querySelector('.inline-tool-call__summary')).toBeNull();
  });
});

describe('InlineToolCallStack', () => {
  it('renders children inside a stack with the 1px left guideline', () => {
    const { container } = render(
      <InlineToolCallStack>
        <InlineToolCall id="m1" label="Read" status="success" body={<span />} />
        <InlineToolCall id="m2" label="Write" status="success" body={<span />} />
        <InlineToolCall id="m3" label="Read" status="success" body={<span />} />
      </InlineToolCallStack>,
    );
    const stack = container.querySelector('[data-tool-stack]');
    expect(stack).not.toBeNull();
    expect(stack?.className).toMatch(/border-l/);
    const children = container.querySelectorAll('[data-tool-id]');
    expect(children).toHaveLength(3);
  });
});

describe('InlineToolCall — keyboard activation', () => {
  it('toggles open state on Enter', () => {
    render(
      <InlineToolCall id="k1" label="bash" status="success" body={<pre data-testid="b">x</pre>} />,
    );
    const bar = screen.getByRole('button');
    bar.focus();
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(bar.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles open state on Space', () => {
    render(
      <InlineToolCall id="k2" label="bash" status="success" body={<pre data-testid="b">x</pre>} />,
    );
    const bar = screen.getByRole('button');
    bar.focus();
    fireEvent.keyDown(bar, { key: ' ' });
    expect(bar.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not toggle on other keys', () => {
    render(
      <InlineToolCall id="k3" label="bash" status="success" body={<pre data-testid="b">x</pre>} />,
    );
    const bar = screen.getByRole('button');
    fireEvent.keyDown(bar, { key: 'a' });
    fireEvent.keyDown(bar, { key: 'Tab' });
    expect(bar.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('InlineToolCall — controlled mode', () => {
  it('respects controlled `open` and fires `onOpenChange` on click', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <InlineToolCall
        id="c1"
        label="bash"
        status="success"
        open={false}
        onOpenChange={onOpenChange}
        body={<pre data-testid="b">x</pre>}
      />,
    );
    const bar = screen.getByRole('button');
    expect(bar.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(bar);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(bar.getAttribute('aria-expanded')).toBe('false');

    rerender(
      <InlineToolCall
        id="c1"
        label="bash"
        status="success"
        open={true}
        onOpenChange={onOpenChange}
        body={<pre data-testid="b">x</pre>}
      />,
    );
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByTestId('b')).not.toBeNull();
  });
});

describe('InlineToolCall — badge icon mode', () => {
  it('renders data-icon-style="badge" on the root when iconStyle is badge', () => {
    const { container } = render(
      <InlineToolCall id="b1" label="Read" status="success" iconStyle="badge" />,
    );
    expect(container.querySelector('[data-icon-style="badge"]')).not.toBeNull();
  });

  it('renders a badge element with the correct letter for filesystem kinds', () => {
    const kinds: Array<{ kind: InlineToolKind; label: string }> = [
      { kind: 'read', label: 'Read' },
      { kind: 'write', label: 'Write' },
      { kind: 'edit', label: 'Edit' },
      { kind: 'fs-list', label: 'List' },
    ];
    for (const { kind, label } of kinds) {
      const { container } = render(
        <InlineToolCall
          id={`b-${kind}`}
          label={label}
          status="success"
          kind={kind}
          iconStyle="badge"
        />,
      );
      const badge = container.querySelector('[data-badge-kind="letter"]');
      expect(badge).not.toBeNull();
      expect(badge?.getAttribute('data-badge-letter')).toBe('F');
      cleanup();
    }
  });

  it('renders a glyph badge for web-search kind', () => {
    const { container } = render(
      <InlineToolCall
        id="b2"
        label="Search"
        status="success"
        kind="web-search"
        iconStyle="badge"
      />,
    );
    expect(container.querySelector('[data-badge-kind="glyph"]')).not.toBeNull();
  });

  it('renders a glyph badge for thinking kind', () => {
    const { container } = render(
      <InlineToolCall
        id="b3"
        label="Thinking"
        status="running"
        kind="thinking"
        iconStyle="badge"
      />,
    );
    expect(container.querySelector('[data-badge-kind="glyph"]')).not.toBeNull();
  });

  it('renders a check badge for done kind', () => {
    const { container } = render(
      <InlineToolCall id="b4" label="Done" status="success" kind="done" iconStyle="badge" />,
    );
    expect(container.querySelector('[data-badge-kind="check"]')).not.toBeNull();
  });

  it('renders "Result" sub-label below bar for badge+success with no body', () => {
    const { container } = render(
      <InlineToolCall id="b5" label="Read" status="success" kind="read" iconStyle="badge" />,
    );
    expect(container.querySelector('[data-result-label]')).not.toBeNull();
    expect(container.querySelector('[data-result-label]')?.textContent).toBe('Result');
  });

  it('does NOT render "Result" sub-label when body is provided (expandable row)', () => {
    const { container } = render(
      <InlineToolCall
        id="b6"
        label="Read"
        status="success"
        kind="read"
        iconStyle="badge"
        body={<pre>some content</pre>}
      />,
    );
    expect(container.querySelector('[data-result-label]')).toBeNull();
  });

  it('uses iconLetter override when provided', () => {
    const { container } = render(
      <InlineToolCall id="b7" label="Custom" status="success" iconStyle="badge" iconLetter="X" />,
    );
    const badge = container.querySelector('[data-badge-kind="letter"]');
    expect(badge?.getAttribute('data-badge-letter')).toBe('X');
  });

  it('renders 28px-height bar in badge mode (h-7 class)', () => {
    const { container } = render(
      <InlineToolCall id="b8" label="Read" status="success" iconStyle="badge" />,
    );
    const bar = container.querySelector('.inline-tool-call__bar');
    expect(bar?.className).toMatch(/h-7/);
  });

  it('renders 32px-height bar in legacy lucide mode (h-8 class)', () => {
    const { container } = render(
      <InlineToolCall id="b9" label="Read" status="success" iconStyle="lucide" />,
    );
    const bar = container.querySelector('.inline-tool-call__bar');
    expect(bar?.className).toMatch(/h-8/);
  });
});

describe('KIND_TO_BADGE map', () => {
  const kinds: Array<Exclude<InlineToolKind, 'auto'>> = [
    'bash',
    'read',
    'write',
    'edit',
    'web-search',
    'web-fetch',
    'fs-list',
    'image-gen',
    'browser',
    'mcp-custom',
    'thinking',
    'done',
    'unknown',
  ];

  it('has an entry for every concrete InlineToolKind (no gaps)', () => {
    for (const kind of kinds) {
      expect(KIND_TO_BADGE[kind]).toBeDefined();
    }
  });

  it('maps bash → letter >', () => {
    const cfg = KIND_TO_BADGE['bash'];
    expect(cfg.kind).toBe('letter');
    if (cfg.kind === 'letter') expect(cfg.letter).toBe('>');
  });

  it('maps web-search → glyph', () => {
    expect(KIND_TO_BADGE['web-search'].kind).toBe('glyph');
  });

  it('maps thinking → glyph', () => {
    expect(KIND_TO_BADGE['thinking'].kind).toBe('glyph');
  });

  it('maps done → check', () => {
    expect(KIND_TO_BADGE['done'].kind).toBe('check');
  });

  it('maps mcp-custom → letter M', () => {
    const cfg = KIND_TO_BADGE['mcp-custom'];
    expect(cfg.kind).toBe('letter');
    if (cfg.kind === 'letter') expect(cfg.letter).toBe('M');
  });
});
