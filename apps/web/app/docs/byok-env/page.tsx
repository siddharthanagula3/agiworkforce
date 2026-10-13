import Link from 'next/link';
import { DocsCodeBlock } from '@/features/docs/components/DocsCodeBlock';
import { DocsShell } from '@/features/docs/components/DocsShell';
import { DOCS_HOME_PATH } from '@/features/docs/lib/docs-nav';
import { SELF_HOSTED_KEY_PROVIDERS } from '@/lib/byok-providers';
import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({
  title: 'Provider-key configuration',
  description:
    'Configure provider credentials for a self-hosted AGI deployment, the CLI, or VS Code without crossing trust boundaries.',
  path: '/docs/byok-env',
});

const SECTIONS = [
  { id: 'quick-start', title: 'Quick start for a self-hosted operator' },
  { id: 'providers', title: 'Supported providers and environment variables' },
  { id: 'example', title: 'Example .env.local' },
  { id: 'desktop', title: 'Desktop takes no provider key' },
  { id: 'clients', title: 'Provider-key clients' },
] as const;

const [QUICK_START, PROVIDERS, EXAMPLE, DESKTOP, CLIENTS] = SECTIONS;

const ENV_EXAMPLE = `# .env.local - never commit this file
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Add any others you want active
# DEEPSEEK_API_KEY=...
# PERPLEXITY_API_KEY=pplx-...`;

function SectionHeading({ section }: { section: (typeof SECTIONS)[number] }) {
  return (
    <h2 id={section.id}>
      <a className="dx-section-link" href={`#${section.id}`}>
        {section.title}
      </a>
    </h2>
  );
}

export default function ByokEnvDocsPage() {
  return (
    <DocsShell toc={SECTIONS}>
      <article className="break-words">
        <ol className="dx-crumb" aria-label="Breadcrumb">
          <li>
            <Link href={DOCS_HOME_PATH}>Documentation</Link>
          </li>
          <li>Provider keys</li>
        </ol>
        <div className="dx-head">
          <h1 className="dx-title" id="agi-docs-byok-env-title">
            Provider-key configuration
          </h1>
        </div>
        <p className="dx-desc">
          Self-hosted AGI deployments read operator-managed provider keys from environment
          variables. The CLI has a local credential flow for user-managed BYOK, and the VS Code
          extension hands provider keys to that CLI runtime. {BYOK_SURFACES.availability} Hosted
          Web, Mobile and the Desktop app do not expose BYOK key entry.
        </p>
        <hr className="dx-rule" />
        <div className="dx-prose">
          <section>
            <SectionHeading section={QUICK_START} />
            <p>
              Create or edit <code>.env.local</code> in the root of your self-hosted deployment (or{' '}
              <code>apps/web/</code> for local dev), and add the keys for the providers you want to
              use.
            </p>
          </section>

          <section>
            <SectionHeading section={PROVIDERS} />
            <p>Set any combination below. Only providers with a key present will be active.</p>
            <div className="dx-table" role="region" aria-label={PROVIDERS.title} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Provider</th>
                    <th scope="col">Environment variable</th>
                  </tr>
                </thead>
                <tbody>
                  {SELF_HOSTED_KEY_PROVIDERS.map((provider) => (
                    <tr key={provider.id}>
                      <td>
                        <strong>{provider.label}</strong>
                      </td>
                      <td>
                        <code className="whitespace-nowrap">{provider.envVar}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionHeading section={EXAMPLE} />
            <DocsCodeBlock code={ENV_EXAMPLE} language="dotenv" />
          </section>

          <section>
            <SectionHeading section={DESKTOP} />
            <p>
              The macOS app runs on your AGI account and carries the hosted app, so it has nowhere
              private to keep a provider key and does not ask for one. On the same machine the CLI
              stores a provider key in the operating system keyring, or in owner-only files on Linux
              or when the keyring is turned off, and the VS Code extension passes provider keys to
              that CLI runtime instead of keeping its own copy. Provider keys do not sync to Desktop
              or the hosted apps.
            </p>
          </section>

          <section>
            <SectionHeading section={CLIENTS} />
            <p>
              The CLI stores provider keys in the operating system keyring, or in owner-only files
              on Linux or when the keyring is turned off. VS Code support hands keys to the CLI
              runtime. {BYOK_SURFACES.availability} Self-hosted Web deployments continue to use
              environment variables. AGI&rsquo;s hosted Web, Mobile, Desktop, and Chrome surfaces do
              not accept provider keys.
            </p>
            <p>
              <Link href="/byok">Compare supported BYOK surfaces</Link>
            </p>
          </section>
        </div>
      </article>
    </DocsShell>
  );
}
