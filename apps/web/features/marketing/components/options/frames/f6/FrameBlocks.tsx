import type { CSSProperties } from 'react';
import { League_Spartan } from 'next/font/google';
import { Header } from '@shared/components/layout/Header';
import { BlocksPoster } from './BlocksPoster';
import './frame-6.css';

const leagueSpartan = League_Spartan({ subsets: ['latin'], display: 'swap' });

const rootStyle = { '--fr6-font-display': leagueSpartan.style.fontFamily } as CSSProperties;

export function FrameBlocks() {
  return (
    <div data-design="agi" className="fr6" style={rootStyle}>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <BlocksPoster />
      </main>
    </div>
  );
}
