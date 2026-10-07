'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';

export interface ShowcaseSurface {
  id: string;
  name: string;
  tab: string;
  body: string;
  capabilities: readonly string[];
  platforms: string;
  status: string;
  live: boolean;
  cta: { href: string; label: string };
  visual: ReactNode;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

export function SurfaceShowcase({
  surfaces,
  label,
}: {
  surfaces: readonly ShowcaseSurface[];
  label: string;
}) {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  function select(index: number) {
    setActive(index);
    tabs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = surfaces.length - 1;
    if (NEXT_KEYS.has(event.key)) {
      event.preventDefault();
      select(active === last ? 0 : active + 1);
    } else if (PREVIOUS_KEYS.has(event.key)) {
      event.preventDefault();
      select(active === 0 ? last : active - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(last);
    }
  }

  return (
    <div>
      <div className="lnx-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {surfaces.map((surface, index) => (
          <button
            key={surface.id}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${surface.id}`}
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${surface.id}`}
            tabIndex={index === active ? 0 : -1}
            className="lnx-tab"
            onClick={() => setActive(index)}
          >
            {surface.live ? <span className="lnx-tab-dot" aria-hidden="true" /> : null}
            {surface.tab}
          </button>
        ))}
      </div>
      {surfaces.map((surface, index) => (
        <div
          key={surface.id}
          role="tabpanel"
          id={`${baseId}-panel-${surface.id}`}
          aria-labelledby={`${baseId}-tab-${surface.id}`}
          hidden={index !== active}
          className="lnx-panel"
        >
          <div className="lnx-panel-copy">
            <span className="lnx-status" data-live={surface.live}>
              {surface.status}
            </span>
            <h3 className="lnx-panel-name">{surface.name}</h3>
            <p className="lnx-panel-body">{surface.body}</p>
            <ul className="lnx-list">
              {surface.capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
            <div className="lnx-panel-foot">
              <Link href={surface.cta.href} className="lnx-link">
                {surface.cta.label}
              </Link>
              <span className="lnx-meter">{surface.platforms}</span>
            </div>
          </div>
          <div className="lnx-panel-visual">{surface.visual}</div>
        </div>
      ))}
    </div>
  );
}
