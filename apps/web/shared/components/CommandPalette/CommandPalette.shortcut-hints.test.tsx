import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CommandPalette } from './CommandPalette';
import { KEYBOARD_SHORTCUT_DOCS } from '@/features/chat/hooks/use-keyboard-shortcuts';

const modelFixtureIds = vi.hoisted(() => ({
  primary: 'test-command-hint-model-primary',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { publicMetadata: {} } }),
}));

vi.mock('@/shared/stores/model-store', () => ({
  AVAILABLE_MODELS: [
    {
      id: modelFixtureIds.primary,
      name: 'Fixture Primary Model',
      provider: 'Provider A',
      description: 'Primary command palette fixture model',
    },
  ],
  useModelStore: (
    selector: (state: { selectedModelId: string; setSelectedModelId: () => void }) => unknown,
  ) => selector({ selectedModelId: modelFixtureIds.primary, setSelectedModelId: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  };
});

function commandHints(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button'))
    .flatMap((button) => Array.from(button.querySelectorAll('kbd')))
    .map((kbd) => kbd.textContent?.trim() ?? '');
}

function normalizeHint(hint: string): string {
  const mod = /⌘|⌃|Ctrl|Cmd/.test(hint);
  const shift = /⇧|Shift/.test(hint);
  const alt = /⌥|Alt|Opt/.test(hint);
  const key = hint
    .replace(/⌘|⌃|⇧|⌥|Ctrl|Cmd|Shift|Alt|Opt|\+/g, '')
    .trim()
    .toLowerCase();
  return [mod && 'mod', shift && 'shift', alt && 'alt', key].filter(Boolean).join('+');
}

const canonicalCombos = new Set(
  KEYBOARD_SHORTCUT_DOCS.map((doc) =>
    [(doc.ctrl || doc.meta) && 'mod', doc.shift && 'shift', doc.alt && 'alt', doc.key.toLowerCase()]
      .filter(Boolean)
      .join('+'),
  ),
);

describe('CommandPalette keyboard hints', () => {
  it('advertises no key combination outside the canonical shortcut registry', () => {
    const { container } = render(<CommandPalette open onOpenChange={vi.fn()} />);

    const unbound = commandHints(container).filter(
      (hint) => !canonicalCombos.has(normalizeHint(hint)),
    );

    expect(unbound).toEqual([]);
  });

  it('does not label the Chat action with the combination bound to Copy last message', () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    const copyDoc = KEYBOARD_SHORTCUT_DOCS.find((doc) => doc.description === 'Copy last message');
    expect(copyDoc).toBeDefined();

    const chatAction = screen.getByText('Chat').closest('button');
    expect(chatAction).not.toBeNull();
    expect(chatAction?.querySelector('kbd')).toBeNull();
  });
});
