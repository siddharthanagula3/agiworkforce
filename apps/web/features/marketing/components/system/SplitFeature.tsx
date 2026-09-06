import type { ReactNode } from 'react';
import { Checklist } from './Checklist';
import { Eyebrow } from './Eyebrow';

export interface SplitFeatureProps {
  id: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  points?: readonly string[];
  visual: ReactNode;
  flip?: boolean;
  cta?: ReactNode;
}

export function SplitFeature({
  id,
  eyebrow,
  title,
  body,
  points,
  visual,
  flip,
  cta,
}: SplitFeatureProps) {
  return (
    <article className="agi-ds-split" data-flip={flip ? 'true' : undefined} aria-labelledby={id}>
      <div className="agi-ds-split-copy">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="agi-ds-split-title" id={id}>
          {title}
        </h3>
        <div className="agi-ds-split-body">{body}</div>
        {points ? <Checklist items={points} /> : null}
        {cta ? <div className="agi-ds-split-cta">{cta}</div> : null}
      </div>
      <div className="agi-ds-split-visual">{visual}</div>
    </article>
  );
}
