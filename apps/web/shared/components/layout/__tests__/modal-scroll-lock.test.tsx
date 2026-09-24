import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  CommandDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@agiworkforce/ui';

const repoRoot = resolve(process.cwd(), '../..');
const primitivesDir = resolve(repoRoot, 'packages/ui/ui/src/primitives');
const MODAL_ENGINES = /from '(@radix-ui\/react-dialog|@radix-ui\/react-alert-dialog|vaul)'/;
const LOCK_ATTRIBUTE = 'data-scroll-locked';

const OPEN: Record<string, () => ReactElement> = {
  Dialog: () => (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Rename project</DialogTitle>
        <DialogDescription>Give the project a new name.</DialogDescription>
        <div data-testid="inside">Body</div>
      </DialogContent>
    </Dialog>
  ),
  AlertDialog: () => (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogTitle>Delete conversation</AlertDialogTitle>
        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        <div data-testid="inside">Body</div>
      </AlertDialogContent>
    </AlertDialog>
  ),
  Sheet: () => (
    <Sheet open>
      <SheetContent side="left">
        <SheetTitle>Navigation</SheetTitle>
        <SheetDescription>Every destination.</SheetDescription>
        <div data-testid="inside">Body</div>
      </SheetContent>
    </Sheet>
  ),
  Drawer: () => (
    <Drawer open>
      <DrawerContent>
        <DrawerTitle>Attach</DrawerTitle>
        <DrawerDescription>Choose a source.</DrawerDescription>
        <div data-testid="inside">Body</div>
      </DrawerContent>
    </Drawer>
  ),
  Command: () => (
    <CommandDialog open>
      <div data-testid="inside">Body</div>
    </CommandDialog>
  ),
};

function modalPrimitives(): string[] {
  return readdirSync(primitivesDir)
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => MODAL_ENGINES.test(readFileSync(join(primitivesDir, name), 'utf8')))
    .map((name) => name.replace(/\.tsx$/, ''))
    .sort();
}

