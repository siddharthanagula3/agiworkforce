import { DrawOnView } from './motion/DrawOnView';
import { ProviderMark, hasProviderMark } from '@agiworkforce/ui';
import { providerLabel } from './landing/landing-content';

const PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'perplexity',
  'qwen',
  'ollama',
] as const;

const PROVIDERS = PROVIDER_IDS.map((id) => ({ id, name: providerLabel(id) }));

const SURFACES = ['Web', 'Desktop', 'Mobile', 'CLI', 'Chrome', 'VS Code'];

const W = 960;
const H = 460;
const HUB_X = W / 2;
const HUB_Y = H / 2;
const LEFT_X = 196;
const RIGHT_X = W - 196;
const LANE_PAD = 44;
const HUB_HALO_R = 46;
const HUB_CORE_R = 30;
const HUB_GAP = 34;
const SPOKE_COUNT = 12;
const SPOKE_INNER_R = 12;
const SPOKE_OUTER_R = 22;
const PULSE_R = 3;
const MARK_SIZE = 14;
const IN_PULSE_DURATION = 3.6;
const OUT_PULSE_DURATION = 3.2;
const IN_PULSE_STAGGER = 0.45;
const OUT_PULSE_STAGGER = 0.55;
const OUT_PULSE_OFFSET = 1.6;

function laneY(index: number, count: number): number {
  return LANE_PAD + (index * (H - LANE_PAD * 2)) / (count - 1);
}

function inPath(y: number): string {
  return `M ${LEFT_X} ${y} C ${LEFT_X + 130} ${y}, ${HUB_X - 150} ${HUB_Y}, ${HUB_X - HUB_GAP} ${HUB_Y}`;
}

function outPath(y: number): string {
  return `M ${HUB_X + HUB_GAP} ${HUB_Y} C ${HUB_X + 150} ${HUB_Y}, ${RIGHT_X - 130} ${y}, ${RIGHT_X} ${y}`;
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
    <section className="agi-fl-section agi-rf-section" aria-labelledby="agi-rf-title">
      <p className="agi-fl-eyebrow">{eyebrow}</p>
      <h2 id="agi-rf-title" className="agi-fl-h2">
        {title}
      </h2>
      <p className="agi-fl-section-lede">{lede}</p>

      <DrawOnView>
        <div className="agi-rf" role="img" aria-label="Providers route through AGI to six surfaces">
          <svg viewBox={`0 0 ${W} ${H}`} className="agi-rf-svg" aria-hidden="true">
            {PROVIDERS.map((provider, i) => (
              <path
                key={`in-${provider.id}`}
                d={inPath(laneY(i, PROVIDERS.length))}
                className="agi-rf-path"
                pathLength={1}
              />
            ))}
            {SURFACES.map((surface, i) => (
              <path
                key={`out-${surface}`}
                d={outPath(laneY(i, SURFACES.length))}
                className="agi-rf-path"
                pathLength={1}
              />
            ))}

            {PROVIDERS.map((provider, i) => (
              <circle key={`pin-${provider.id}`} r={PULSE_R} className="agi-rf-dot">
                <animateMotion
                  dur={`${IN_PULSE_DURATION}s`}
                  begin={`${i * IN_PULSE_STAGGER}s`}
                  repeatCount="indefinite"
                  path={inPath(laneY(i, PROVIDERS.length))}
                />
              </circle>
            ))}
            {SURFACES.map((surface, i) => (
              <circle key={`pout-${surface}`} r={PULSE_R} className="agi-rf-dot agi-rf-dot--out">
                <animateMotion
                  dur={`${OUT_PULSE_DURATION}s`}
                  begin={`${i * OUT_PULSE_STAGGER + OUT_PULSE_OFFSET}s`}
                  repeatCount="indefinite"
                  path={outPath(laneY(i, SURFACES.length))}
                />
              </circle>
            ))}

            <g className="agi-rf-hub">
              <circle cx={HUB_X} cy={HUB_Y} r={HUB_HALO_R} className="agi-rf-hub-halo" />
              <circle cx={HUB_X} cy={HUB_Y} r={HUB_CORE_R} className="agi-rf-hub-core" />
              {Array.from({ length: SPOKE_COUNT }, (_, i) => {
                const angle = (i * Math.PI * 2) / SPOKE_COUNT;
                return (
                  <line
                    key={i}
                    x1={HUB_X + Math.sin(angle) * SPOKE_INNER_R}
                    y1={HUB_Y - Math.cos(angle) * SPOKE_INNER_R}
                    x2={HUB_X + Math.sin(angle) * SPOKE_OUTER_R}
                    y2={HUB_Y - Math.cos(angle) * SPOKE_OUTER_R}
                    className={i === 0 ? 'agi-rf-spoke agi-rf-spoke--accent' : 'agi-rf-spoke'}
                  />
                );
              })}
            </g>
          </svg>

          <ul className="agi-rf-col agi-rf-col--in" aria-hidden="true">
            {PROVIDERS.map((provider) => (
              <li key={provider.id} className="agi-rf-node">
                {hasProviderMark(provider.id) ? (
                  <ProviderMark providerKey={provider.id} size={MARK_SIZE} />
                ) : null}
                {provider.name}
              </li>
            ))}
          </ul>

          <ul className="agi-rf-col agi-rf-col--out" aria-hidden="true">
            {SURFACES.map((surface) => (
              <li key={surface} className="agi-rf-node agi-rf-node--surface">
                {surface}
              </li>
            ))}
          </ul>
        </div>
      </DrawOnView>
    </section>
  );
}
