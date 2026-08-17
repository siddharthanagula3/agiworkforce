import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatTopBar } from '../ChatTopBar';

const OFF_PALETTE_UTILITY =
  /(?:^|:)(?:bg|text|border|from|to|via)-(?:gray|slate|zinc|neutral|stone|purple|violet|indigo|blue|fuchsia)-\d{2,3}\b/;

function renderTopBar() {
  return render(
    <ChatTopBar
      sessionTitle="Quarterly plan"
      onNavigateToDashboard={vi.fn()}
      onRestoreCheckpoint={vi.fn()}
      onUpdateTitle={vi.fn()}
      hasCheckpoints
      checkpointCount={2}
    />,
  );
}

describe('ChatTopBar palette', () => {
  it('paints the Dashboard CTA with the sanctioned chat accent, not a purple/blue gradient', () => {
    renderTopBar();
    const dashboard = screen.getByRole('button', { name: /dashboard/i });

    expect(dashboard.className).toContain('bg-[var(--chat-accent-primary)]');
    expect(dashboard.className).toContain('text-[var(--chat-accent-primary-contrast)]');
    expect(dashboard.className).not.toContain('bg-gradient-to-r');
    expect(dashboard.className).not.toMatch(OFF_PALETTE_UTILITY);
  });

  it('paints the Settings icon button with chat text tokens', () => {
    const { container } = renderTopBar();
    const settings = container.querySelector('button:has(> svg.lucide-settings)');

    expect(settings).not.toBeNull();
    expect(settings!.className).toContain('text-[var(--chat-text-secondary)]');
    expect(settings!.className).toMatch(/hover:text-\[var\(--chat-text-primary\)\]/);
    expect(settings!.className).not.toMatch(OFF_PALETTE_UTILITY);
  });

  it('leaves no raw Tailwind palette utility anywhere in the bar', () => {
    const { container } = renderTopBar();
    const offenders: string[] = [];

    container.querySelectorAll('*').forEach((node) => {
      const className = node.getAttribute('class');
      if (className && OFF_PALETTE_UTILITY.test(className)) {
        offenders.push(`${node.nodeName.toLowerCase()}: ${className}`);
      }
    });

    expect(offenders).toEqual([]);
  });
});
