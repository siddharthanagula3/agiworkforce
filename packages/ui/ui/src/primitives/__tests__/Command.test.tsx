import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '../Command';

describe('Command', () => {
  it('renders items without crashing', () => {
    render(
      <Command>
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandItem>Item one</CommandItem>
        </CommandList>
      </Command>,
    );
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy();
    expect(screen.getByText('Item one')).toBeTruthy();
  });
});
