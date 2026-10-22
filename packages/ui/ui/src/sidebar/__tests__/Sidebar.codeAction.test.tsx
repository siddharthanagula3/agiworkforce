import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';

// The Code surface owns its own left column, so it left the app rail. The one
// control that reaches it from every other surface is the Home/Code switch
// under the header, and it has to survive both sidebar widths. A caller with no Code
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
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onToggleCollapse={vi.fn()}
      {...(props.onOpenCode ? { onOpenCode: props.onOpenCode } : {})}
    />,
  );
}

describe('sidebar Code control', () => {
  it('renders Home and Code as one two-segment control under the header, Home selected', () => {
    const onOpenCode = vi.fn();
    renderSidebar({ onOpenCode });

    const group = screen.getByRole('group', { name: 'Switch between Home and Code' });
    const home = screen.getByRole('button', { name: 'Home' });
    const code = screen.getByRole('button', { name: 'AGI Code' });
    const newChat = screen.getByRole('button', { name: 'New chat' });

    expect(home.parentElement).toBe(group);
    expect(code.parentElement).toBe(group);
    expect(code.textContent).toBe('Code');
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(code.getAttribute('aria-current')).toBeNull();
    expect(newChat.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    code.click();
    expect(onOpenCode).toHaveBeenCalledTimes(1);
  });

  it('takes Home to the composer home through the host new-chat handler', () => {
    const onNewChat = vi.fn();
    render(
      <Sidebar
        sessions={[]}
        onNewChat={onNewChat}
        onOpenSearch={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onOpenCode={vi.fn()}
      />,
    );

    screen.getByRole('button', { name: 'Home' }).click();
    expect(onNewChat).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByRole('group', { name: 'Switch between Home and Code' })).toBeNull();

    cleanup();

    renderSidebar({ collapsed: true });
    expect(screen.queryByRole('button', { name: 'AGI Code' })).toBeNull();
  });
});
