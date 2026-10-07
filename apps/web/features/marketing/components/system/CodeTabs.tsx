'use client';

import { useTablistKeyboard } from '@agiworkforce/ui';
import { Check, Copy } from 'lucide-react';
import { useId, useState } from 'react';
import '../code-example-responsive.css';

export interface CodeTab {
  label: string;
  language: string;
  code: string;
  note?: string;
}

const COPY_LABEL = 'Copy';
const COPIED_LABEL = 'Copied';
const COPIED_ANNOUNCEMENT = 'Copied to clipboard';
const COPIED_RESET_MS = 1600;

type CodeTokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'function';

const CODE_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'const',
  'curl',
  'def',
  'export',
  'false',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'let',
  'new',
  'null',
  'print',
  'return',
  'true',
  'with',
  'DELETE',
  'GET',
  'PATCH',
  'POST',
  'PUT',
  'False',
  'None',
  'True',
]);

const COMMENT_START: Record<string, RegExp> = {
  shell: /(^|\s)#/u,
  python: /(^|\s)#/u,
  typescript: /(^|\s)\/\//u,
  javascript: /(^|\s)\/\//u,
};

const CODE_TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\()?/gu;

interface CodeToken {
  text: string;
  kind?: CodeTokenKind;
}

function tokenizeCodeLine(line: string, language: string): CodeToken[] {
  const commentAt = COMMENT_START[language]?.exec(line);
  const commentIndex = commentAt ? commentAt.index + commentAt[1]!.length : -1;
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const tokens: CodeToken[] = [];
  let cursor = 0;
  for (const match of code.matchAll(CODE_TOKEN)) {
    const [, quoted, numeric, word, call] = match;
    const start = match.index;
    if (start > cursor) tokens.push({ text: code.slice(cursor, start) });
    if (quoted) tokens.push({ text: quoted, kind: 'string' });
    else if (numeric)
      tokens.push(language === 'shell' ? { text: numeric } : { text: numeric, kind: 'number' });
    else if (word) {
      const kind = CODE_KEYWORDS.has(word) ? 'keyword' : call ? 'function' : undefined;
      tokens.push(kind ? { text: word, kind } : { text: word });
      if (call) tokens.push({ text: call });
    }
    cursor = start + match[0].length;
  }
  if (cursor < code.length) tokens.push({ text: code.slice(cursor) });
  if (commentIndex >= 0) tokens.push({ text: line.slice(commentIndex), kind: 'comment' });
  return tokens;
}

export function CodeTabs({ tabs, title }: { tabs: readonly CodeTab[]; title: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const tab = tabs[active] ?? tabs[0];
  const tabId = (position: number) => `${id}-tab-${position}`;
  const { onKeyDown, tabIndexFor } = useTablistKeyboard({
    count: tabs.length,
    active,
    onSelect: setActive,
    tabId,
  });
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
    <figure className="agi-ds-codetabs agi-code-responsive" aria-label={title}>
      <div className="agi-ds-codetabs-bar">
        <div
          className="agi-ds-codetabs-tabs"
          role="tablist"
          aria-label={title}
          onKeyDown={onKeyDown}
        >
          {tabs.map((entry, index) => (
            <button
              type="button"
              role="tab"
              id={tabId(index)}
              aria-selected={index === active}
              aria-controls={`${id}-panel`}
              tabIndex={tabIndexFor(index)}
              className="agi-ds-codetabs-tab"
              onClick={() => setActive(index)}
              key={entry.label}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button type="button" className="agi-ds-codetabs-copy" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? COPIED_LABEL : COPY_LABEL}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? COPIED_ANNOUNCEMENT : ''}
        </span>
      </div>
      <pre
        className="agi-ds-codetabs-code"
        id={`${id}-panel`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`${id}-tab-${active}`}
        data-language={tab.language}
      >
        {tab.code.split('\n').map((line, index) => (
          <span className="agi-ds-codetabs-line" key={index}>
            {line
              ? tokenizeCodeLine(line, tab.language).map((token, position) =>
                  token.kind ? (
                    <span data-token={token.kind} key={`${position}-${token.text}`}>
                      {token.text}
                    </span>
                  ) : (
                    token.text
                  ),
                )
              : ' '}
          </span>
        ))}
      </pre>
      {tab.note ? <figcaption className="agi-ds-codetabs-note">{tab.note}</figcaption> : null}
    </figure>
  );
}
