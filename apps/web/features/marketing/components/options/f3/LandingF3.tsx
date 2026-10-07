import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Cable,
  Code,
  FolderOpen,
  Globe,
  Layers,
  MessageSquare,
  Microscope,
  Monitor,
  PanelRight,
  Smartphone,
  SquareTerminal,
} from 'lucide-react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import type { SurfaceId } from '@/lib/surface-status';
import { archivo } from './fonts';
import './landing-f3.css';
import { Board } from './Board';
import { Counter } from './Counter';
import { InView } from './InView';
import { ReceiptDiagram } from './ReceiptDiagram';
import {
  BOARD,
  CAPABILITIES,
  CLOSE,
  DEVELOPERS,
  FACTS,
  RECEIPT,
  SURFACE_ROWS,
  SURFACES_HEAD,
  type CapabilityId,
} from './content';

type Icon = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

const SURFACE_ICONS: Record<SurfaceId, Icon> = {
  web: Globe,
  cli: SquareTerminal,
  desktop: Monitor,
  mobile: Smartphone,
  chrome: PanelRight,
  vscode: Code,
};

const CAPABILITY_ICONS: Record<CapabilityId, Icon> = {
  chat: MessageSquare,
  artifacts: Layers,
  projects: FolderOpen,
  tools: Cable,
  memory: Brain,
  research: Microscope,
};

const ROW_ICON_SIZE = 28;
const TILE_ICON_SIZE = 48;
const TILE_STROKE = 1;
const ARROW_SIZE = 18;

function SectionHead({
  id,
  number,
  title,
  aside,
}: {
  id: string;
  number: string;
  title: string;
  aside: ReactNode;
}) {
  return (
    <div className="f3-head-row">
      <h2 id={id} className="f3-h2 f3-display">
        <span className="f3-num" aria-hidden="true">
          {number}
        </span>
        {title}
      </h2>
      <div className="f3-head-aside">{aside}</div>
    </div>
  );
}

export function LandingF3() {
  return (
    <div data-design="agi" className={`f3 ${archivo.variable}`}>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <section className="f3-hero f3-wrap" aria-labelledby="f3-hero-title">
          <div className="f3-hero-row">
            <h1 id="f3-hero-title" className="f3-h1 f3-display">
              {BOARD.title}
            </h1>
            <div className="f3-hero-actions">
              <Link href={BOARD.primary.href} className="f3-btn f3-btn-primary">
                {BOARD.primary.label}
              </Link>
              <Link href={BOARD.secondary.href} className="f3-btn f3-btn-secondary">
                {BOARD.secondary.label}
              </Link>
            </div>
          </div>
          <Board />
        </section>

        <InView as="section" className="f3-section f3-wrap" aria-labelledby="f3-receipt-title">
          <SectionHead
            id="f3-receipt-title"
            number={RECEIPT.number}
            title={RECEIPT.title}
            aside={<p className="f3-lead">{RECEIPT.lead}</p>}
          />
          <ReceiptDiagram />
        </InView>

        <InView as="section" className="f3-section f3-wrap" aria-labelledby="f3-surfaces-title">
          <SectionHead
            id="f3-surfaces-title"
            number={SURFACES_HEAD.number}
            title={SURFACES_HEAD.title}
            aside={<p className="f3-lead">{SURFACES_HEAD.lead}</p>}
          />
          <ul className="f3-rows">
            {SURFACE_ROWS.map((surface) => {
              const SurfaceIcon = SURFACE_ICONS[surface.id];
              return (
                <li className="f3-srow" key={surface.id}>
                  <span className="f3-srow-icon">
                    <SurfaceIcon size={ROW_ICON_SIZE} aria-hidden />
                  </span>
                  <div className="f3-srow-name">
                    <h3 className="f3-h3 f3-display">{surface.name}</h3>
                    <span className="f3-srow-kind">{surface.kind}</span>
                  </div>
                  <p className="f3-text f3-srow-blurb">{surface.blurb}</p>
                  <span className="f3-status" data-live={surface.live ? 'true' : 'false'}>
                    {surface.status}
                  </span>
                  <span className="f3-srow-action">
                    <Link
                      href={surface.action.href}
                      className={
                        surface.action.primary ? 'f3-btn f3-btn-primary' : 'f3-btn f3-btn-secondary'
                      }
                    >
                      {surface.action.label}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </InView>

        <InView as="section" className="f3-section f3-wrap" aria-labelledby="f3-capabilities-title">
          <SectionHead
            id="f3-capabilities-title"
            number={CAPABILITIES.number}
            title={CAPABILITIES.title}
            aside={<p className="f3-lead">{CAPABILITIES.lead}</p>}
          />
          <ul className="f3-tiles">
            {CAPABILITIES.items.map((item) => {
              const TileIcon = CAPABILITY_ICONS[item.id];
              return (
                <li key={item.id}>
                  <Link href={item.href} className="f3-tile">
                    <span className="f3-tile-icon" data-illustration>
                      <TileIcon size={TILE_ICON_SIZE} strokeWidth={TILE_STROKE} aria-hidden />
                    </span>
                    <span className="f3-tile-copy">
                      <span className="f3-h3 f3-display">{item.title}</span>
                      <span className="f3-text">{item.body}</span>
                    </span>
                    <span className="f3-tile-arrow">
                      Open
                      <ArrowRight size={ARROW_SIZE} aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </InView>

        <InView as="section" className="f3-section f3-wrap" aria-labelledby="f3-dev-title">
          <SectionHead
            id="f3-dev-title"
            number={DEVELOPERS.number}
            title={DEVELOPERS.title}
            aside={<p className="f3-lead">{DEVELOPERS.note}</p>}
          />
          <div className="f3-dev">
            <div className="f3-terminal" data-illustration>
              <div className="f3-term-bar" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              {DEVELOPERS.transcript.map((line, index) => (
                <p className="f3-term-line" data-kind={line.kind} key={`${index}-${line.kind}`}>
                  {line.text}
                </p>
              ))}
            </div>
            <ul className="f3-dev-rows">
              {DEVELOPERS.rows.map((row) => (
                <li className="f3-drow" data-lane={row.lane ?? undefined} key={row.title}>
                  <h3 className="f3-h3 f3-display f3-drow-title">{row.title}</h3>
                  <p className="f3-text">{row.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </InView>

        <InView as="section" className="f3-section f3-wrap" aria-labelledby="f3-close-title">
          <ul className="f3-facts">
            {FACTS.map((fact) => (
              <li className="f3-fact" key={fact.label}>
                <Counter value={fact.value} />
                <span className="f3-fact-label">{fact.label}</span>
              </li>
            ))}
          </ul>
          <div className="f3-close">
            <div className="f3-close-row">
              <h2 id="f3-close-title" className="f3-h2 f3-display">
                <span className="f3-num" aria-hidden="true">
                  {CLOSE.number}
                </span>
                {CLOSE.title}
              </h2>
              <div className="f3-hero-actions">
                <Link href={CLOSE.primary.href} className="f3-btn f3-btn-primary">
                  {CLOSE.primary.label}
                </Link>
                <Link href={CLOSE.secondary.href} className="f3-btn f3-btn-secondary">
                  {CLOSE.secondary.label}
                </Link>
              </div>
            </div>
            <p className="f3-text f3-close-body">{CLOSE.body}</p>
            <p className="f3-close-summary">{CLOSE.summary}</p>
          </div>
        </InView>
      </main>
      <MarketingFooter />
    </div>
  );
}
