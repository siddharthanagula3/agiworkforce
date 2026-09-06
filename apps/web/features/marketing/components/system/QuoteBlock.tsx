import type { ReactNode } from 'react';

export function QuoteBlock({
  quote,
  name,
  role,
  mark,
}: {
  quote: string;
  name: string;
  role: string;
  mark?: ReactNode;
}) {
  return (
    <figure className="agi-ds-quote">
      {mark ? <span className="agi-ds-quote-mark">{mark}</span> : null}
      <blockquote className="agi-ds-quote-text">{quote}</blockquote>
      <figcaption className="agi-ds-quote-by">
        <span className="agi-ds-quote-name">{name}</span>
        <span className="agi-ds-quote-role">{role}</span>
      </figcaption>
    </figure>
  );
}
