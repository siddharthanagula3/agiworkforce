'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface DocsTocItem {
  id: string;
  title: string;
}

export function DocsToc({ items }: { items: readonly DocsTocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node !== null);
    const first = headings[0];
    if (!first) {
      setActive(null);
      return;
    }
    let frame: number | null = null;
    let disposed = false;
    const updateActive = () => {
      frame = null;
      if (disposed) return;
      let current = first.id;
      for (const heading of headings) {
        const margin = Number.parseFloat(window.getComputedStyle(heading).scrollMarginTop);
        const boundary = Number.isFinite(margin) ? margin : 0;
        if (Math.round(heading.getBoundingClientRect().top) > Math.round(boundary)) break;
        current = heading.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!disposed && frame === null) frame = requestAnimationFrame(updateActive);
    };
    const observer = new IntersectionObserver(schedule);
    const resize = new ResizeObserver(schedule);
    for (const heading of headings) {
      observer.observe(heading);
      resize.observe(heading);
    }
    const article = first.closest('article');
    if (article) resize.observe(article);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    schedule();
    return () => {
      disposed = true;
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav
      className="dx-toc"
      aria-label="On this page"
      data-expanded={expanded}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !expanded) return;
        event.preventDefault();
        setExpanded(false);
        trigger.current?.focus();
      }}
    >
      <p className="dx-toc-label">On this page</p>
      <button
        ref={trigger}
        type="button"
        className="dx-toc-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>On this page</span>{' '}
        <span className="dx-toc-toggle-state">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      <ul className="dx-toc-list" id={listId}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="dx-toc-link"
              aria-current={active === item.id ? 'true' : undefined}
              onClick={(event) => {
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.altKey &&
                  !event.shiftKey
                ) {
                  setExpanded(false);
                }
              }}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
