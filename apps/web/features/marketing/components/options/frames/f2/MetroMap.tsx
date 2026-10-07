'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useReducedMotionFlag } from '@agiworkforce/ui/auth-scene';

import { LANE_IDS, type LaneId } from '@/features/marketing/components/system/lanes';

import {
  branchPopDelay,
  DESKTOP_LAYOUT,
  drawDelay,
  easeInOut,
  PHONE_LAYOUT,
  stationPopDelay,
  TICKET_IN_MS,
  TRAIN_HOLD_MS,
  TRAIN_MS,
  TRAIN_START_MS,
  TRAIN_STOP_BEFORE_END,
  type MetroLayout,
  type Station,
  type Track,
} from './metro';

export interface TicketRow {
  key: string;
  label: string;
  lines: readonly string[];
}

export interface MetroLane {
  lane: LaneId;
  name: string;
  rows: readonly TicketRow[];
  note: string | null;
}

interface MetroMapProps {
  copy: ReactNode;
  legendTitle: string;
  lanes: readonly MetroLane[];
  prompt: string;
  availability: string;
  note: string;
  mapLabel: string;
}

const PULSE_MS = 420;
const LIVE_RADIUS = 18;
const SOON_RADIUS = 12;
const ORIGIN_RADIUS = 18;
const TERMINUS_RADIUS = 22;
const LABEL_GAP = 20;
const STATUS_GAP = 40;
const RING_GAP = 5;
const SIGN_HEIGHT = 34;
const SIGN_GAP = 10;
const SIGN_PAD = 14;
const SIGN_CHAR = 8.6;
const ORIGIN_SIGN_CHAR = 8.4;

function cssVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}

function stationLabelPosition(station: Station) {
  if (station.labelSide === 'right') {
    return {
      anchor: 'start' as const,
      nameX: station.point.x + 26,
      nameY: station.point.y - 3,
      statusX: station.point.x + 26,
      statusY: station.point.y + 17,
    };
  }
  const reach = station.live ? LIVE_RADIUS + RING_GAP + 4 : SOON_RADIUS + 2;
  return {
    anchor: 'middle' as const,
    nameX: station.point.x,
    nameY: station.point.y + reach + LABEL_GAP,
    statusX: station.point.x,
    statusY: station.point.y + reach + STATUS_GAP,
  };
}

const PLATE_CHAR = 8.2;
const PLATE_PAD = 6;

function StationNode({
  station,
  delay,
  pulsing,
  plate,
}: {
  station: Station;
  delay: number;
  pulsing: boolean;
  plate: boolean;
}) {
  const label = stationLabelPosition(station);
  const plateWidth =
    Math.max(station.name.length, station.status.length) * PLATE_CHAR + PLATE_PAD * 2;
  const signText = `${station.name} · ${station.status}`;
  const signWidth = signText.length * SIGN_CHAR + SIGN_PAD * 2;
  const reach = station.live ? LIVE_RADIUS + RING_GAP : SOON_RADIUS + 2;
  const signY = station.point.y - reach - SIGN_GAP - SIGN_HEIGHT;
  const radius = station.live ? LIVE_RADIUS : SOON_RADIUS;
  return (
    <a
      className="fr2-station"
      data-lane={station.lane}
      data-live={station.live ? 'true' : 'false'}
      data-pulse={pulsing ? 'true' : undefined}
      href={station.href}
      aria-label={`${station.name}, ${station.status.toLowerCase()}`}
      style={cssVars({ '--fr2-delay': `${Math.round(delay)}ms` })}
    >
      <g className="fr2-station-pop">
        <circle
          className={station.live ? 'fr2-station-live' : 'fr2-station-soon'}
          cx={station.point.x}
          cy={station.point.y}
          r={radius}
        />
        {station.live ? (
          <circle
            className="fr2-station-ring"
            cx={station.point.x}
            cy={station.point.y}
            r={radius + RING_GAP}
          />
        ) : null}
      </g>
      {plate ? (
        <rect
          className="fr2-label-plate"
          x={label.nameX - plateWidth / 2}
          y={label.nameY - 17}
          width={plateWidth}
          height={label.statusY - label.nameY + 24}
          rx={6}
        />
      ) : null}
      <text className="fr2-station-name" x={label.nameX} y={label.nameY} textAnchor={label.anchor}>
        {station.name}
      </text>
      <text
        className="fr2-station-status"
        x={label.statusX}
        y={label.statusY}
        textAnchor={label.anchor}
      >
        {station.status}
      </text>
      <g className="fr2-sign">
        <rect
          x={station.point.x - signWidth / 2}
          y={signY}
          width={signWidth}
          height={SIGN_HEIGHT}
          rx={8}
        />
        <text x={station.point.x} y={signY + SIGN_HEIGHT / 2 + 6} textAnchor="middle">
          {signText}
        </text>
      </g>
    </a>
  );
}

