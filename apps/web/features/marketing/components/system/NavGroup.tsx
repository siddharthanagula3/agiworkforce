'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { NavGroupDefinition } from './nav';

const CLOSE_DELAY_MS = 140;

export function NavGroup({ group }: { group: NavGroupDefinition }) {
  const [openState, setOpenState] = useState<'hover' | 'activated' | null>(null);
  const open = openState !== null;
  const pathname = usePathname() ?? '';
  const current =
    group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ||
    pathname === group.footer?.href;
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenState(null), CLOSE_DELAY_MS);
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpenState(null);
    }
  };

  // Panel scrolling does not reach this non-capturing window listener.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      cancelClose();
      setOpenState(null);
    };
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpenState(null);
      triggerRef.current?.focus();
    }
  };

  const onTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    cancelClose();
    const pointer = event.detail > 0;
    setOpenState((state) => {
      if (pointer && state === 'hover') return 'activated';
      return state === null ? 'activated' : null;
    });
  };

  return (
    <div
      className="agi-ds-navgroup"
      data-open={open ? 'true' : undefined}
      data-current={current ? 'true' : undefined}
      onMouseEnter={() => {
        cancelClose();
        setOpenState((state) => state ?? 'hover');
      }}
      onMouseLeave={scheduleClose}
      onFocus={cancelClose}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className="agi-ds-navlink agi-ds-navgroup-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onTriggerClick}
      >
        {group.label}
        <span className="agi-ds-navgroup-chevron" aria-hidden="true" />
      </button>
      <div
        id={panelId}
        className="agi-ds-navpanel"
        data-columns={group.columns ?? 1}
        hidden={!open}
      >
        <ul className="agi-ds-navpanel-list">
          {group.items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="agi-ds-navpanel-item"
                aria-current={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                    ? 'page'
                    : undefined
                }
                onClick={() => setOpenState(null)}
              >
                <span className="agi-ds-navpanel-title">{item.label}</span>
                {item.description ? (
                  <span className="agi-ds-navpanel-desc">{item.description}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        {group.footer ? (
          <Link
            href={group.footer.href}
            className="agi-ds-navpanel-footer"
            aria-current={pathname === group.footer.href ? 'page' : undefined}
            onClick={() => setOpenState(null)}
          >
            {group.footer.label}
            <ArrowRight className="agi-ds-navpanel-arrow" aria-hidden="true" focusable="false" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
