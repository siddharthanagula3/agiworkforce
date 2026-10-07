import Link from 'next/link';
import { PRICING_BOARD } from './content';
import { Rise } from './Rise';
import { Section } from './Section';

const NUMERIC = /^\$/;

export function Pricing() {
  const cloud = PRICING_BOARD.lanes.find((lane) => lane.lane === 'cloud');
  return (
    <Section id="pricing" title={PRICING_BOARD.title} lead={PRICING_BOARD.lead}>
      <Rise>
        <div className="f2-board f2-board--pricing">
          <div className="f2-price-grid">
            {PRICING_BOARD.lanes.map((lane) => (
              <div key={lane.lane} className="f2-price-col" data-lane={lane.lane}>
                <div className="f2-price-head">
                  <i className="f2-square" aria-hidden="true" />
                  <span className="f2-h3">{lane.name}</span>
                </div>
                {NUMERIC.test(lane.value) ? (
                  <div className="f2-num f2-price-value">{lane.value}</div>
                ) : (
                  <div className="f2-h3 f2-price-value">{lane.value}</div>
                )}
                <p className="f2-text f2-price-note">{lane.note}</p>
                <Link
                  href={PRICING_BOARD.actions[lane.lane].href}
                  className="f2-link f2-price-action"
                >
                  {PRICING_BOARD.actions[lane.lane].label}
                </Link>
              </div>
            ))}
          </div>
          {cloud ? (
            <div className="f2-plans" data-lane={cloud.lane}>
              <div className="f2-plans-head">
                <i className="f2-square" aria-hidden="true" />
                <span className="f2-label">{PRICING_BOARD.plansLabel}</span>
              </div>
              <ul className="f2-tiers">
                {PRICING_BOARD.tiers.map((tier) => (
                  <li key={tier.name} className="f2-tier">
                    <span className="f2-label">{tier.name}</span>
                    <span className="f2-tier-line">
                      <span className="f2-h3">{tier.price}</span>
                      <span className="f2-label">{tier.cadence}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link href={PRICING_BOARD.cta.href} className="f2-link">
                {PRICING_BOARD.cta.label}
              </Link>
            </div>
          ) : null}
        </div>
      </Rise>
    </Section>
  );
}
