'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@agiworkforce/ui/sheet';
import { HelpSearch } from '@/features/support/components/HelpSearch';
import type { DocsNavGroup, DocsNavLink } from '../lib/docs-nav';
import { DocsSidebar } from './DocsSidebar';

export function DocsNavigation({
  groups,
  searchLinks,
}: {
  groups: readonly DocsNavGroup[];
  searchLinks: readonly DocsNavLink[];
}) {
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const phoneTriggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pendingSearchRef = useRef(false);

  const restoreNavigationFocus = (preferred: HTMLElement | null) => {
    const fallback = Array.from(
      navigationRef.current?.querySelectorAll<HTMLElement>('button') ?? [],
    ).find((element) => element.getClientRects().length > 0);
    const target =
      preferred && document.contains(preferred) && preferred.getClientRects().length > 0
        ? preferred
        : fallback;
    target?.focus();
  };

  const openSearch = useCallback(() => {
    if (pendingSearchRef.current) return;
    if (drawerOpen) {
      openerRef.current = phoneTriggerRef.current;
      pendingSearchRef.current = true;
      setDrawerOpen(false);
      return;
    }
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setOpen(true);
  }, [drawerOpen]);

  useEffect(
    () => () => {
      pendingSearchRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const trigger = phoneTriggerRef.current;
    if (!trigger) return;
    const closeOnDesktop = () => {
      if (window.getComputedStyle(trigger).display === 'none') setDrawerOpen(false);
    };
    window.addEventListener('resize', closeOnDesktop);
    const observer = new ResizeObserver(closeOnDesktop);
    observer.observe(trigger);
    closeOnDesktop();
    return () => {
      window.removeEventListener('resize', closeOnDesktop);
      observer.disconnect();
    };
  }, [drawerOpen]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      ) {
        return;
      }
      event.preventDefault();
      if (open) {
        dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
      } else {
        openSearch();
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [open, openSearch]);

  const navigateResults = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey
    ) {
      return;
    }
    const input = dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) return;
    const links = Array.from(
      dialogRef.current?.querySelectorAll<HTMLAnchorElement>('a.agi-ds-link[href]') ?? [],
    );
    const target = event.target;
    if (target !== input && !links.some((link) => link === target)) return;
    if (event.key === 'Enter' && target === input) {
      const first = links[0];
      if (first) {
        event.preventDefault();
        first.click();
      }
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (links.length === 0) return;
    const stops: HTMLElement[] = [input, ...links];
    const index = stops.findIndex((stop) => stop === target);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const next = stops[(index + direction + stops.length) % stops.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <>
      <aside className="dx-side" ref={navigationRef}>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button ref={phoneTriggerRef} type="button" className="dx-menu">
              <Menu aria-hidden="true" />
              <span>Browse documentation</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            data-design="agi"
            className="agi-modal-scope dx-nav-drawer"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (pendingSearchRef.current) {
                pendingSearchRef.current = false;
                setOpen(true);
              } else {
                restoreNavigationFocus(phoneTriggerRef.current);
              }
            }}
            onClickCapture={(event) => {
              if (
                event.button === 0 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !event.shiftKey &&
                event.target instanceof Element &&
                event.target.closest('a[href]')
              ) {
                setDrawerOpen(false);
              }
            }}
          >
            <SheetTitle className="dx-nav-drawer-title">Documentation</SheetTitle>
            <div className="dx-nav-drawer-body">
              <DocsSidebar groups={groups} onSearch={openSearch} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="dx-side-static">
          <DocsSidebar groups={groups} onSearch={openSearch} />
        </div>
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          ref={dialogRef}
          data-design="agi"
          className="agi-modal-scope dx-search-dialog"
          overlayProps={{ className: 'dx-search-overlay' }}
          disableAnimation
          closeLabel="Close documentation search"
          onOpenAutoFocus={(event) => {
            const input =
              dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]');
            if (input) {
              event.preventDefault();
              input.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreNavigationFocus(openerRef.current);
          }}
          onKeyDown={navigateResults}
          onClickCapture={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.shiftKey
            ) {
              return;
            }
            if (event.target instanceof Element && event.target.closest('a[href]')) {
              setOpen(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Search documentation</DialogTitle>
            <DialogDescription className="dx-search-description">
              Search article contents. Use Command or Control + K to open search, the arrow keys to
              move through results, and Escape to close.
            </DialogDescription>
          </DialogHeader>
          <HelpSearch />
          <nav className="dx-search-browse" aria-label="Browse documentation">
            {searchLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.title}
              </Link>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
