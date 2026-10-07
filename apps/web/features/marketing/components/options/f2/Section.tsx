import type { ReactNode } from 'react';

export function Section({
  id,
  title,
  lead,
  className,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  className?: string;
  children: ReactNode;
}) {
  const titleId = `f2-${id}-title`;
  return (
    <section
      className={['f2-section', className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
    >
      <div className="f2-wrap">
        <div className="f2-head">
          <h2 id={titleId} className="f2-h2">
            {title}
          </h2>
          <p className="f2-lead">{lead}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
