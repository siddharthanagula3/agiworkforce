import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Menubar, MenubarMenu, MenubarTrigger } from '../Menubar';

describe('Menubar', () => {
  it('renders a trigger without crashing', () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
        </MenubarMenu>
      </Menubar>,
    );
    expect(screen.getByText('File')).toBeTruthy();
  });
});
