import Link from 'next/link';

/**
 * Table of contents for a long policy document.
 *
 * WHY THIS EXISTS
 * /privacy, /terms, /dpa and /security run to several hundred lines each. Before
 * this, none of their sections had an id, which meant nobody could cite one. A
 * reviewer asking "which clause covers sub-processor objection" had to say
 * "somewhere in the DPA"; a support reply could not link to the retention
 * schedule; and our own pages cross-referenced each other as "section 06 of the
 * DPA" — a phrase that goes stale the moment a section is inserted, which has
 * already happened once on /privacy.
 *
 * Anchored sections fix all three, and they are the plain expectation for a
 * published legal set: every comparable policy page is deep-linkable.
 *
 * HOW TO USE IT
 * Give each `<section>` an id built by `policySectionId`, then render this
 * component once near the top with the same list:
 *
 *   <section className="agi-section" id={policySectionId('01 · What we collect')}>
 *
 * Keep the labels identical to the section eyebrows. They are not two pieces of
 * copy — the eyebrow is the label, and if they drift the contents list starts
 * describing a document that is not there.
 */

/**
 * Stable anchor from an eyebrow.
 *
 * Built from the LEADING NUMBER only ("01 · What we collect" → "s-01"), not from
 * the words. That is deliberate: a section's wording gets edited far more often
 * than its position, and an anchor derived from the title breaks every inbound
 * link the moment someone improves a heading. A numbered anchor survives a
 * rewrite and only changes when the document is genuinely renumbered — at which
 * point the link SHOULD break, because the section it pointed at has moved.
 *
 * Falls back to a slug when an eyebrow carries no number, so a page that does
 * not use the numbered convention still gets usable anchors.
 */
export function policySectionId(eyebrow: string): string {
  const numbered = /^\s*(\d{1,2})\b/.exec(eyebrow);
  if (numbered) return `s-${numbered[1]}`;
  return `s-${eyebrow
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)}`;
}

export interface PolicyContentsProps {
  /** Section eyebrows in document order. Must match the rendered eyebrows. */
  sections: readonly string[];
  /**
   * Anything a reader should know before the list — the "start here" note.
   * Optional; omit rather than inventing one.
   */
  intro?: React.ReactNode;
}

export function PolicyContents({ sections, intro }: PolicyContentsProps) {
  return (
    <nav className="agi-policy-toc" aria-label="Contents">
      <p className="agi-section-eyebrow" style={{ marginTop: 0 }}>
        Contents
      </p>
      {intro ? <p className="agi-policy-toc-intro">{intro}</p> : null}
      <ol className="agi-policy-toc-list">
        {sections.map((eyebrow) => (
          <li key={eyebrow}>
            <Link href={`#${policySectionId(eyebrow)}`} className="agi-policy-toc-link">
              {eyebrow}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
