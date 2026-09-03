import Link from 'next/link';
import { Eyebrow, Prose, Stack } from '@/features/marketing/components/system';

export function policySectionId(eyebrow: string): string {
  const numbered = /^\s*(\d{1,2})\b/.exec(eyebrow);
  if (numbered) return `s-${numbered[1]}`;
  return `s-${eyebrow
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)}`;
}

export interface PolicyContentsExplicitSection {
  readonly label: string;
  readonly id: string;
}

export type PolicyContentsSection = string | PolicyContentsExplicitSection;

export interface PolicyContentsProps {
  sections: readonly PolicyContentsSection[];
  intro?: React.ReactNode;
}

function sectionLabel(section: PolicyContentsSection): string {
  return typeof section === 'string' ? section : section.label;
}

function sectionId(section: PolicyContentsSection): string {
  return typeof section === 'string' ? policySectionId(section) : section.id;
}

export function PolicyContents({ sections, intro }: PolicyContentsProps) {
  return (
    <nav className="agi-ds-policy-toc" aria-label="Contents">
      <Stack gap="tight">
        <Eyebrow>Contents</Eyebrow>
        {intro ? <Prose size="sm">{intro}</Prose> : null}
        <ol className="agi-ds-policy-toc-list">
          {sections.map((section) => (
            <li key={sectionLabel(section)}>
              <Link href={`#${sectionId(section)}`} className="agi-ds-link">
                {sectionLabel(section)}
              </Link>
            </li>
          ))}
        </ol>
      </Stack>
    </nav>
  );
}
