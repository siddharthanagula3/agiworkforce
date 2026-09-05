'use client';

import Link from 'next/link';
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { NavGroupDefinition } from './nav';

const CLOSE_DELAY_MS = 140;

export function NavGroup({ group }: { group: NavGroupDefinition }) {
  const [open, setOpen] = useState(false);
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
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      className="agi-ds-navgroup"
      data-open={open ? 'true' : undefined}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
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
        onClick={() => setOpen((value) => !value)}
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
                onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
          >
            {group.footer.label} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
