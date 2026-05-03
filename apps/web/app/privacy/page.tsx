import Link from 'next/link';
import { Bot } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for AGI Workforce. How we collect, use, and protect your data.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | AGI Workforce',
    description: 'How AGI Workforce collects, uses, and protects your data.',
    type: 'website',
    url: 'https://agiworkforce.com/privacy',
  },
  twitter: {
    card: 'summary' as const,
    title: 'Privacy Policy | AGI Workforce',
    description: 'How AGI Workforce collects, uses, and protects your data.',
  },
};

const PROVIDERS = [
  { name: 'Anthropic', url: 'https://www.anthropic.com/privacy' },
  { name: 'OpenAI', url: 'https://openai.com/policies/privacy-policy' },
  { name: 'Google (Gemini)', url: 'https://policies.google.com/privacy' },
  { name: 'xAI (Grok)', url: 'https://x.ai/legal/privacy-policy' },
  { name: 'DeepSeek', url: 'https://www.deepseek.com/privacy_policy' },
  { name: 'Mistral AI', url: 'https://mistral.ai/privacy-policy/' },
  {
    name: 'Qwen (Alibaba Cloud)',
    url: 'https://www.alibabacloud.com/help/en/legal/latest/privacy-policy',
  },
  { name: 'Moonshot AI (Kimi)', url: 'https://www.moonshot.cn/privacy' },
  { name: 'Perplexity AI', url: 'https://www.perplexity.ai/hub/legal/privacy-policy' },
  { name: 'Zhipu AI (GLM)', url: 'https://open.bigmodel.cn/' },
  { name: 'Groq', url: 'https://groq.com/privacy-policy/' },
  { name: 'Together AI', url: 'https://www.together.ai/privacy' },
  { name: 'Fireworks AI', url: 'https://fireworks.ai/privacy' },
  { name: 'Cerebras', url: 'https://www.cerebras.ai/privacy-policy' },
  { name: 'Deep Infra', url: 'https://deepinfra.com/privacy' },
  { name: 'Cohere', url: 'https://cohere.com/privacy' },
  { name: 'AI21 Labs', url: 'https://www.ai21.com/privacy' },
  { name: 'SambaNova', url: 'https://sambanova.ai/privacy-policy' },
  { name: 'NVIDIA NIM', url: 'https://www.nvidia.com/en-us/about-nvidia/privacy-policy/' },
  { name: 'Microsoft Azure OpenAI', url: 'https://privacy.microsoft.com/en-us/privacystatement' },
  { name: 'Amazon Bedrock (AWS)', url: 'https://aws.amazon.com/privacy/' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/privacy' },
  { name: 'Ollama (local)', url: 'https://ollama.com/' },
  { name: 'LM Studio (local)', url: 'https://lmstudio.ai/' },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1 pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
          <div className="prose prose-invert prose-lg text-zinc-400">
            <p className="lead text-xl text-zinc-300 mb-8">Last updated: May 3, 2026</p>

            <h3>1. Introduction</h3>
            <p>
              AGI Automation LLC (&ldquo;AGI Workforce&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;,
              or &ldquo;us&rdquo;) operates agiworkforce.com and the AGI Workforce desktop, mobile,
              CLI, and browser-extension applications (collectively, the &ldquo;Services&rdquo;).
              This Privacy Policy describes what data we collect, why we collect it, how we use it,
              and your rights.
            </p>
            <p>
              <strong>Note for legal review:</strong> This document requires sign-off from legal
              counsel before it is published as a binding policy. The current version reflects
              technical accuracy as of the date above.
            </p>

            <h3>2. Operating Modes and Data Implications</h3>
            <p>AGI Workforce operates in two modes with materially different data flows:</p>
            <ul>
              <li>
                <strong>Local Mode (Desktop only):</strong> All data — conversations, tasks,
                settings — is stored exclusively on your device (SQLite). No account is required. No
                data is transmitted to AGI Workforce servers. LLM requests go directly from your
                device to the AI provider you configure (Ollama, LM Studio, or a BYOK cloud
                provider). We receive no visibility into Local Mode usage.
              </li>
              <li>
                <strong>Cloud Mode (Desktop, Web, Mobile):</strong> Conversation history, settings,
                and task data are synced to our Supabase-hosted cloud database (see Section 7).
                Authentication is handled via Supabase Auth. LLM requests for Hobby tier subscribers
                are routed through our managed proxy; BYOK users route requests directly to their
                chosen provider.
              </li>
            </ul>

            <h3>3. Data We Collect</h3>
            <h4>3a. Account and Authentication Data</h4>
            <ul>
              <li>
                Email address and OAuth identity (Google, GitHub) via Supabase Auth, when you create
                an account.
              </li>
              <li>
                Session tokens stored in your device keychain (desktop/mobile) or an HttpOnly cookie
                (web).
              </li>
            </ul>

            <h4>3b. Conversation and Task Data (Cloud Mode only)</h4>
            <p>
              When Cloud Mode is enabled, message history, agent task logs, and associated metadata
              are stored in our Supabase database to enable sync across devices. You can export or
              delete this data at any time (see Section 9).
            </p>

            <h4>3c. Billing Data</h4>
            <p>
              Subscription and payment processing is handled by <strong>Stripe, Inc.</strong> We
              store only a Stripe customer ID and subscription status. We never receive or store raw
              payment card numbers.
            </p>

            <h4>3d. Usage Analytics</h4>
            <p>
              When the environment variable <code>NEXT_PUBLIC_GA_TRACKING_ID</code> is set on our
              web deployment, the web application loads{' '}
              <strong>Google Analytics 4 (Google Tag Manager)</strong> and sends page-view and
              navigation events to Google. No conversation content is sent. You can opt out via the{' '}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Google Analytics Opt-out Browser Add-on
              </a>{' '}
              or by enabling &ldquo;Do Not Track&rdquo; in your browser. Desktop and CLI
              applications do not include analytics by default.
            </p>

            <h4>3e. Error Reporting</h4>
            <p>
              The codebase includes integration points for <strong>Sentry</strong> error reporting.
              As of the date of this policy, Sentry is configured as a no-op stub (no data leaves
              the application). If we enable live Sentry reporting in a future release, we will
              update this policy to describe what error data is captured and provide an opt-out
              mechanism.
            </p>

            <h3>4. AI Provider Data Flows</h3>
            <p>
              AGI Workforce routes your prompts and conversation messages to the AI provider you
              select. In BYOK (Bring Your Own Key) mode, your API key and prompts travel directly to
              the provider. In Hobby tier (managed cloud), our proxy forwards your prompts without
              persisting them.{' '}
              <strong>
                We do not log conversation content on the managed proxy beyond what is necessary to
                route and meter the request.
              </strong>
            </p>
            <p>
              Each provider has its own privacy policy that governs how they handle prompts and
              completions. You are responsible for reviewing the applicable provider policy before
              sending sensitive data. Supported providers and links to their privacy policies:
            </p>
            <ul>
              {PROVIDERS.map((p) => (
                <li key={p.name}>
                  <strong>{p.name}</strong>
                  {p.url ? (
                    <>
                      {' — '}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Privacy Policy
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>

            <h3>5. Cookies and Local Storage</h3>
            <p>
              The web application uses an HttpOnly session cookie for authentication. No third-party
              advertising cookies are set. Google Analytics 4, when enabled, sets its own cookies
              per{' '}
              <a
                href="https://policies.google.com/technologies/cookies"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Google&apos;s cookie policy
              </a>
              .
            </p>

            <h3>6. Children&apos;s Privacy</h3>
            <p>
              AGI Workforce is not directed to children under 13. We do not knowingly collect
              personal data from children. If you believe we have inadvertently collected data from
              a child, contact us at privacy@agiworkforce.com and we will delete it.
            </p>

            <h3>7. Data Storage and Infrastructure</h3>
            <ul>
              <li>
                <strong>Cloud database:</strong> Supabase (PostgreSQL), hosted on AWS{' '}
                <strong>us-east-2 (Ohio)</strong>. All data stored in Cloud Mode resides in the
                United States.
              </li>
              <li>
                <strong>EU data residency:</strong> We do not currently offer EU-resident data
                storage. If you are subject to GDPR and require data to remain within the EEA, you
                should use Local Mode or refrain from enabling Cloud Mode until we offer an EU
                region.
              </li>
              <li>
                <strong>Desktop/mobile local storage:</strong> SQLite database encrypted at rest
                using your device&apos;s OS keychain-derived key (AES-256-GCM).
              </li>
            </ul>

            <h3>8. Data Retention</h3>
            <ul>
              <li>Account data is retained until you delete your account.</li>
              <li>
                Conversation history in Cloud Mode is retained until you delete it or your account.
              </li>
              <li>
                Stripe billing records are retained as required by applicable financial regulations
                (typically 7 years).
              </li>
              <li>
                Server-side request logs (standard infrastructure logs) are retained for up to 30
                days.
              </li>
            </ul>

            <h3>9. Your Rights and Data Controls</h3>
            <p>
              Depending on your jurisdiction, you may have the right to access, correct, export,
              restrict processing of, or delete your personal data. AGI Workforce provides the
              following concrete mechanisms:
            </p>
            <ul>
              <li>
                <strong>Export your data:</strong> In the desktop or web app, navigate to Settings →
                Privacy & Data → Export Data. This generates a JSON archive of your conversations,
                tasks, and account settings.
              </li>
              <li>
                <strong>Delete your account:</strong> In Settings → Privacy & Data → Delete Account.
                After a 7-day grace period, your Supabase rows, Stripe subscription, and auth record
                are permanently deleted.
              </li>
              <li>
                <strong>Opt out of analytics:</strong> Use the Google Analytics Opt-out Add-on, or
                contact us to have your GA4 user ID deleted.
              </li>
              <li>
                <strong>GDPR data subject requests:</strong> Email privacy@agiworkforce.com. We will
                respond within 30 days.
              </li>
              <li>
                <strong>CCPA &ldquo;Do Not Sell&rdquo;:</strong> We do not sell personal data. To
                exercise other CCPA rights, contact privacy@agiworkforce.com.
              </li>
            </ul>

            <h3>10. Data Transfers</h3>
            <p>
              Data processed through our managed proxy may transit the United States. Data sent to
              BYOK providers is subject to each provider&apos;s data transfer practices. By using
              Cloud Mode from outside the US, you consent to your data being transferred to and
              processed in the United States.
            </p>

            <h3>11. Security</h3>
            <p>
              We implement reasonable technical and organizational safeguards: TLS in transit,
              AES-256-GCM encryption at rest for local keystores, row-level security on all Supabase
              tables, and CSRF protection on web endpoints. No method of transmission over the
              internet is 100% secure. We will notify affected users promptly in the event of a data
              breach affecting personal information.
            </p>

            <h3>12. Changes to This Policy</h3>
            <p>
              We will post changes to this page with an updated &ldquo;Last updated&rdquo; date.
              Material changes affecting how we handle personal data will be communicated by email
              to registered users at least 14 days before they take effect.
            </p>

            <h3>13. Contact</h3>
            <p>
              For privacy-related questions or data subject requests:
              <br />
              <strong>AGI Automation LLC</strong>
              <br />
              Email: privacy@agiworkforce.com
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
