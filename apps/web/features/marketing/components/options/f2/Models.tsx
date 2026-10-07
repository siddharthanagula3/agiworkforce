import { Check } from 'lucide-react';
import { ProviderMark } from '@agiworkforce/ui';
import { ILLUSTRATION, MODELS, PICKER_ROWS } from './content';
import { Rise } from './Rise';
import { Section } from './Section';

const MARK_SIZE = 20;
const CHECK_SIZE = 18;

export function Models() {
  return (
    <Section id="models" title={MODELS.title} lead={MODELS.lead}>
      <div className="f2-split">
        <Rise className="f2-split-media">
          <div
            className="f2-picker"
            data-illustration
            role="img"
            aria-label="Illustration of the model picker with Auto selected"
          >
            <div className="f2-picker-head">
              <span className="f2-label">Model</span>
              <span className="f2-label">{ILLUSTRATION}</span>
            </div>
            <div className="f2-picker-row f2-picker-row--auto">
              <span className="f2-auto">Auto</span>
              <span className="f2-picker-note">{MODELS.autoNote}</span>
              <Check size={CHECK_SIZE} strokeWidth={2.25} aria-hidden="true" />
            </div>
            <ul className="f2-picker-list">
              {PICKER_ROWS.map((row) => (
                <li key={row.id} className="f2-picker-row">
                  <ProviderMark providerKey={row.id} size={MARK_SIZE} />
                  <span className="f2-picker-name">{row.label}</span>
                  {row.model ? <span className="f2-picker-model">{row.model}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </Rise>
        <dl className="f2-specs f2-specs--section f2-split-copy">
          {MODELS.points.map((point) => (
            <div key={point.title} className="f2-spec">
              <dt className="f2-h3">{point.title}</dt>
              <dd className="f2-text">{point.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
