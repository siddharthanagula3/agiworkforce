import Link from 'next/link';

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
  sections: readonly string[];
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
