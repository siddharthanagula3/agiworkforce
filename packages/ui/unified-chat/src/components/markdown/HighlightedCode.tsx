import React, { useEffect, useState } from 'react';

import { highlightToLines, readHighlightCache, type HighlightedLine } from './shikiHighlighter';

const LINE_BREAK = '\n';

export interface HighlightedCodeProps {
  code: string;
  language: string;
  enabled: boolean;
  className?: string;
}

export const HighlightedCode: React.FC<HighlightedCodeProps> = ({
  code,
  language,
  enabled,
  className,
}) => {
  const [lines, setLines] = useState<readonly HighlightedLine[] | null>(() =>
    enabled ? readHighlightCache(code, language) : null,
  );

  useEffect(() => {
    if (!enabled) {
      setLines(null);
      return;
    }

    const cached = readHighlightCache(code, language);
    setLines(cached);
    if (cached) return;

    let cancelled = false;
    void highlightToLines(code, language)
      .then((next) => {
        if (!cancelled && next) setLines(next);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [code, enabled, language]);

  if (!lines) return <code className={className}>{code}</code>;

  return (
    <code className={className}>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {line.map((token, tokenIndex) => (
            <span key={tokenIndex} className="shiki-token" style={token.style}>
              {token.content}
            </span>
          ))}
          {lineIndex < lines.length - 1 ? LINE_BREAK : null}
        </React.Fragment>
      ))}
    </code>
  );
};
