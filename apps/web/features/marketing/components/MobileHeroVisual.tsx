import Image from 'next/image';

import { COMING_SOON_LABEL, SURFACE_STATUS } from '@/lib/marketing-constants';

const MOBILE_UNRELEASED = SURFACE_STATUS.mobile === COMING_SOON_LABEL;

function AppleIcon() {
  return (
    <svg className="agi-store-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="agi-store-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.18 23.76c.37.21.8.22 1.17.04L17.8 16.7l-3.57-3.57-11.05 10.63zM20.43 10.6L17.8 9.13l-3.97 3.8 3.97 3.79 2.65-1.49a1.71 1.71 0 000-2.98l-.02-.65zM1.5.75a1.7 1.7 0 00-.5 1.2v19.9c0 .46.18.88.5 1.2L1.6 23 13.3 11.3v-.28L1.6.85 1.5.75zM3.18.24L14.23 11.3l-3.57 3.57L1.35.28C1.72.1 2.15.1 2.52.28l.66-.04z" />
    </svg>
  );
}

export function MobileHeroVisual() {
  return (
    <div className="agi-mobile-hero-wrap">
      {/* Phone screenshot — light */}
      <div className="agi-mobile-hero-phone dark:hidden">
        <Image
          src="/screenshots/mobile-light-v2.png"
          alt="AGI Mobile"
          width={320}
          height={692}
          className="agi-mobile-hero-img"
          priority
        />
      </div>
      {/* Phone screenshot — dark */}
      <div className="agi-mobile-hero-phone hidden dark:block">
        <Image
          src="/screenshots/mobile-dark-v2.png"
          alt="AGI Mobile"
          width={320}
          height={692}
          className="agi-mobile-hero-img"
          priority
        />
      </div>

      {/* Store buttons — right of phone, vertically centered.
          These are <span>s, not <a>s: an anchor with no href is a dead control
          that reads as a link. The visible text is the accessible text. */}
      <div className="agi-mobile-store-col">
        <span className="agi-store-soon">{SURFACE_STATUS.mobile}</span>
        {MOBILE_UNRELEASED ? (
          <>
            <span className="agi-store-btn">
              <AppleIcon />
              <div className="agi-store-text">
                <span className="agi-store-sub">Download on the</span>
                <span className="agi-store-name">App Store</span>
              </div>
            </span>
            <span className="agi-store-btn">
              <PlayIcon />
              <div className="agi-store-text">
                <span className="agi-store-sub">Get it on</span>
                <span className="agi-store-name">Google Play</span>
              </div>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
