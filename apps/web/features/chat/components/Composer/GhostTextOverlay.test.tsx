import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GhostTextOverlay } from './GhostTextOverlay';

describe('GhostTextOverlay', () => {
  it('renders nothing when suggestion is empty and not loading', () => {
    const { container } = render(
      <GhostTextOverlay inputText="hello" suggestion="" isLoading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders ghost text suggestion after the input text', () => {
    render(<GhostTextOverlay inputText="hello" suggestion=" world" isLoading={false} />);
    // The suggestion text should appear inside the aria-hidden overlay
    // getByText trims whitespace, so we use a regex matcher
    expect(screen.getByText(/world/)).toBeInTheDocument();
  });

  it('renders the input text in a transparent span', () => {
    const { container } = render(
      <GhostTextOverlay inputText="hello" suggestion=" world" isLoading={false} />,
    );
    const transparentSpan = container.querySelector('.text-transparent');
    expect(transparentSpan).not.toBeNull();
    expect(transparentSpan?.textContent).toBe('hello');
  });

  it('renders a loading pulse indicator when isLoading is true', () => {
    const { container } = render(
      <GhostTextOverlay inputText="hello " suggestion="" isLoading={true} />,
    );
    // Should render the animate-pulse span
    const pulseSpan = container.querySelector('.animate-pulse');
    expect(pulseSpan).not.toBeNull();
    expect(pulseSpan?.textContent).toBe('...');
  });

  it('is aria-hidden to screen readers', () => {
    const { container } = render(
      <GhostTextOverlay inputText="test" suggestion=" suggestion" isLoading={false} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies pointer-events-none so clicks pass through', () => {
    const { container } = render(
      <GhostTextOverlay inputText="test" suggestion=" suggestion" isLoading={false} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.className).toContain('pointer-events-none');
  });
});
