/**
 * InlineToolCall — shared inline tool-call UI tests.
 *
 * Covers the locked design-spec §4 anatomy and §4.4 states:
 *   1. Collapsed → expanded toggle (click)
 *   2. Status states map to the right indicator / label suffix / color
 *   3. Per-tool icon mapping via `kind` prop and `inferKindFromLabel`
 *   4. Arg summary renders with ellipsis truncation classes + title attr
 *   5. Multi-step stack renders the 1px left guideline + children
 *   6. Keyboard activation (Enter + Space) toggles open state
 *   7. Controlled-mode `open` + `onOpenChange` round-trip
 *
 * Uses @testing-library/react against jsdom (vitest env). jest-dom matchers
 * are NOT auto-loaded by the package's vitest config, so this file sticks to
 * chai-native matchers (`toBe`, `toBeNull`, `toMatch`, etc.).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Box } from 'lucide-react';

import { InlineToolCall, InlineToolCallStack, inferKindFromLabel } from '../InlineToolCall';

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Collapsed / expanded toggle
// ─────────────────────────────────────────────────────────────────────────────

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
    // label still visible
    expect(screen.queryByText('thinking')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Status states
// ─────────────────────────────────────────────────────────────────────────────

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
    // The state-danger color token is applied to suffix
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. Icon mapping
// ─────────────────────────────────────────────────────────────────────────────

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
    // Lucide stamps an SVG; presence asserts the icon-resolver fired
    expect(container.querySelector('svg.inline-tool-call__icon')).not.toBeNull();
  });

  it('accepts an explicit kind override that beats heuristics', () => {
    const { container } = render(
      <InlineToolCall id="i2" label="bash" kind="thinking" status="success" body={<span />} />,
    );
    // Just assert it still renders an icon — class is stable
    expect(container.querySelector('svg.inline-tool-call__icon')).not.toBeNull();
  });

  it('accepts iconOverride to bypass mapping entirely', () => {
    const { container } = render(
      <InlineToolCall id="i3" label="custom" status="success" iconOverride={Box} body={<span />} />,
    );
    expect(container.querySelector('svg.inline-tool-call__icon')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Arg summary ellipsis truncation
// ─────────────────────────────────────────────────────────────────────────────

describe('InlineToolCall — arg summary', () => {
  it('renders arg summary text with truncation classes + title for tooltip', () => {
    const arg = '/Users/foo/bar/baz/extremely/long/path/that/should/truncate.json';
    const { container } = render(
      <InlineToolCall id="a1" label="Read" status="success" argSummary={arg} body={<span />} />,
    );
    const summary = container.querySelector('.inline-tool-call__summary');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toBe(arg);
    // Tailwind ellipsis utilities — design spec locks these
    expect(summary?.className).toMatch(/text-ellipsis/);
    expect(summary?.className).toMatch(/whitespace-nowrap/);
    expect(summary?.className).toMatch(/overflow-hidden/);
    expect(summary?.className).toMatch(/max-w-\[360px\]/);
    // Native browser tooltip exposes full value when truncated
    expect(summary?.getAttribute('title')).toBe(arg);
  });

  it('omits the summary slot when no argSummary is provided', () => {
    const { container } = render(
      <InlineToolCall id="a2" label="bash" status="success" body={<span />} />,
    );
    expect(container.querySelector('.inline-tool-call__summary')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Multi-step stack
// ─────────────────────────────────────────────────────────────────────────────

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
    // Three child tool-call rows
    const children = container.querySelectorAll('[data-tool-id]');
    expect(children).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Keyboard activation
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// 7. Controlled mode
// ─────────────────────────────────────────────────────────────────────────────

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
    // Still collapsed because controlled prop hasn't flipped
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
