/**
 * Renders model-produced prose as PLAIN TEXT.
 *
 * Three things this file deliberately does NOT do, each of them a real attack
 * surface rather than a style preference:
 *
 *  1. No `dangerouslySetInnerHTML`, ever. The answer text is downstream of
 *     retrieved documents, which are untrusted input.
 *     llm-guardrail-allow: prose only — this is the prohibition itself, not a
 *     call site. The file renders text nodes; no raw-HTML sink exists below.
 *  2. No markdown-to-HTML. A retrieved document can contain `[click](javascript:…)`.
 *  3. No auto-linkification of bare URLs in the prose. If a model can put a URL
 *     into the answer body and the widget turns it into an anchor, an injected
 *     document has a click target. Links come from ONE place — the server-
 *     resolved citation list — and `SupportCitationList` is the only component
 *     that renders an anchor for a reply.
 *
 * A test asserts that a URL in the body text produces no anchor element.
 */

import type { ReactElement } from 'react';

/** Splits on blank lines into paragraphs, and single newlines into soft breaks. */
export function renderSupportText(text: string): ReactElement[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length === 0) return [];

  return paragraphs.map((paragraph, paragraphIndex) => {
    const lines = paragraph.split('\n');
    return (
      <p key={`p-${String(paragraphIndex)}`}>
        {lines.map((line, lineIndex) => (
          <span key={`l-${String(lineIndex)}`}>
            {lineIndex > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </p>
    );
  });
}
