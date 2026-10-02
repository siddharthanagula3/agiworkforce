import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../DropdownMenu';

describe('DropdownMenu', () => {
  it('caps menu width to the collision padding inside the viewport', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Options</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole('menu').className).toContain('max-w-[calc(100vw-16px)]');
  });
});

function ModeMenu({
  onValueChange,
  disabledValue,
}: {
  onValueChange: (value: string) => void;
  disabledValue?: string;
}) {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Mode</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value="ask" onValueChange={onValueChange}>
          {['ask', 'auto', 'skip'].map((value, index) => (
            <DropdownMenuRadioItem key={value} value={value} disabled={value === disabledValue}>
              {value}
              <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuItem onSelect={() => onValueChange('unbadged')}>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('digit shortcuts in an open menu', () => {
  it('selects the item whose badge shows the digit, and closes the menu', () => {
    const onValueChange = vi.fn();
    render(<ModeMenu onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('menu'), { key: '2' });

    expect(onValueChange).toHaveBeenCalledWith('auto');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ignores a digit no badge shows', () => {
    const onValueChange = vi.fn();
    render(<ModeMenu onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('menu'), { key: '4' });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('leaves a digit held with a modifier to whatever owns that chord', () => {
    const onValueChange = vi.fn();
    render(<ModeMenu onValueChange={onValueChange} />);

    fireEvent.keyDown(screen.getByRole('menu'), { key: '2', metaKey: true });
    fireEvent.keyDown(screen.getByRole('menu'), { key: '2', ctrlKey: true });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('leaves a digit typed into a field inside the menu as text', () => {
    const onValueChange = vi.fn();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Mode</DropdownMenuTrigger>
        <DropdownMenuContent>
          <input aria-label="Filter" />
          <DropdownMenuItem onSelect={() => onValueChange('first')}>
            First
            <DropdownMenuShortcut>1</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Filter' }), { key: '1' });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('does not select a disabled item', () => {
    const onValueChange = vi.fn();
    render(<ModeMenu onValueChange={onValueChange} disabledValue="skip" />);

    fireEvent.keyDown(screen.getByRole('menu'), { key: '3' });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('selects only the submenu item when the submenu holds the key', () => {
    const onParent = vi.fn();
    const onChild = vi.fn();
    render(<MenuWithSubmenu onParent={onParent} onChild={onChild} childBadge />);

    fireEvent.keyDown(submenu(), { key: '2' });

    expect(onChild).toHaveBeenCalledTimes(1);
    expect(onParent).not.toHaveBeenCalled();
  });

  it('does not reach past the submenu to an item the user is not looking at', () => {
    const onParent = vi.fn();
    const onChild = vi.fn();
    render(<MenuWithSubmenu onParent={onParent} onChild={onChild} childBadge={false} />);

    fireEvent.keyDown(submenu(), { key: '2' });

    expect(onParent).not.toHaveBeenCalled();
    expect(onChild).not.toHaveBeenCalled();
  });

  it('leaves a digit another handler already took', () => {
    const onValueChange = vi.fn();
    render(<ModeMenu onValueChange={onValueChange} />);
    const menu = screen.getByRole('menu');
    const event = new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true });
    event.preventDefault();

    fireEvent(menu, event);

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

function MenuWithSubmenu({
  onParent,
  onChild,
  childBadge,
}: {
  onParent: () => void;
  onChild: () => void;
  childBadge: boolean;
}) {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Mode</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onParent}>
          Parent item
          <DropdownMenuShortcut>2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={onChild}>
              Child item
              {childBadge && <DropdownMenuShortcut>2</DropdownMenuShortcut>}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function submenu(): HTMLElement {
  const menus = screen.getAllByRole('menu');
  const inner = menus.find(
    (menu) => within(menu).queryByText('Child item') && !within(menu).queryByText('Parent item'),
  );
  if (!inner) throw new Error('the submenu did not open');
  return inner;
}
