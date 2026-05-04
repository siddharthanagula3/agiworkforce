import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy | AGI Workforce',
  description:
    'How AGI Workforce collects, uses, and protects your data across desktop, web, mobile, CLI, and browser surfaces.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | AGI Workforce',
    description: 'How AGI Workforce collects, uses, and protects your data.',
    type: 'website',
    url: 'https://agiworkforce.com/privacy',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | AGI Workforce',
    description: 'How AGI Workforce collects, uses, and protects your data.',
  },
};

const EFFECTIVE_DATE = '2026-05-04';

const HOSTED_PROVIDERS: { name: string; sends: string; url: string }[] = [
  {
    name: 'Anthropic (Claude)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://www.anthropic.com/privacy',
  },
  {
    name: 'OpenAI (GPT, o-series)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://openai.com/policies/privacy-policy',
  },
  {
    name: 'Google (Gemini)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://policies.google.com/privacy',
  },
  {
    name: 'xAI (Grok)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://x.ai/legal/privacy-policy',
  },
  {
    name: 'DeepSeek',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://www.deepseek.com/privacy_policy',
  },
  {
    name: 'Perplexity',
    sends: 'prompts, conversation history, search queries',
    url: 'https://www.perplexity.ai/hub/legal/privacy-policy',
  },
  {
    name: 'Qwen (Alibaba Cloud)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://www.alibabacloud.com/help/en/legal/latest/privacy-policy',
  },
  {
    name: 'Moonshot (Kimi)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://www.moonshot.cn/privacy',
  },
  {
    name: 'Zhipu (GLM)',
    sends: 'prompts, conversation history, attached files, tool inputs',
    url: 'https://open.bigmodel.cn/',
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />

      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/[0.05] bg-[#0a0a0c] py-20 md:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, #c8892a 0, #c8892a 1px, transparent 1px, transparent 22px)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-15%] top-[-10%] h-[480px] w-[480px] rounded-full bg-[#c8892a]/[0.06] blur-[140px]"
          />
          <div className="container relative mx-auto px-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
              Legal
            </p>
            <h1 className="font-heading max-w-3xl text-4xl leading-[0.95] tracking-tight text-[#edebe8] md:text-6xl lg:text-[4.5rem]">
              Privacy Policy
            </h1>
            <p className="font-body mt-6 max-w-2xl text-base leading-relaxed text-[#888480] md:text-lg">
              Plain-language disclosure of what we collect, where it goes, and the controls you
              have. Effective {EFFECTIVE_DATE}.
            </p>
          </div>
        </section>

        {/* Body */}
        <section className="py-20 md:py-24">
          <div className="container mx-auto px-4">
            <article className="font-body mx-auto max-w-3xl space-y-14 text-[#a8a4a0]">
              {/* Introduction */}
              <Block>
                <Eyebrow>Overview</Eyebrow>
                <H2>Introduction</H2>
                <p>
                  AGI Automation LLC (&ldquo;AGI Workforce&rdquo;, &ldquo;we&rdquo;,
                  &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates agiworkforce.com and the AGI
                  Workforce desktop, web, mobile, CLI, and browser-extension applications
                  (collectively, the &ldquo;Services&rdquo;). This policy describes what data we
                  collect, why we collect it, how we use it, and the rights you have over it.
                </p>
                <p>
                  AGI Workforce ships in two operating modes with materially different data flows.
                  In <strong className="text-[#edebe8]">Local mode</strong> (desktop only), all data
                  lives on your device in an encrypted SQLite database; no account is required and
                  no data is transmitted to our servers. In{' '}
                  <strong className="text-[#edebe8]">Cloud mode</strong> (desktop, web, mobile),
                  conversation history, settings, and task data are synced to our Supabase database
                  in the United States so you can move between devices.
                </p>
              </Block>

              {/* What we collect */}
              <Block>
                <Eyebrow>Section 1</Eyebrow>
                <H2>What we collect</H2>
                <ItemizedList
                  items={[
                    {
                      title: 'Account',
                      body: 'Email address, password hash (bcrypt or Supabase-managed), display name, and OAuth identity (Google, GitHub) when you sign in via a third-party provider.',
                    },
                    {
                      title: 'Billing',
                      body: 'Stripe customer ID, current subscription tier, and the last four digits of your payment card. We never receive or store full card numbers; Stripe handles all card data.',
                    },
                    {
                      title: 'Conversations',
                      body: 'Messages, attached files, and tool outputs. In Cloud mode these are written to a Supabase row scoped to your user; TLS in transit and Supabase encryption at rest. In Local mode they stay in your on-device SQLite database and never leave your machine.',
                    },
                    {
                      title: 'API call metadata',
                      body: 'Timestamps, token counts, model name, and computed cost for each LLM request. Used for billing, the in-app Stats dashboard, and rate-limit accounting.',
                    },
                    {
                      title: 'Telemetry',
                      body: 'Sentry error stack traces (no message bodies, no API keys) and Google Tag Manager web analytics (pageviews, button clicks). Both are opt-out via Settings, Privacy.',
                    },
                    {
                      title: 'Device info',
                      body: 'Mobile push notification token only if you opt in to push notifications. Operating system and app version are sent with crash reports.',
                    },
                  ]}
                />
              </Block>

              {/* Where it goes */}
              <Block>
                <Eyebrow>Section 2</Eyebrow>
                <H2>Where your data goes</H2>
                <p>
                  We route data to a small, fixed set of processors. Each processor is listed below
                  with the specific data it receives.
                </p>

                <H3>Hosted AI providers (BYOK or managed cloud)</H3>
                <p>
                  When you select a hosted model, your prompts go{' '}
                  <strong className="text-[#edebe8]">directly to that provider&apos;s API</strong>{' '}
                  over TLS. In BYOK mode (you supply your own API key), we never store the response
                  on our servers. In Hobby, Pro, or Max managed-cloud mode, we hold a copy in your
                  Supabase row to enable cross-device sync; you can delete it at any time. Each
                  provider has its own privacy policy that governs how they handle your prompts and
                  completions.
                </p>
                <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-[#08080a]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left">
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#666260]">
                          Provider
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#666260]">
                          What is sent
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#666260]">
                          Policy
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {HOSTED_PROVIDERS.map((p) => (
                        <tr
                          key={p.name}
                          className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]"
                        >
                          <td className="px-5 py-3 align-top font-medium text-[#edebe8]">
                            {p.name}
                          </td>
                          <td className="px-5 py-3 align-top text-[#888480]">{p.sends}</td>
                          <td className="px-5 py-3 align-top">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#c8892a] hover:underline"
                            >
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <H3>Local runtimes (Ollama, LM Studio)</H3>
                <p>
                  When you run a model through Ollama or LM Studio,{' '}
                  <strong className="text-[#edebe8]">data stays on your machine</strong>. Prompts
                  are sent to localhost over loopback; nothing is transmitted off-device. Neither
                  AGI Workforce nor any third party can see your prompts or completions.
                </p>

                <H3>Custom OpenAI-compatible endpoints</H3>
                <p>
                  AGI Workforce supports unlimited custom OpenAI-compatible providers (for example
                  OpenRouter, NVIDIA NIM, Groq, Together, Fireworks, Cerebras). When you configure
                  one, your prompts go to{' '}
                  <strong className="text-[#edebe8]">whatever endpoint URL you provide</strong>; we
                  do not proxy these requests. Review each provider&apos;s privacy policy before
                  sending sensitive data.
                </p>

                <H3>Stripe (payment processor)</H3>
                <p>
                  Stripe processes all subscription payments. We send Stripe your email and customer
                  ID. Stripe sends us a customer ID, subscription status, and the last four digits
                  of your card. We never see raw card numbers, expiry dates, or CVCs. See{' '}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#c8892a] hover:underline"
                  >
                    Stripe&apos;s privacy policy
                  </a>
                  .
                </p>

                <H3>Supabase (cloud database)</H3>
                <p>
                  Cloud mode data is stored in Supabase (PostgreSQL) hosted on AWS{' '}
                  <strong className="text-[#edebe8]">us-east-2 (Ohio)</strong>. We do{' '}
                  <strong className="text-[#edebe8]">not</strong> currently offer EU data residency.
                  If your jurisdiction or compliance posture requires EU residency, do not enable
                  Cloud mode; use Local mode on desktop instead.
                </p>

                <H3>Sentry (error reporting)</H3>
                <p>
                  When telemetry is enabled, uncaught exceptions and stack traces are sent to
                  Sentry. We{' '}
                  <strong className="text-[#edebe8]">
                    do not send conversation bodies, API keys, or message content
                  </strong>
                  ; only the error type, stack frames, OS, and app version. You can disable error
                  reporting at any time at Settings, Privacy, Telemetry.
                </p>

                <H3>Google Tag Manager (web analytics)</H3>
                <p>
                  The marketing website (agiworkforce.com) uses Google Tag Manager to record
                  pageviews and button clicks. No conversation content is sent. You can opt out at
                  Settings, Privacy, Analytics in the web app, by enabling &ldquo;Do Not
                  Track&rdquo; in your browser, or by installing the{' '}
                  <a
                    href="https://tools.google.com/dlpage/gaoptout"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#c8892a] hover:underline"
                  >
                    Google Analytics Opt-out Browser Add-on
                  </a>
                  .
                </p>
              </Block>

              {/* Your rights */}
              <Block>
                <Eyebrow>Section 3</Eyebrow>
                <H2>Your rights (GDPR, CCPA)</H2>
                <p>
                  Depending on your jurisdiction you may have the right to access, correct, port,
                  restrict processing of, or delete your personal data. AGI Workforce provides the
                  following concrete mechanisms; all are reachable from inside the app.
                </p>
                <ItemizedList
                  items={[
                    {
                      title: 'Export your data',
                      body: 'Settings, Privacy, Data, "Export my data". Calls the privacy_export_data IPC, generates a JSON archive of your conversations, settings, and billing summary, and downloads it through your operating system save dialog.',
                    },
                    {
                      title: 'Delete your account',
                      body: 'Settings, Privacy, Data, "Delete my account". Requires a double confirmation including typing DELETE in a textbox. Marks your account for deletion with a 7-day grace window during which you can cancel; after that, your Supabase rows, Stripe subscription, and authentication record are permanently purged.',
                    },
                    {
                      title: 'Opt out of telemetry',
                      body: 'Settings, Privacy, Telemetry. Toggling this off stops Sentry from receiving error reports immediately. Toggling Web Analytics off stops Google Tag Manager in the web app on the next page load.',
                    },
                    {
                      title: 'Contact us',
                      body: 'For data-subject requests, deletion confirmation, or any other privacy question, email privacy@agiworkforce.com. We respond within 30 days.',
                    },
                  ]}
                />
              </Block>

              {/* What we do not do */}
              <Block>
                <Eyebrow>Section 4</Eyebrow>
                <H2>What we do not do</H2>
                <ItemizedList
                  items={[
                    {
                      title: 'We do not train AI models on your conversations.',
                      body: 'Your prompts and completions are never used to fine-tune, evaluate, or otherwise improve any model we operate or contract with.',
                    },
                    {
                      title: 'We do not sell your data.',
                      body: 'We do not sell, rent, or trade any personal information to third parties. Under CCPA we do not engage in the "sale" or "sharing" of personal information.',
                    },
                    {
                      title: 'We do not use your conversations for any non-service purpose.',
                      body: 'Conversation content is used only to deliver the response you requested, render your history, and bill you for usage. It is not used for advertising, profiling, or any secondary purpose.',
                    },
                  ]}
                />
              </Block>

              {/* Limits */}
              <Block>
                <Eyebrow>Section 5</Eyebrow>
                <H2>What we cannot guarantee</H2>
                <p>We are transparent about the boundaries of our control.</p>
                <ItemizedList
                  items={[
                    {
                      title: 'BYOK provider logging',
                      body: 'When you bring your own API key, your prompts go directly to that provider. Each provider has its own data-retention and training policy that we cannot override. Review the provider links in Section 2 before sending sensitive data.',
                    },
                    {
                      title: 'EU data residency in Cloud mode',
                      body: 'Our Supabase region is AWS us-east-2 (Ohio). We do not currently offer an EU region. If your compliance posture requires EU residency, use Local mode on desktop or refrain from enabling Cloud mode.',
                    },
                  ]}
                />
              </Block>

              {/* Updates */}
              <Block>
                <Eyebrow>Section 6</Eyebrow>
                <H2>Updates to this policy</H2>
                <p>
                  We will post changes to this page with an updated effective date. For material
                  changes that affect how we handle personal data, we will notify registered users
                  in-app at least <strong className="text-[#edebe8]">30 days</strong> before the
                  change takes effect.
                </p>
              </Block>

              {/* Children */}
              <Block>
                <Eyebrow>Section 7</Eyebrow>
                <H2>Children</H2>
                <p>
                  AGI Workforce is{' '}
                  <strong className="text-[#edebe8]">not directed to children under 13</strong>. We
                  do not knowingly collect personal data from children. If you believe we have
                  inadvertently collected data from a child, contact privacy@agiworkforce.com and we
                  will delete it.
                </p>
              </Block>

              {/* Contact */}
              <Block>
                <Eyebrow>Contact</Eyebrow>
                <H2>Reach our privacy team</H2>
                <div className="mt-2 rounded-2xl border border-[#1a1917] border-l-2 border-l-[#c8892a] bg-[#09090b]/50 p-6">
                  <p className="text-sm text-[#a8a4a0]">
                    <strong className="text-[#edebe8]">AGI Automation LLC</strong>
                    <br />
                    Austin, TX
                    <br />
                    <a
                      href="mailto:privacy@agiworkforce.com"
                      className="text-[#c8892a] hover:underline"
                    >
                      privacy@agiworkforce.com
                    </a>
                  </p>
                  <p className="mt-3 text-xs text-[#666260]">Effective {EFFECTIVE_DATE}.</p>
                </div>
              </Block>
            </article>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editorial typography helpers                                       */
/* ------------------------------------------------------------------ */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8892a]">
      {children}
    </p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-3xl tracking-tight text-[#edebe8] md:text-4xl">{children}</h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading mt-8 text-xl tracking-tight text-[#edebe8] md:text-2xl">
      {children}
    </h3>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 leading-relaxed">{children}</div>;
}

function ItemizedList({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="mt-2 space-y-4">
      {items.map((item) => (
        <li key={item.title} className="rounded-xl border border-white/[0.06] bg-[#08080a] p-5">
          <p className="font-medium text-[#edebe8]">{item.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#888480]">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}
