'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import {
  Copy,
  GitFork,
  MoreHorizontal,
  Pin,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import {
  CONSOLE_ACTIVITY,
  CONSOLE_ANSWER,
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  LANE_MARKS,
  modelName,
} from './landing-content';

const ACTIONS = [
  { Icon: Copy, label: 'Copy' },
  { Icon: Pin, label: 'Pin' },
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
const CONSOLE_URL = 'agiworkforce.com/chat';

export function HeroConsole() {
  const [index, setIndex] = useState(0);
  const baseId = useId();
  const active = CONSOLE_LANES[index] ?? CONSOLE_LANES[0]!;
  const tabId = (position: number) => `${baseId}-tab-${position}`;
  const panelId = `${baseId}-panel`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const target = (index + step + CONSOLE_LANES.length) % CONSOLE_LANES.length;
    setIndex(target);
    document.getElementById(tabId(target))?.focus();
  };

  return (
    <div className="agi-lp-console" data-lane={active.lane}>
      <div className="agi-lp-console-bar">
        <span className="agi-lp-console-url">{CONSOLE_URL}</span>
        <div
          className="agi-lp-lanes"
          role="tablist"
          aria-label="Where this request runs"
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
              className="agi-lp-lane-tab"
              data-lane={lane.lane}
              onClick={() => setIndex(position)}
            >
              <span className="agi-lp-lane-mark" aria-hidden="true">
                {LANE_MARKS[lane.lane]}
              </span>
              {lane.name}
            </button>
          ))}
        </div>
      </div>

      <div
        className="agi-lp-console-body"
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(index)}
      >
        <p className="agi-lp-user">{CONSOLE_PROMPT}</p>
        <p className="agi-lp-activity">
          <span className="agi-lp-activity-dot" aria-hidden="true" />
          {CONSOLE_ACTIVITY}
        </p>
        <div className="agi-lp-answer">
          {CONSOLE_ANSWER.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
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
        <p className="agi-lp-modelline">
          {modelName(active.modelId)}
          <span> · {active.ranOn}</span>
        </p>
        <div className="agi-lp-actions" aria-hidden="true">
          {ACTIONS.map(({ Icon, label }) => (
            <span key={label} title={label}>
              <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            </span>
          ))}
        </div>
      </div>

      <p className="agi-lp-receipt" key={active.lane}>
        <span className="agi-lp-receipt-mark" aria-hidden="true">
          {LANE_MARKS[active.lane]}
        </span>
        {active.receipt.map((part) => (
          <span key={part} className="agi-lp-receipt-part">
            {part}
          </span>
        ))}
      </p>
      <p className="agi-lp-console-note" aria-live="polite">
        {active.leaves} <span>Available on {active.availableOn}.</span>
      </p>
    </div>
  );
}
