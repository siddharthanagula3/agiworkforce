'use client';

import type { ExtraSection } from '@agiworkforce/unified-chat/message-format-cards';

/**
 * Every card parser classifies only the shapes its layout has a slot for. What
 * it cannot classify lands here instead of being dropped, so the card is never
 * a lossy view of the answer behind it.
 */
export function CardExtraSections({ sections }: { sections: ExtraSection[] }) {
  const visible = sections.filter((section) => section.lines.length > 0);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((section, index) => (
        <section
          key={`extra-${index}-${section.heading}`}
          data-testid="card-extra-section"
          className="mt-6 first:mt-0"
        >
          {section.heading && (
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {section.heading}
            </h4>
          )}
          <ul className="space-y-1.5">
            {section.lines.map((line, lineIndex) => (
              <li key={`extra-${index}-${lineIndex}`} className="text-sm leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
