'use client';

import * as React from 'react';

import { useConfirmAction } from './ConfirmAction';
import { useUiTranslation } from '../i18n';

interface UnsavedChangesEntry {
  dirty: boolean;
  released: boolean;
  onDiscard: (() => void) | undefined;
  prompt: (discard: () => void) => void;
}

const entries = new Set<UnsavedChangesEntry>();
let followingLink = false;

function activeEntries(): UnsavedChangesEntry[] {
  return [...entries].filter((entry) => entry.dirty && !entry.released);
}

export function hasUnsavedChanges(): boolean {
  return activeEntries().length > 0;
}

export function confirmNavigation(proceed: () => void): void {
  const pending = activeEntries();
  const first = pending[0];
  if (!first) {
    proceed();
    return;
  }
  first.prompt(() => {
    for (const entry of pending) {
      entry.released = true;
      entry.onDiscard?.();
    }
    proceed();
  });
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
}

function guardedAnchor(event: MouseEvent): HTMLAnchorElement | null {
  if (followingLink || event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute('download')) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return anchor;
}

function interceptLinkClick(event: MouseEvent) {
  const anchor = guardedAnchor(event);
  if (!anchor || !hasUnsavedChanges()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const href = anchor.href;
  confirmNavigation(() => {
    if (!anchor.isConnected) {
      window.location.assign(href);
      return;
    }
    followingLink = true;
    try {
      anchor.click();
    } finally {
      followingLink = false;
    }
  });
}

function register(entry: UnsavedChangesEntry) {
  if (entries.size === 0) {
    window.addEventListener('beforeunload', warnBeforeUnload);
    window.addEventListener('click', interceptLinkClick, true);
  }
  entries.add(entry);
}

function unregister(entry: UnsavedChangesEntry) {
  entries.delete(entry);
  if (entries.size === 0) {
    window.removeEventListener('beforeunload', warnBeforeUnload);
    window.removeEventListener('click', interceptLinkClick, true);
  }
}

export interface UnsavedChangesGuardOptions {
  dirty: boolean;
  title?: string;
  description?: string;
  onDiscard?: () => void;
}

export function useUnsavedChangesGuard({
  dirty,
  title,
  description,
  onDiscard,
}: UnsavedChangesGuardOptions): {
  confirmDiscard: (proceed: () => void) => void;
  dialog: React.ReactElement | null;
} {
  const { t } = useUiTranslation('common');
  const { confirm, dialog } = useConfirmAction();
  const entryRef = React.useRef<UnsavedChangesEntry>({
    dirty: false,
    released: false,
    onDiscard: undefined,
    prompt: () => undefined,
  });

  const resolvedTitle = title ?? t('unsavedChanges.title', 'Discard unsaved changes?');
  const resolvedDescription =
    description ??
    t(
      'unsavedChanges.description',
      'Your changes have not been saved. If you leave now, they will be lost.',
    );
  const discardLabel = t('unsavedChanges.discard', 'Discard');
  const keepEditingLabel = t('unsavedChanges.keepEditing', 'Keep editing');

  React.useEffect(() => {
    const entry = entryRef.current;
    register(entry);
    return () => unregister(entry);
  }, []);

  React.useEffect(() => {
    const entry = entryRef.current;
    entry.dirty = dirty;
    if (!dirty) entry.released = false;
  }, [dirty]);

  React.useEffect(() => {
    const entry = entryRef.current;
    entry.onDiscard = onDiscard;
    entry.prompt = (discard) =>
      confirm({
        title: resolvedTitle,
        description: resolvedDescription,
        confirmLabel: discardLabel,
        cancelLabel: keepEditingLabel,
        destructive: true,
        onConfirm: discard,
      });
  }, [confirm, onDiscard, resolvedTitle, resolvedDescription, discardLabel, keepEditingLabel]);

  const confirmDiscard = React.useCallback((proceed: () => void) => {
    const entry = entryRef.current;
    if (!entry.dirty || entry.released) {
      proceed();
      return;
    }
    entry.prompt(() => {
      entry.released = true;
      entry.onDiscard?.();
      proceed();
    });
  }, []);

  return { confirmDiscard, dialog };
}