function wheelIsCancelled(target: Element): boolean {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('a modal holds the page behind it still', () => {
  it('knows every modal primitive the design system ships', () => {
    expect(modalPrimitives()).toEqual(Object.keys(OPEN).sort());
  });

  for (const name of Object.keys(OPEN)) {
    it(`${name} locks the page scroll while open and releases it when it closes`, () => {
      const behind = document.createElement('div');
      behind.textContent = 'Page content';
      document.body.appendChild(behind);

      const view = render(OPEN[name]!());
      expect(Number(document.body.getAttribute(LOCK_ATTRIBUTE))).toBeGreaterThan(0);
      expect(wheelIsCancelled(behind)).toBe(true);
      expect(screen.getByTestId('inside')).toBeInTheDocument();

      view.unmount();
      expect(document.body.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
    });
  }
});

const HAND_ROLLED_ROOTS = ['apps/web/app', 'apps/web/features', 'apps/web/shared', 'packages/ui'];
const LOCKS_ITSELF = /document\.body\.style\.overflow\s*=\s*['"]hidden['"]|<RemoveScroll\b/;
const OWNS_KEYBOARD_CONTRACT = /\b(useDialogKeyboard|useOverlayDialog)\s*\(/;

/**
 * Dialogs drawn by hand rather than on a primitive, which take no scroll lock.
 * Each is recorded for the lane that owns it; a new one fails here instead of
 * joining them.
 */
const UNLOCKED_HAND_ROLLED_MODALS: Record<string, string> = {
  'apps/web/app/gallery/GalleryClient.tsx':
    'three hand-drawn gallery previews, no scroll lock on a scrolling page; owned by the public pages lane (apps/web/app/gallery)',
  'apps/web/features/chat/components/ImageGenerationCard.tsx':
    'hand-drawn image editor and aspect dialogs, no scroll lock; owned by the chat lanes (apps/web/features/chat)',
  'apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx':
    'hand-drawn full-screen sheet on a phone, no scroll lock; owned by the chat lanes (apps/web/features/chat)',
  'apps/web/features/chat/components/research/ResearchPanel.tsx':
    'hand-drawn full-screen sheet on a phone, no scroll lock; owned by the chat lanes (apps/web/features/chat)',
  'apps/web/features/chat/components/work-session/WorkSessionPanel.tsx':
    'hand-drawn full-screen sheet on a phone, no scroll lock; owned by the chat lanes (apps/web/features/chat)',
  'apps/web/features/desktop-host/components/BrowserToolsDialog.tsx':
    'hand-drawn desktop-host dialog, no scroll lock; owned by the desktop lane (apps/web/features/desktop-host)',
  'apps/web/features/desktop-host/components/LocalCommandDialog.tsx':
    'hand-drawn desktop-host dialog, no scroll lock; owned by the desktop lane (apps/web/features/desktop-host)',
  'apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx':
    'hand-drawn desktop-host dialog, no scroll lock; owned by the desktop lane (apps/web/features/desktop-host)',
  'apps/web/features/support/components/SupportPanel.tsx':
    'hand-drawn support panel, modal on a narrow viewport only, no scroll lock; owned by the support lane (apps/web/features/support)',
  'packages/ui/unified-chat/src/components/AttachmentMenu.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/ChatInterface.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/CheckpointManager.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/CommandPalette.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/KeyboardShortcutsDialog.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/KeyboardShortcutsOverlay.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/SettingsShell.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/library/LibraryView.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
  'packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx':
    'hand-drawn dialog in the desktop chat package, no scroll lock; owned by the desktop lane (packages/ui/unified-chat)',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.(test|spec|stories)\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function claimsModal(file: string, text: string): boolean {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, 4);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isJsxAttribute(node) && node.name.getText() === 'aria-modal') {
      const value = node.initializer?.getText().replace(/[{}'"]/g, '');
      if (value !== 'false') found = true;
    }
    if (
      ts.isPropertyAssignment(node) &&
      /^['"]aria-modal['"]$/.test(node.name.getText()) &&
      node.initializer.kind !== ts.SyntaxKind.FalseKeyword
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function unlockedHandRolledModals(): string[] {
  const out: string[] = [];
  for (const root of HAND_ROLLED_ROOTS) {
    for (const file of sourceFiles(resolve(repoRoot, root))) {
      if (file.startsWith(primitivesDir)) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes('aria-modal')) continue;
      if (claimsModal(file, text) && !LOCKS_ITSELF.test(text)) out.push(relative(repoRoot, file));
    }
  }
  return out.sort();
}

function handRolledWebModalsWithoutKeyboardContract(): string[] {
  const out: string[] = [];
  for (const root of HAND_ROLLED_ROOTS.filter((path) => path.startsWith('apps/web/'))) {
    for (const file of sourceFiles(resolve(repoRoot, root))) {
      if (file.startsWith(primitivesDir)) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes('aria-modal')) continue;
      if (claimsModal(file, text) && !OWNS_KEYBOARD_CONTRACT.test(text)) {
        out.push(relative(repoRoot, file));
      }
    }
  }
  return out.sort();
}

describe('a dialog drawn by hand takes the same lock or is recorded', () => {
  const found = unlockedHandRolledModals();

  it('adds no new hand-drawn modal without a scroll lock', () => {
    expect(found.filter((file) => !(file in UNLOCKED_HAND_ROLLED_MODALS))).toEqual([]);
  });

  it('drops an entry once its dialog is fixed or gone', () => {
    expect(
      Object.keys(UNLOCKED_HAND_ROLLED_MODALS).filter((file) => !found.includes(file)),
    ).toEqual([]);
  });

  it('records why each entry is still open', () => {
    for (const reason of Object.values(UNLOCKED_HAND_ROLLED_MODALS)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});

describe('a hand-drawn Web modal owns the dialog keyboard contract', () => {
  it('moves focus in, traps Tab, handles Escape and restores the opener through a shared hook', () => {
    expect(handRolledWebModalsWithoutKeyboardContract()).toEqual([]);
  });
});
