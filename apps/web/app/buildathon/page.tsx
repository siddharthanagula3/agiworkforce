import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export const metadata = buildMetadata({
  title: 'Siddhartha Nagula | Buildathon Profile | AGIWorkforce',
  description:
    'Founder & AI Systems Engineer building AGIWorkforce, a model-neutral AI application suite across web, desktop, CLI, VS Code extension, Chrome extension, and mobile.',
  path: '/buildathon',
});

const LINKS = [
  { label: 'GitHub', href: 'https://github.com/siddharthanagula3' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/siddharthanagula' },
  { label: 'LeetCode', href: 'https://leetcode.com/u/nagulasiddharth1' },
  { label: 'Resume', href: '/siddhartha-nagula-resume.pdf' },
];

const CURRENT_PROOF = [
  'GitHub profile currently shows 4,764 contributions in the last year.',
  'LeetCode profile currently shows 594 problems solved, including 252 hard.',
  'LeetCode contest rating: 1,658.',
  'Built AGIWorkforce, a model-neutral AI application suite across web, desktop, CLI, VS Code extension, Chrome extension, and mobile.',
  'AGIWorkforce has 4,600+ commits and active TypeScript/Rust-heavy development.',
  'Public GitHub repositories show TypeScript, Rust, Swift, JavaScript, Python, Objective-C, PLpgSQL, and Shell experience.',
  'Current focus: Agent Orchestration, local LLMs, free BYOK, AGI Cloud, browser context capture, VS Code/CLI workflows, and multi-provider routing.',
];

const SURFACES = [
  'Web app',
  'Tauri desktop app',
  'Rust CLI',
  'VS Code extension',
  'Chrome MV3 extension',
  'Expo mobile app',
  'API gateway',
  'WebRTC signaling server',
];

const DIFFERENTIATION = [
  'Free local mode',
  'Free local LLMs',
  'Free BYOK',
  'AGI Cloud multi-provider routing',
  'OpenAI, Anthropic, Gemini, DeepSeek, Featherless, Ollama, LM Studio, and open-weight model support',
  'Browser context capture',
  'VS Code and CLI workflows',
  'Mobile companion approval loop for risky autonomous actions',
];

const RELEVANCE = [
  'Agent Orchestration',
  'LLM Inference',
  'Memory & Context',
  'Evals & Testing',
  'Security & Guardrails',
  'Frontend & UX',
];

const TECH_STACK = [
  'TypeScript',
  'Rust',
  'Tauri',
  'React',
  'Next.js',
  'Vite',
  'Expo',
  'React Native',
  'Swift',
  'Chrome MV3',
  'VS Code Extension API',
  'WebRTC',
  'SQLCipher',
  'Ollama',
  'LM Studio',
  'OpenAI API',
  'Anthropic API',
  'Gemini',
  'Featherless',
  'Supabase',
  'Neon',
  'Clerk',
  'Stripe',
  'GitHub Actions',
];

const PROFILE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  mainEntity: {
    '@type': 'Person',
    name: 'Siddhartha Nagula',
    alternateName: 'siddharthanagula3',
    description:
      'Founder & AI Systems Engineer building AGIWorkforce, a model-neutral AI application suite across web, desktop, CLI, VS Code extension, Chrome extension, and mobile.',
    url: `${APP_URL}/buildathon`,
    sameAs: [
      'https://github.com/siddharthanagula3',
      'https://www.linkedin.com/in/siddharthanagula',
      'https://leetcode.com/u/nagulasiddharth1',
    ],
  },
};

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default function BuildathonPage() {
  return (
    <div data-design="agi">
      {/* JSON-LD structured data */}
      <script type="application/ld+json" suppressHydrationWarning>
        {serializeJsonLd(PROFILE_JSON_LD)}
      </script>

      <main className="agi-shell">
        <Header />

        {/* 1. Hero */}
        <section className="agi-page-hero" id="buildathon-hero">
          <h1 className="agi-page-h1" style={{ maxWidth: '30ch' }}>
            Siddhartha Nagula
          </h1>
          <p className="agi-page-lede" style={{ marginTop: 12 }}>
            <strong>Founder &amp; AI Systems Engineer</strong> building AGIWorkforce
          </p>
          <div className="agi-chip-row" style={{ marginTop: 16 }}>
            <span className="agi-chip">Buildathon Track: Agent Orchestration</span>
          </div>
          <p className="agi-page-lede">
            AGIWorkforce is a model-neutral AI application suite across web, desktop, CLI, VS Code
            extension, Chrome extension, and mobile. It supports free local mode, free local LLMs,
            free BYOK, and AGI Cloud multi-provider routing across OpenAI, Anthropic, Gemini,
            DeepSeek, Featherless, Ollama, LM Studio, and open-weight models.
          </p>
        </section>

        {/* 2. Direct links */}
        <section className="agi-section" id="buildathon-links">
          <p className="agi-section-eyebrow">Links</p>
          <div className="agi-cta-row">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="agi-cta-primary"
                target="_blank"
                rel="noopener noreferrer"
                id={`buildathon-link-${link.label.toLowerCase()}`}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>

        {/* 3. Current Public Proof */}
        <section className="agi-section" id="buildathon-current-proof">
          <p className="agi-section-eyebrow">Current Public Proof</p>
          <h2 className="agi-section-h2">Verified Activity</h2>
          <ul className="buildathon-proof-list">
            {CURRENT_PROOF.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {/* 4. Product Surfaces */}
        <section className="agi-section" id="buildathon-surfaces">
          <p className="agi-section-eyebrow">Product Surfaces</p>
          <h2 className="agi-section-h2">Platform Coverage</h2>
          <div className="agi-chip-row" style={{ gap: 10 }}>
            {SURFACES.map((s) => (
              <span key={s} className="agi-chip">
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* 6. Core Differentiation */}
        <section className="agi-section" id="buildathon-differentiation">
          <p className="agi-section-eyebrow">Core Differentiation</p>
          <h2 className="agi-section-h2">What Sets AGIWorkforce Apart</h2>
          <ul className="buildathon-proof-list">
            {DIFFERENTIATION.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {/* 7. Buildathon Relevance */}
        <section className="agi-section" id="buildathon-relevance">
          <p className="agi-section-eyebrow">Buildathon Relevance</p>
          <h2 className="agi-section-h2">Applicable Tracks</h2>
          <div className="agi-chip-row" style={{ gap: 10 }}>
            {RELEVANCE.map((r) => (
              <span key={r} className="agi-chip">
                {r}
              </span>
            ))}
          </div>
        </section>

        {/* 8. Technical Stack */}
        <section className="agi-section" id="buildathon-stack">
          <p className="agi-section-eyebrow">Technical Stack</p>
          <h2 className="agi-section-h2">Technologies</h2>
          <div className="agi-chip-row" style={{ gap: 8 }}>
            {TECH_STACK.map((t) => (
              <span key={t} className="agi-chip">
                {t}
              </span>
            ))}
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
