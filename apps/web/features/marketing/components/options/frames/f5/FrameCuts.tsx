import type { CSSProperties } from 'react';
import { Syne } from 'next/font/google';
import { Header } from '@shared/components/layout/Header';
import { CutsStage } from './CutsStage';
import './frame-5.css';

const syne = Syne({ subsets: ['latin'], display: 'swap' });

const rootStyle = { '--fr5-font-display': syne.style.fontFamily } as CSSProperties;

export function FrameCuts() {
  return (
    <div data-design="agi" className="fr5" style={rootStyle}>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <CutsStage />
      </main>
    </div>
  );
}
