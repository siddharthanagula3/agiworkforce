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

export interface PolicyContentsProps {
  sections: readonly string[];
  intro?: React.ReactNode;
}

export function PolicyContents({ sections, intro }: PolicyContentsProps) {
  return (
    <nav className="agi-ds-policy-toc" aria-label="Contents">
      <Stack gap="tight">
        <Eyebrow>Contents</Eyebrow>
        {intro ? <Prose size="sm">{intro}</Prose> : null}
        <ol className="agi-ds-policy-toc-list">
          {sections.map((eyebrow) => (
            <li key={eyebrow}>
              <Link href={`#${policySectionId(eyebrow)}`} className="agi-ds-link">
                {eyebrow}
              </Link>
            </li>
          ))}
        </ol>
      </Stack>
    </nav>
  );
}