function MapSvg({
  layout,
  className,
  prompt,
  mapLabel,
  showSign,
  pulseKey,
  trainRef,
  hoverLane,
  onHoverLane,
}: {
  layout: MetroLayout;
  className: string;
  prompt: string;
  mapLabel: string;
  showSign: boolean;
  pulseKey: string | null;
  trainRef: (element: SVGGElement | null) => void;
  hoverLane: LaneId | null;
  onHoverLane: (lane: LaneId | null) => void;
}) {
  const maskBase = useId();
  const originSignWidth = prompt.length * ORIGIN_SIGN_CHAR + SIGN_PAD * 2;
  const originSign = {
    x: 0,
    y: layout.origin.y - 206,
    width: originSignWidth,
    height: 44,
  };
  const branchDelay = branchPopDelay(layout);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={mapLabel}
      data-hover-lane={hoverLane ?? undefined}
    >
      <defs>
        {layout.tracks.map((track) => (
          <mask
            key={track.lane}
            id={`${maskBase}-${track.lane}`}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={layout.width}
            height={layout.height}
          >
            <path
              className="fr2-draw"
              d={track.path}
              style={cssVars({
                '--fr2-len': track.length,
                '--fr2-delay': `${drawDelay(track.lane)}ms`,
              })}
            />
          </mask>
        ))}
        <mask
          id={`${maskBase}-branch`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={layout.width}
          height={layout.height}
        >
          <path
            className="fr2-draw"
            d={layout.branch.path}
            style={cssVars({
              '--fr2-len': layout.branch.length,
              '--fr2-delay': `${Math.round(branchDelay)}ms`,
              '--fr2-draw-ms': '420ms',
            })}
          />
        </mask>
      </defs>

      {layout.tracks.map((track) => (
        <g
          key={track.lane}
          className="fr2-line"
          data-lane={track.lane}
          mask={`url(#${maskBase}-${track.lane})`}
          onPointerEnter={() => onHoverLane(track.lane)}
          onPointerLeave={() => onHoverLane(null)}
        >
          {track.solidPath ? <path className="fr2-rail-solid" d={track.solidPath} /> : null}
          {track.dashedPath ? <path className="fr2-rail-dashed" d={track.dashedPath} /> : null}
        </g>
      ))}
      <g
        className="fr2-line fr2-line-branch"
        data-lane={layout.branch.lane}
        mask={`url(#${maskBase}-branch)`}
      >
        <path className="fr2-rail-dashed" d={layout.branch.path} />
      </g>
      {layout.tracks.map((track) => (
        <path key={track.lane} className="fr2-rail" data-rail={track.lane} d={track.path} />
      ))}

      <g className="fr2-origin">
        <circle
          className="fr2-origin-disc"
          cx={layout.origin.x}
          cy={layout.origin.y}
          r={ORIGIN_RADIUS}
        />
        <circle className="fr2-origin-core" cx={layout.origin.x} cy={layout.origin.y} r={7} />
      </g>
      {showSign ? (
        <g className="fr2-origin-sign">
          <line
            className="fr2-origin-stem"
            x1={layout.origin.x}
            y1={originSign.y + originSign.height}
            x2={layout.origin.x}
            y2={layout.origin.y - ORIGIN_RADIUS}
          />
          <rect
            x={originSign.x}
            y={originSign.y}
            width={originSign.width}
            height={originSign.height}
            rx={10}
          />
          <text x={originSign.x + SIGN_PAD} y={originSign.y + originSign.height / 2 + 6}>
            {prompt}
          </text>
        </g>
      ) : null}

      {layout.tracks.map((track) =>
        track.stations.map((station) => (
          <StationNode
            key={station.key}
            station={station}
            delay={stationPopDelay(track.lane, track, station)}
            pulsing={pulseKey === station.key}
            plate={layout.orientation === 'vertical'}
          />
        )),
      )}
      <StationNode
        station={layout.branch.station}
        delay={branchDelay + 420}
        pulsing={false}
        plate={layout.orientation === 'vertical'}
      />

      <g className="fr2-train" ref={trainRef}>
        <rect className="fr2-train-body" x={-22} y={-10} width={44} height={20} rx={5} />
        <rect className="fr2-train-stripe" x={-22} y={-10} width={44} height={6} rx={3} />
        <rect className="fr2-train-window" x={-13} y={0} width={9} height={6} rx={1.5} />
        <rect className="fr2-train-window" x={4} y={0} width={9} height={6} rx={1.5} />
      </g>
      <g className="fr2-terminus">
        <circle
          className="fr2-terminus-disc"
          cx={layout.terminus.x}
          cy={layout.terminus.y}
          r={TERMINUS_RADIUS}
        />
        <circle className="fr2-terminus-core" cx={layout.terminus.x} cy={layout.terminus.y} r={9} />
      </g>
    </svg>
  );
}

