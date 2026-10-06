import type { CSSProperties } from 'react';
import '../code-example-responsive.css';

export type TranscriptLineKind = 'cmd' | 'out' | 'dim';

export interface TranscriptLine {
  kind: TranscriptLineKind;
  text: string;
}

export function Transcript({
  label,
  lines,
  style,
}: {
  label: string;
  lines: readonly TranscriptLine[];
  style?: CSSProperties;
}) {
  return (
    <pre
      className="agi-lp-terminal agi-code-responsive"
      role="region"
      aria-label={label}
      tabIndex={0}
      style={style}
    >
      {lines.map((line, index) => (
        <span className="agi-lp-terminal-line" data-kind={line.kind} key={`${index}-${line.text}`}>
          {line.text}
        </span>
      ))}
    </pre>
  );
}
