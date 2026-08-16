
import type { ReactElement } from 'react';

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
