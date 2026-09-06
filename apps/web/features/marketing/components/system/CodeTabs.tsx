'use client';

import { useId, useState } from 'react';

export interface CodeTab {
  label: string;
  language: string;
  code: string;
  note?: string;
}

const COPY_LABEL = 'Copy';
const COPIED_LABEL = 'Copied';
const COPIED_RESET_MS = 1600;

export function CodeTabs({ tabs, title }: { tabs: readonly CodeTab[]; title: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const tab = tabs[active] ?? tabs[0];
  if (!tab) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className="agi-ds-codetabs" aria-label={title}>
      <div className="agi-ds-codetabs-bar">
        <div className="agi-ds-codetabs-tabs" role="tablist" aria-label={title}>
          {tabs.map((entry, index) => (
            <button
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={index === active}
              aria-controls={`${id}-panel`}
              className="agi-ds-codetabs-tab"
              onClick={() => setActive(index)}
              key={entry.label}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button type="button" className="agi-ds-codetabs-copy" onClick={copy}>
          {copied ? COPIED_LABEL : COPY_LABEL}
        </button>
      </div>
      <pre
        className="agi-ds-codetabs-code"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        data-language={tab.language}
      >
        {tab.code.split('\n').map((line, index) => (
          <span className="agi-ds-codetabs-line" key={index}>
            {line || ' '}
          </span>
        ))}
      </pre>
      {tab.note ? <figcaption className="agi-ds-codetabs-note">{tab.note}</figcaption> : null}
    </figure>
  );
}
