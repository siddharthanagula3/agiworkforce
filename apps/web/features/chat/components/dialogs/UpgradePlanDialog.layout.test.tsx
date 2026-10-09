import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UpgradePlanDialog } from './UpgradePlanDialog';

const REM_PER_STEP = 0.25;

function spacing(className: string, prefixes: readonly string[]): number {
  for (const token of className.split(/\s+/)) {
    for (const prefix of prefixes) {
      const match = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`).exec(token);
      if (match) return Number(match[1]) * REM_PER_STEP;
    }
  }
  return 0;
}

function reservedRightGutterRem(from: HTMLElement, root: HTMLElement): number {
  let total = 0;
  let node: HTMLElement | null = from;
  while (node) {
    total += spacing(node.className, ['pe', 'px', 'p']);
    if (node === root) break;
    node = node.parentElement;
  }
  return total;
}

describe('UpgradePlanDialog header, close control has its own space', () => {
  it('reserves at least the close button footprint to the right of the heading', () => {
    render(
      <UpgradePlanDialog open onOpenChange={vi.fn()} currentTier="free" onUpgrade={vi.fn()} />,
    );

    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close upgrade plan dialog' });
    const heading = screen
      .getAllByRole('heading', { name: 'Upgrade your plan' })
      .find((candidate) => !candidate.closest('.sr-only'));

    expect(close.parentElement).toBe(dialog);
    expect(close.className).toContain('absolute');

    const closeFootprintRem = spacing(close.className, ['end']) + spacing(close.className, ['w']);
    expect(closeFootprintRem).toBeGreaterThan(0);

    const headerRow = heading?.closest('.flex.items-start.justify-between') as HTMLElement | null;
    expect(headerRow).not.toBeNull();

    const reserved = reservedRightGutterRem(headerRow!, dialog);
    expect(
      reserved,
      `header row reserves ${String(reserved)}rem but the close control covers the first ${String(
        closeFootprintRem,
      )}rem of the dialog's right edge`,
    ).toBeGreaterThanOrEqual(closeFootprintRem);
  });
});
