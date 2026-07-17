/**
 * InlineToolCallGroup — collapsible group wrapper tests.
 *
 * Covers:
 *   1. Default-open renders children
 *   2. defaultOpen=false hides children
 *   3. Click header toggles children
 *   4. Keyboard Enter + Space toggle
 *   5. aria-expanded tracks open state
 *   6. Header text contains integrationName + summary
 *   7. Chevron rotation class on open/close
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { InlineToolCallGroup } from '../InlineToolCallGroup';
import { InlineToolCall } from '../InlineToolCall';

afterEach(() => {
  cleanup();
});

describe('InlineToolCallGroup', () => {
  it('renders children when defaultOpen is true (default)', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools">
        <InlineToolCall id="g-t1" label="List Directory" status="success" />
        <InlineToolCall id="g-t2" label="Read" status="success" />
      </InlineToolCallGroup>,
    );
    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(2);
  });

  it('hides children when defaultOpen=false', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools" defaultOpen={false}>
        <InlineToolCall id="g-t3" label="List Directory" status="success" />
      </InlineToolCallGroup>,
    );
    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(0);
  });

  it('clicking the header toggles children open', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools" defaultOpen={false}>
        <InlineToolCall id="g-t4" label="List Directory" status="success" />
      </InlineToolCallGroup>,
    );
    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(0);

    const header = screen.getByRole('button', { name: /Filesystem/i });
    fireEvent.click(header);

    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(1);

    fireEvent.click(header);
    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(0);
  });

  it('Enter key toggles open state', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Python" summary="ran 3 commands" defaultOpen={false}>
        <InlineToolCall id="g-t5" label="bash" status="success" />
      </InlineToolCallGroup>,
    );
    const header = screen.getByRole('button', { name: /Python/i });
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(1);
  });

  it('Space key toggles open state', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Python" summary="ran 3 commands" defaultOpen={false}>
        <InlineToolCall id="g-t6" label="bash" status="success" />
      </InlineToolCallGroup>,
    );
    const header = screen.getByRole('button', { name: /Python/i });
    fireEvent.keyDown(header, { key: ' ' });
    expect(container.querySelectorAll('[data-tool-id]')).toHaveLength(1);
  });

  it('aria-expanded is false when closed, true when open', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Brave Search" summary="10 results">
        <InlineToolCall id="g-t7" label="Search" status="success" />
      </InlineToolCallGroup>,
    );
    const header = container.querySelector('.inline-tool-call-group__header');
    expect(header?.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(header as Element);
    expect(header?.getAttribute('aria-expanded')).toBe('false');
  });

  it('header text includes integrationName and summary', () => {
    render(
      <InlineToolCallGroup integrationName="Brave Search" summary="10 results">
        <span />
      </InlineToolCallGroup>,
    );
    const header = screen.getByRole('button', {
      name: /Used Brave Search integration, 10 results/i,
    });
    expect(header).not.toBeNull();
  });

  it('chevron gets rotate-180 class when open', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools">
        <span />
      </InlineToolCallGroup>,
    );
    const chevron = container.querySelector('.inline-tool-call-group__chevron');
    // SVG elements return SVGAnimatedString from .className; use getAttribute instead
    expect(chevron?.getAttribute('class')).toMatch(/rotate-180/);
  });

  it('chevron does NOT have rotate-180 when closed', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools" defaultOpen={false}>
        <span />
      </InlineToolCallGroup>,
    );
    const chevron = container.querySelector('.inline-tool-call-group__chevron');
    expect(chevron?.getAttribute('class')).not.toMatch(/rotate-180/);
  });

  it('sets data-integration attribute on root element', () => {
    const { container } = render(
      <InlineToolCallGroup integrationName="MCP" summary="called tool">
        <span />
      </InlineToolCallGroup>,
    );
    expect(container.querySelector('[data-integration="MCP"]')).not.toBeNull();
  });
});
