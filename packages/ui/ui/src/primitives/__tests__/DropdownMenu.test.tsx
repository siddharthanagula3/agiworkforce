import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
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
});
