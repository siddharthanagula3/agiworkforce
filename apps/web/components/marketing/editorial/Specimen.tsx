import type { ReactNode } from 'react';

interface SpecimenProps {
  /** Apply drop-cap treatment to the first letter of first paragraph. */
  dropCap?: boolean;
  /** Column count at md+ breakpoints. Defaults to 3. */
  columns?: 2 | 3;
  children: ReactNode;
}

/**
 * Multi-column editorial body wrapper.
 * Single column on <md; 2 or 3 columns on >=md with column rules.
 * Optional drop-cap on first paragraph.
 */
export function Specimen({ dropCap = false, columns = 3, children }: SpecimenProps): ReactNode {
  const colClass = columns === 2 ? 'md:columns-2' : 'md:columns-3';

  return (
    <div
      className={[
        'specimen',
        colClass,
        'gap-x-8',
        // Body type
        'font-body font-normal text-[1.0625rem] leading-[1.65]',
        // Max reading width (applied per-column via CSS column layout)
        '[&>*]:max-w-[62ch]',
        // Column rules
        '[column-rule:1px_solid_var(--color-rule-soft)]',
        // Drop-cap modifier
        dropCap ? 'specimen--dropcap' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