function visibleSvg(container: HTMLElement): SVGSVGElement | null {
  for (const svg of container.querySelectorAll<SVGSVGElement>('svg.fr2-svg')) {
    if (svg.getClientRects().length > 0) return svg;
  }
  return null;
}

function layoutFor(svg: SVGSVGElement): MetroLayout {
  return svg.classList.contains('fr2-svg-phone') ? PHONE_LAYOUT : DESKTOP_LAYOUT;
}

function poseAt(rail: SVGPathElement, length: number, total: number): string {
  const at = Math.min(Math.max(length, 0), total);
  const point = rail.getPointAtLength(at);
  const ahead = rail.getPointAtLength(Math.min(total, at + 2));
  const behind = rail.getPointAtLength(Math.max(0, at - 2));
  const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
  return `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${angle.toFixed(2)})`;
}

function liveStation(track: Track): Station | undefined {
  return [...track.stations].reverse().find((station) => station.live);
}

export function MetroMap({
  copy,
  legendTitle,
  lanes,
  prompt,
  availability,
  note,
  mapLabel,
}: MetroMapProps) {
  const reduced = useReducedMotionFlag();
  const [lane, setLane] = useState<LaneId>('cloud');
  const [printed, setPrinted] = useState(false);
  const [hoverLane, setHoverLane] = useState<LaneId | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [ticketShown, setTicketShown] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const trains = useRef(new Set<SVGGElement>());
  const frame = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const legendRef = useRef<HTMLDivElement>(null);

  const trainRef = useCallback((element: SVGGElement | null) => {
    if (element) trains.current.add(element);
  }, []);

  const stopTrain = useCallback(() => {
    if (frame.current !== 0) cancelAnimationFrame(frame.current);
    frame.current = 0;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  const placeTrainAtEnd = useCallback((target: LaneId) => {
    const container = mapRef.current;
    const svg = container ? visibleSvg(container) : null;
    if (!svg) return;
    const rail = svg.querySelector<SVGPathElement>(`[data-rail="${target}"]`);
    const train = svg.querySelector<SVGGElement>('.fr2-train');
    if (!rail || !train) return;
    const total = rail.getTotalLength();
    train.setAttribute('transform', poseAt(rail, total - TRAIN_STOP_BEFORE_END, total));
    train.dataset['state'] = 'arrived';
  }, []);

  const runTrain = useCallback(
    (target: LaneId, onArrive: () => void) => {
      stopTrain();
      const container = mapRef.current;
      const svg = container ? visibleSvg(container) : null;
      if (!svg) {
        onArrive();
        return;
      }
      const rail = svg.querySelector<SVGPathElement>(`[data-rail="${target}"]`);
      const train = svg.querySelector<SVGGElement>('.fr2-train');
      if (!rail || !train) {
        onArrive();
        return;
      }
      const layout = layoutFor(svg);
      const track = layout.tracks.find((candidate) => candidate.lane === target)!;
      const live = liveStation(track);
      const total = rail.getTotalLength();
      const stop = total - TRAIN_STOP_BEFORE_END;
      const holdFraction = live ? live.distance / track.length : null;
      const phases: { from: number; to: number; duration: number; hold: boolean }[] = [];
      if (holdFraction !== null && holdFraction > 0 && holdFraction < 1) {
        phases.push({ from: 0, to: holdFraction, duration: TRAIN_MS * holdFraction, hold: false });
        phases.push({ from: holdFraction, to: holdFraction, duration: TRAIN_HOLD_MS, hold: true });
        phases.push({
          from: holdFraction,
          to: 1,
          duration: TRAIN_MS * (1 - holdFraction),
          hold: false,
        });
      } else {
        phases.push({ from: 0, to: 1, duration: TRAIN_MS, hold: false });
      }
      train.dataset['state'] = 'running';
      train.setAttribute('transform', poseAt(rail, 0, total));
      let phaseIndex = 0;
      let phaseStart = 0;
      let pulsed = false;
      const tick = (now: number) => {
        const phase = phases[phaseIndex];
        if (!phase) {
          frame.current = 0;
          train.dataset['state'] = 'arrived';
          onArrive();
          return;
        }
        if (phaseStart === 0) phaseStart = now;
        const progress = Math.min(1, (now - phaseStart) / phase.duration);
        const eased = phase.hold ? 1 : easeInOut(progress);
        const fraction = phase.from + (phase.to - phase.from) * eased;
        train.setAttribute('transform', poseAt(rail, fraction * stop, total));
        if (phase.hold && !pulsed && live) {
          pulsed = true;
          setPulseKey(live.key);
          timers.current.push(setTimeout(() => setPulseKey(null), PULSE_MS));
        }
        if (progress >= 1) {
          phaseIndex += 1;
          phaseStart = 0;
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [stopTrain],
  );

  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      setTicketShown(true);
      setPrinted(true);
      placeTrainAtEnd('cloud');
      return;
    }
    const show = setTimeout(() => setTicketShown(true), TICKET_IN_MS);
    const start = setTimeout(() => runTrain('cloud', () => setPrinted(true)), TRAIN_START_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(start);
      stopTrain();
    };
  }, [reduced, runTrain, stopTrain, placeTrainAtEnd]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopTrain();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stopTrain]);

  const chooseLane = (next: LaneId) => {
    if (next === lane) return;
    setLane(next);
    if (reduced) {
      placeTrainAtEnd(next);
      return;
    }
    setPrinted(false);
    runTrain(next, () => setPrinted(true));
  };

  const onLegendKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = LANE_IDS.indexOf(lane);
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % 3;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index + 2) % 3;
    else return;
    event.preventDefault();
    const next = LANE_IDS[nextIndex]!;
    chooseLane(next);
    legendRef.current?.querySelector<HTMLButtonElement>(`button[data-lane="${next}"]`)?.focus();
  };

  const active = lanes.find((candidate) => candidate.lane === lane) ?? lanes[0]!;
  const motion = reduced === null ? undefined : reduced ? 'reduced' : 'full';

  return (
    <div className="fr2-body" data-motion={motion}>
      <div className="fr2-top">
        {copy}
        <div
          ref={legendRef}
          className="fr2-legend"
          role="radiogroup"
          aria-label={legendTitle}
          onKeyDown={onLegendKey}
        >
          <span className="fr2-legend-title">{legendTitle}</span>
          <div className="fr2-legend-row">
            {lanes.map((candidate) => (
              <button
                key={candidate.lane}
                type="button"
                role="radio"
                className="fr2-toggle"
                data-lane={candidate.lane}
                aria-checked={candidate.lane === lane}
                tabIndex={candidate.lane === lane ? 0 : -1}
                onClick={() => chooseLane(candidate.lane)}
              >
                <i className="fr2-swatch" aria-hidden="true" />
                {candidate.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="fr2-prompt-sign">{prompt}</p>

      <div
        ref={mapRef}
        className="fr2-map"
        data-illustration=""
        data-lane={lane}
        data-hover-lane={hoverLane ?? undefined}
      >
        <MapSvg
          layout={DESKTOP_LAYOUT}
          className="fr2-svg fr2-svg-desktop"
          prompt={prompt}
          mapLabel={mapLabel}
          showSign
          pulseKey={pulseKey}
          trainRef={trainRef}
          hoverLane={hoverLane}
          onHoverLane={setHoverLane}
        />
        <MapSvg
          layout={PHONE_LAYOUT}
          className="fr2-svg fr2-svg-phone"
          prompt={prompt}
          mapLabel={mapLabel}
          showSign={false}
          pulseKey={pulseKey}
          trainRef={trainRef}
          hoverLane={hoverLane}
          onHoverLane={setHoverLane}
        />
        <div
          className="fr2-ticket"
          data-lane={lane}
          data-shown={ticketShown ? 'true' : 'false'}
          data-printed={printed ? 'true' : 'false'}
          aria-live="polite"
          style={cssVars({ '--fr2-rows': active.rows.length + (active.note ? 1 : 0) })}
        >
          <div className="fr2-ticket-stripe" />
          <dl className="fr2-ticket-rows">
            {active.rows.map((row, index) => (
              <div key={row.key} className="fr2-ticket-row" style={cssVars({ '--fr2-row': index })}>
                <dt>{row.label}</dt>
                <dd>
                  {row.lines.map((line) => (
                    <span key={line} className="fr2-ticket-line">
                      {line}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
            {active.note ? (
              <div
                className="fr2-ticket-row fr2-ticket-note"
                style={cssVars({ '--fr2-row': active.rows.length })}
              >
                <dd>{active.note}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="fr2-under">
        <p className="fr2-availability">{availability}</p>
        <p className="fr2-note">{note}</p>
      </div>
    </div>
  );
}
