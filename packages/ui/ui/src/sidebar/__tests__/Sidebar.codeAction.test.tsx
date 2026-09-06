import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';

// The Code surface owns its own left column, so it left the app rail. The one
// control that reaches it from every other surface is this button beside New
// chat, and it has to survive both sidebar widths. A caller with no Code
// destination (desktop, the extension) passes no handler and gets no button,
// rather than a control that navigates nowhere.
afterEach(() => {
  cleanup();
});

function renderSidebar(props: { collapsed?: boolean; onOpenCode?: () => void }) {
  return render(
    <Sidebar
      sessions={[]}
      mode="cloud"
      collapsed={props.collapsed ?? false}
      onNewChat={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onToggleCollapse={vi.fn()}
      {...(props.onOpenCode ? { onOpenCode: props.onOpenCode } : {})}
    />,
  );
}

describe('sidebar Code control', () => {
  it('renders beside New chat in the expanded header and routes to Code', () => {
    const onOpenCode = vi.fn();
    renderSidebar({ onOpenCode });

    const code = screen.getByRole('button', { name: 'AGI Code' });
    const newChat = screen.getByRole('button', { name: 'New chat' });

    expect(newChat.parentElement).toBe(code.parentElement);
    expect(newChat.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    code.click();
    expect(onOpenCode).toHaveBeenCalledTimes(1);
  });

  it('keeps the New chat pill height so the two controls read as one pair', () => {
    renderSidebar({ onOpenCode: vi.fn() });

    const code = screen.getByRole('button', { name: 'AGI Code' });
    expect(code.className).toContain('h-8');
    expect(code.className).toContain('w-8');
    expect(code.className).toContain('rounded-lg');
    expect(code.className).toContain('bg-[hsl(var(--muted))]');
  });

  it('renders in the collapsed icon rail, immediately after New chat', () => {
    const onOpenCode = vi.fn();
    renderSidebar({ collapsed: true, onOpenCode });

    const code = screen.getByRole('button', { name: 'AGI Code' });
    const newChat = screen.getByRole('button', { name: 'New chat' });
    const search = screen.getByRole('button', { name: 'Search' });

    expect(newChat.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(code.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    code.click();
    expect(onOpenCode).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the surface has no Code destination', () => {
    renderSidebar({});
    expect(screen.queryByRole('button', { name: 'AGI Code' })).toBeNull();

    cleanup();

    renderSidebar({ collapsed: true });
    expect(screen.queryByRole('button', { name: 'AGI Code' })).toBeNull();
  });
});
