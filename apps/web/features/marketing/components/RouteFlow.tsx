import { PROVIDERS_IN_ORDER } from '@agiworkforce/types';
import { ProviderMark, hasProviderMark } from '@agiworkforce/ui';
import { DrawOnView } from './motion/DrawOnView';
import { providerLabel } from './landing/landing-content';
import './route-flow.css';

const PROVIDERS = PROVIDERS_IN_ORDER.filter((id) => hasProviderMark(id)).map((id) => ({
  id,
  name: providerLabel(id),
}));

const SURFACES = ['Web', 'Desktop', 'Mobile', 'CLI', 'Chrome', 'VS Code'];

const W = 960;
const H = 520;
const HUB_X = W / 2;
const HUB_Y = H / 2;
const EDGE_X = 240;
const LANE_PAD = 34;
const HUB_HALO_R = 46;
const HUB_CORE_R = 30;
const HUB_GAP = 34;
const CURVE_OUT = 130;
const CURVE_IN = 150;
const SPOKE_COUNT = 12;
const SPOKE_INNER_R = 12;
const SPOKE_OUTER_R = 22;
const PULSE_R = 3;
const MARK_SIZE = 16;
const IN_PULSE_DURATION = 3.6;
const OUT_PULSE_DURATION = 3.2;
const IN_PULSE_STAGGER = 0.45;
const OUT_PULSE_STAGGER = 0.55;
const OUT_PULSE_OFFSET = 1.6;

const STACK_W = 120;
const STACK_H = 220;
const STACK_X = STACK_W / 2;
const STACK_Y = STACK_H / 2;
const STACK_IN = `M ${STACK_X} 0 L ${STACK_X} ${STACK_Y - HUB_GAP}`;
const STACK_OUT = `M ${STACK_X} ${STACK_Y + HUB_GAP} L ${STACK_X} ${STACK_H}`;

function laneY(index: number, count: number): number {
  return LANE_PAD + (index * (H - LANE_PAD * 2)) / (count - 1);
}

function lanePosition(index: number, count: number): string {
  return `${(laneY(index, count) / H) * 100}%`;
}

function inPath(y: number): string {
  return `M ${EDGE_X} ${y} C ${EDGE_X + CURVE_OUT} ${y}, ${HUB_X - CURVE_IN} ${HUB_Y}, ${HUB_X - HUB_GAP} ${HUB_Y}`;
}

function outPath(y: number): string {
  return `M ${HUB_X + HUB_GAP} ${HUB_Y} C ${HUB_X + CURVE_IN} ${HUB_Y}, ${W - EDGE_X - CURVE_OUT} ${y}, ${W - EDGE_X} ${y}`;
}

function Hub({ x, y }: { x: number; y: number }) {
  return (
    <g className="agi-route-hub">
      <circle cx={x} cy={y} r={HUB_HALO_R} className="agi-route-hub-halo" />
      <circle cx={x} cy={y} r={HUB_CORE_R} className="agi-route-hub-core" />
      {Array.from({ length: SPOKE_COUNT }, (_, i) => {
        const angle = (i * Math.PI * 2) / SPOKE_COUNT;
        return (
          <path
            key={i}
            d={`M ${x + Math.sin(angle) * SPOKE_INNER_R} ${y - Math.cos(angle) * SPOKE_INNER_R} L ${x + Math.sin(angle) * SPOKE_OUTER_R} ${y - Math.cos(angle) * SPOKE_OUTER_R}`}
            className="agi-route-spoke"
            pathLength={1}
          />
        );
      })}
    </g>
  );
}

export function RouteFlow({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <section className="agi-fl-section agi-route-section" aria-labelledby="agi-route-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-route-title" className="agi-fl-h2">
        {title}
      </h2>
      <p className="agi-fl-section-lede">{lede}</p>

      <DrawOnView>
        <div
          className="agi-route"
          role="img"
          aria-label="Providers route through AGI to six surfaces"
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="agi-route-svg agi-route-svg--fan"
            aria-hidden="true"
          >
            {PROVIDERS.map((provider, i) => (
              <path
                key={`in-${provider.id}`}
                d={inPath(laneY(i, PROVIDERS.length))}
                className="agi-route-path"
                pathLength={1}
              />
            ))}
            {SURFACES.map((surface, i) => (
              <path
                key={`out-${surface}`}
                d={outPath(laneY(i, SURFACES.length))}
                className="agi-route-path"
                pathLength={1}
              />
            ))}
            {PROVIDERS.map((provider, i) => (
              <circle key={`pin-${provider.id}`} r={PULSE_R} className="agi-route-dot">
                <animateMotion
                  dur={`${IN_PULSE_DURATION}s`}
                  begin={`${i * IN_PULSE_STAGGER}s`}
                  repeatCount="indefinite"
                  path={inPath(laneY(i, PROVIDERS.length))}
                />
              </circle>
            ))}
            {SURFACES.map((surface, i) => (
              <circle key={`pout-${surface}`} r={PULSE_R} className="agi-route-dot">
                <animateMotion
                  dur={`${OUT_PULSE_DURATION}s`}
                  begin={`${i * OUT_PULSE_STAGGER + OUT_PULSE_OFFSET}s`}
                  repeatCount="indefinite"
                  path={outPath(laneY(i, SURFACES.length))}
                />
              </circle>
            ))}
            <Hub x={HUB_X} y={HUB_Y} />
          </svg>

          <ul className="agi-route-col agi-route-col--in" aria-hidden="true">
            {PROVIDERS.map((provider, i) => (
              <li
                key={provider.id}
                className="agi-route-node"
                style={{ top: lanePosition(i, PROVIDERS.length) }}
              >
                <ProviderMark providerKey={provider.id} size={MARK_SIZE} />
                {provider.name}
              </li>
            ))}
          </ul>

          <svg
            viewBox={`0 0 ${STACK_W} ${STACK_H}`}
            className="agi-route-svg agi-route-svg--stack"
            aria-hidden="true"
          >
            <path d={STACK_IN} className="agi-route-path" pathLength={1} />
            <path d={STACK_OUT} className="agi-route-path" pathLength={1} />
            <circle r={PULSE_R} className="agi-route-dot">
              <animateMotion
                dur={`${IN_PULSE_DURATION / 2}s`}
                repeatCount="indefinite"
                path={STACK_IN}
              />
            </circle>
            <circle r={PULSE_R} className="agi-route-dot">
              <animateMotion
                dur={`${OUT_PULSE_DURATION / 2}s`}
                begin={`${OUT_PULSE_OFFSET / 2}s`}
                repeatCount="indefinite"
                path={STACK_OUT}
              />
            </circle>
            <Hub x={STACK_X} y={STACK_Y} />
          </svg>

          <ul className="agi-route-col agi-route-col--out" aria-hidden="true">
            {SURFACES.map((surface, i) => (
              <li
                key={surface}
                className="agi-route-node"
                style={{ top: lanePosition(i, SURFACES.length) }}
              >
                {surface}
              </li>
            ))}
          </ul>
        </div>
      </DrawOnView>
    </section>
  );
}
