import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { CLOSE_PLATE, PRIMARY, SECONDARY } from './content';
import { Rise } from './Rise';

const MARK_SIZE = 40;

export function Close() {
  return (
    <section className="f2-section f2-section--close" aria-labelledby="f2-close-title">
      <div className="f2-wrap">
        <Rise>
          <div className="f2-close">
            <div className="f2-close-copy">
              <AgiMark size={MARK_SIZE} />
              <h2 id="f2-close-title" className="f2-h2">
                {CLOSE_PLATE.title}
              </h2>
              <p className="f2-text">{CLOSE_PLATE.body}</p>
            </div>
            <div className="f2-close-actions">
              <div className="f2-actions">
                <Link href={PRIMARY.href} className="f2-btn f2-btn--primary">
                  {PRIMARY.label}
                </Link>
                <Link href={SECONDARY.href} className="f2-btn f2-btn--secondary">
                  {SECONDARY.label}
                </Link>
              </div>
              <p className="f2-label">{CLOSE_PLATE.summary}</p>
            </div>
          </div>
        </Rise>
      </div>
    </section>
  );
}
