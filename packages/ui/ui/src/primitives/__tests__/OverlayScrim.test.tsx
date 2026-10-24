import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { AlertDialog, AlertDialogOverlay } from '../AlertDialog';
import { Dialog, DialogOverlay } from '../Dialog';
import { Drawer, DrawerOverlay } from '../Drawer';
import { Sheet, SheetOverlay } from '../Sheet';

const foundation = readFileSync(
  resolve(import.meta.dirname, '../../../../design-tokens/src/foundation.css'),
  'utf8',
);

const overlays: ReadonlyArray<[string, ReactElement]> = [
  [
    'Dialog',
    <Dialog open key="dialog">
      <DialogOverlay data-testid="scrim" />
    </Dialog>,
  ],
  [
    'AlertDialog',
    <AlertDialog open key="alert">
      <AlertDialogOverlay data-testid="scrim" />
    </AlertDialog>,
  ],
  [
    'Sheet',
    <Sheet open key="sheet">
      <SheetOverlay data-testid="scrim" />
    </Sheet>,
  ],
  [
    'Drawer',
    <Drawer open key="drawer">
      <DrawerOverlay data-testid="scrim" />
    </Drawer>,
  ],
];

describe('overlay scrim', () => {
  it('is declared once, for both themes, in the foundation tokens', () => {
    expect(foundation.match(/^\s*--scrim:/gm)).toHaveLength(1);
  });

  it.each(overlays)('%s dims the page with the shared scrim token', (_name, tree) => {
    render(tree);
    const scrim = screen.getByTestId('scrim');
    expect(scrim.className).toContain('bg-[var(--scrim)]');
    expect(scrim.className).not.toMatch(/\bbg-black\//);
  });
});
