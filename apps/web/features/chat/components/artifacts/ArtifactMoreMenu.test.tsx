import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ArtifactMoreMenu,
  MORE_ARTIFACT_ACTIONS_LABEL,
  type ArtifactMenuItem,
} from './ArtifactMoreMenu';

function items(overrides: Partial<ArtifactMenuItem>[] = []): ArtifactMenuItem[] {
  const base: ArtifactMenuItem[] = [
    { id: 'refresh', label: 'Refresh preview', onSelect: vi.fn() },
    { id: 'html', label: 'Download as HTML', group: 'Download', onSelect: vi.fn() },
    { id: 'md', label: 'Download as Markdown', group: 'Download', onSelect: vi.fn() },
  ];
  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function openMenu() {
  const trigger = screen.getByRole('button', { name: MORE_ARTIFACT_ACTIONS_LABEL });
  fireEvent.click(trigger);
  return trigger;
}

describe('ArtifactMoreMenu', () => {
  it('renders nothing when there is nothing to offer', () => {
    render(<ArtifactMoreMenu items={[]} />);

    expect(screen.queryByRole('button', { name: MORE_ARTIFACT_ACTIONS_LABEL })).toBeNull();
  });

  it('opens a menu with the first item focused and headings for each group', () => {
    render(<ArtifactMoreMenu items={items()} />);

    const trigger = openMenu();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: MORE_ARTIFACT_ACTIONS_LABEL })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('menuitem', { name: 'Refresh preview' })).toHaveFocus();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('walks the items with the arrow keys, Home and End, wrapping at both ends', () => {
    render(<ArtifactMoreMenu items={items()} />);
    openMenu();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Download as HTML' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Download as Markdown' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Refresh preview' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Download as Markdown' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'Refresh preview' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<ArtifactMoreMenu items={items()} />);
    const trigger = openMenu();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when focus leaves with Tab and when the reader presses outside', () => {
    render(
      <div>
        <ArtifactMoreMenu items={items()} />
        <p>Elsewhere</p>
      </div>,
    );
    openMenu();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();

    openMenu();
    fireEvent.pointerDown(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs the chosen action, closes the menu and puts focus back on the trigger', () => {
    const list = items();
    render(<ArtifactMoreMenu items={list} />);
    const trigger = openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as HTML' }));

    expect(list[1]?.onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('skips a disabled item when walking and never runs it', () => {
    const list = items([{}, { disabled: true }]);
    render(<ArtifactMoreMenu items={list} />);
    openMenu();

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Download as Markdown' })).toHaveFocus();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as HTML' }));
    expect(list[1]?.onSelect).not.toHaveBeenCalled();
  });
});
