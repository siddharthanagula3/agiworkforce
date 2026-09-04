'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import {
  Copy,
  GitFork,
  MoreHorizontal,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import {
  CONSOLE_ANSWER,
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  CONSOLE_URL,
  RECEIPT_LABELS,
  type ReceiptKey,
} from './landing-content';
import { WindowBar } from './WindowBar';

const ACTIONS = [
  { Icon: Copy, label: 'Copy' },
  { Icon: Volume2, label: 'Read aloud' },
  { Icon: ThumbsUp, label: 'Good answer' },
  { Icon: ThumbsDown, label: 'Poor answer' },
  { Icon: RefreshCw, label: 'Regenerate' },
  { Icon: GitFork, label: 'Branch' },
  { Icon: MoreHorizontal, label: 'More' },
] as const;

const ICON_SIZE = 15;
const ICON_STROKE = 1.75;
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);
const FIRST_KEY = 'Home';
const LAST_KEY = 'End';
const RECEIPT_KEYS = Object.keys(RECEIPT_LABELS) as ReceiptKey[];
const TABLIST_LABEL = 'Where this request runs';
const RECEIPT_LABEL = 'Route receipt for this answer';

export function HeroConsole() {
  const [index, setIndex] = useState(0);
  const baseId = useId();
  const active = CONSOLE_LANES[index] ?? CONSOLE_LANES[0]!;
  const tabId = (position: number) => `${baseId}-tab-${position}`;
  const panelId = `${baseId}-panel`;

  const focusTab = (target: number) => {
    setIndex(target);
    document.getElementById(tabId(target))?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = CONSOLE_LANES.length - 1;
    if (event.key === FIRST_KEY) {
      event.preventDefault();
      focusTab(0);
      return;
    }
    if (event.key === LAST_KEY) {
      event.preventDefault();
      focusTab(last);
      return;
    }
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    focusTab((index + step + CONSOLE_LANES.length) % CONSOLE_LANES.length);
  };

  return (
    <div className="agi-home-window agi-home-console" data-lane={active.lane}>
      <WindowBar url={CONSOLE_URL}>
        <div
          className="agi-home-lanes"
          role="tablist"
          aria-label={TABLIST_LABEL}
          onKeyDown={onKeyDown}
        >
          {CONSOLE_LANES.map((lane, position) => (
            <button
              key={lane.lane}
              id={tabId(position)}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-controls={panelId}
              tabIndex={position === index ? 0 : -1}
              className="agi-home-lane-tab"
              data-lane={lane.lane}
              onClick={() => setIndex(position)}
            >
              <span className="agi-home-lane-mark" aria-hidden="true" />
              {lane.name}
            </button>
          ))}
        </div>
      </WindowBar>

      <div
        className="agi-home-console-body"
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(index)}
      >
        <p className="agi-home-user">{CONSOLE_PROMPT}</p>
        <p className="agi-home-activity" key={`activity-${active.lane}`}>
          <span className="agi-home-activity-dot" aria-hidden="true" />
          {active.activity}
        </p>
        <div className="agi-home-answer">
          {CONSOLE_ANSWER.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <p className="agi-home-answer-heading">{section.heading}</p>
              <ul>
                {section.items.map(([term, detail]) => (
                  <li key={term}>
                    <strong>{term}:</strong> {detail}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="agi-home-modelline" key={`model-${active.lane}`}>
          {active.modelLine}
        </p>
        <div className="agi-home-actions" aria-hidden="true">
          {ACTIONS.map(({ Icon, label }) => (
            <span key={label} title={label}>
              <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            </span>
          ))}
        </div>
      </div>

      <dl
        className="agi-home-receipt"
        aria-live="polite"
        aria-label={RECEIPT_LABEL}
        key={active.lane}
      >
        {RECEIPT_KEYS.map((key) => (
          <div className="agi-home-receipt-row" key={key} data-key={key}>
            <dt>{RECEIPT_LABELS[key]}</dt>
            <dd>
              {key === 'route' ? <span className="agi-home-lane-mark" aria-hidden="true" /> : null}
              {active.receipt[key]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
