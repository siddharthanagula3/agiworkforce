import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '../Drawer';

describe('Drawer', () => {
  it('renders content when open', () => {
    render(
      <Drawer open>
        <DrawerContent>
          <DrawerTitle>Menu</DrawerTitle>
          <DrawerDescription>Quick actions.</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByText('Quick actions.')).toBeTruthy();
  });
});
