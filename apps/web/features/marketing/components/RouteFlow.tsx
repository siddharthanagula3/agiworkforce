import { ProviderLogo, hasProviderLogo } from './ProviderLogo';

/**
 * RouteFlow · animated flow diagram of AGI's routing model.
 *
 * Providers on the left stream through the AGI router to the six surfaces
 * on the right. Pulses travel the paths via SMIL <animateMotion> (no JS);
 * a prefers-reduced-motion rule in globals.css hides the pulses and keeps
 * the static diagram. Provider marks are official (simple-icons) or text
 * wordmarks · never invented logos.
 */

const PROVIDERS: { name: string; slug?: string }[] = [
  { name: 'OpenAI', slug: 'openai' },
  { name: 'Anthropic', slug: 'anthropic' },
  { name: 'Gemini', slug: 'gemini' },
  { name: 'Grok', slug: 'xai' },
  { name: 'DeepSeek', slug: 'deepseek' },
  // Mistral was here until 2026-07-22: `5a165d78b` removed the provider from
  // models.json and every `mistral-*` id now canonicalizes to claude-sonnet-5,
  // so the home page was drawing a lane to a provider the router cannot reach.
  // Perplexity is in the catalog, has an adapter in packages/ai/providers, and
  // is listed on /providers and /byok.
  { name: 'Perplexity', slug: 'perplexity' },
  { name: 'Qwen', slug: 'qwen' },
  { name: 'Ollama', slug: 'ollama' },
];

const SURFACES = ['Web', 'Desktop', 'Mobile', 'CLI', 'Chrome', 'VS Code'];

const W = 960;
const H = 460;
const HUB_X = W / 2;
const HUB_Y = H / 2;
const LEFT_X = 196;
const RIGHT_X = W - 196;

function laneY(index: number, count: number): number {
  const pad = 44;
  return pad + (index * (H - pad * 2)) / (count - 1);
}

function inPath(y: number): string {
  return `M ${LEFT_X} ${y} C ${LEFT_X + 130} ${y}, ${HUB_X - 150} ${HUB_Y}, ${HUB_X - 34} ${HUB_Y}`;
}

function outPath(y: number): string {
  return `M ${HUB_X + 34} ${HUB_Y} C ${HUB_X + 150} ${HUB_Y}, ${RIGHT_X - 130} ${y}, ${RIGHT_X} ${y}`;
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

      <div className="agi-rf" role="img" aria-label="Providers route through AGI to six surfaces">
        <svg viewBox={`0 0 ${W} ${H}`} className="agi-rf-svg" aria-hidden="true">
          {/* paths */}
          {PROVIDERS.map((p, i) => (
            <path
              key={`in-${p.name}`}
              d={inPath(laneY(i, PROVIDERS.length))}
              className="agi-rf-path"
            />
          ))}
          {SURFACES.map((s, i) => (
            <path key={`out-${s}`} d={outPath(laneY(i, SURFACES.length))} className="agi-rf-path" />
          ))}

          {/* traveling pulses */}
          {PROVIDERS.map((p, i) => (
            <circle key={`pin-${p.name}`} r="3" className="agi-rf-dot">
              <animateMotion
                dur="3.6s"
                begin={`${i * 0.45}s`}
                repeatCount="indefinite"
                path={inPath(laneY(i, PROVIDERS.length))}
              />
            </circle>
          ))}
          {SURFACES.map((s, i) => (
            <circle key={`pout-${s}`} r="3" className="agi-rf-dot agi-rf-dot--out">
              <animateMotion
                dur="3.2s"
                begin={`${i * 0.55 + 1.6}s`}
                repeatCount="indefinite"
                path={outPath(laneY(i, SURFACES.length))}
              />
            </circle>
          ))}

          {/* hub */}
          <g className="agi-rf-hub">
            <circle cx={HUB_X} cy={HUB_Y} r="46" className="agi-rf-hub-halo" />
            <circle cx={HUB_X} cy={HUB_Y} r="30" className="agi-rf-hub-core" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI * 2) / 12;
              return (
                <line
                  key={i}
                  x1={HUB_X + Math.sin(a) * 12}
                  y1={HUB_Y - Math.cos(a) * 12}
                  x2={HUB_X + Math.sin(a) * 22}
                  y2={HUB_Y - Math.cos(a) * 22}
                  className={i === 0 ? 'agi-rf-spoke agi-rf-spoke--accent' : 'agi-rf-spoke'}
                />
              );
            })}
          </g>
        </svg>

        {/* provider chips (left) */}
        <ul className="agi-rf-col agi-rf-col--in" aria-hidden="true">
          {PROVIDERS.map((p) => (
            <li key={p.name} className="agi-rf-node">
              {p.slug && hasProviderLogo(p.slug) ? <ProviderLogo slug={p.slug} size={14} /> : null}
              {p.name}
            </li>
          ))}
        </ul>

        {/* surface chips (right) */}
        <ul className="agi-rf-col agi-rf-col--out" aria-hidden="true">
          {SURFACES.map((s) => (
            <li key={s} className="agi-rf-node agi-rf-node--surface">
              {s}
            </li>
          ))}
        </ul>

        {/* mode lanes */}
        <ul className="agi-rf-modes" aria-hidden="true">
          <li>Local · on-device</li>
          <li>BYOK · direct to provider</li>
          <li>Cloud · public alpha</li>
        </ul>
      </div>
    </section>
  );
}
