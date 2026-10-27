import { useState } from 'react';

import { sanitizeSvg } from '../../lib/sanitize-svg';

export function SvgConceptGallery({ slides }: { slides: readonly string[] }) {
  const safe = slides.map((slide) => sanitizeSvg(slide)).filter((slide) => slide.length > 0);
  const [index, setIndex] = useState(0);
  if (safe.length === 0) return null;
  const current = Math.min(index, safe.length - 1);
  const svg = safe[current] ?? '';
  const srcDoc = `<!DOCTYPE html><html><head><style>html,body{margin:0;height:100%;background:#111318;display:grid;place-items:center}svg{max-width:100%;max-height:100%}</style></head><body>${svg}</body></html>`;

  return (
    <section className="my-4" data-testid="svg-concept-gallery" aria-label="Design concepts">
      <iframe
        sandbox=""
        srcDoc={srcDoc}
        title={`Concept ${current + 1} of ${safe.length}`}
        className="h-64 w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-code-bg)]"
      />
      {safe.length > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md px-3 text-sm"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={current === 0}
          >
            Prev
          </button>
          <span className="text-sm tabular-nums">
            {current + 1} / {safe.length}
          </span>
          <button
            type="button"
            className="min-h-11 rounded-md px-3 text-sm"
            onClick={() => setIndex((value) => Math.min(safe.length - 1, value + 1))}
            disabled={current === safe.length - 1}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
