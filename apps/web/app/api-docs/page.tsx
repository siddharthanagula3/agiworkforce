import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'API docs: the OpenAI-compatible gateway',
  description:
    'API reference for the AGI gateway. OpenAI-compatible endpoints, BYOK across providers.',
  path: '/api-docs',
});

export default function ApiDocsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-api-docs-title"
          eyebrow="API docs"
          title="OpenAI-compatible endpoints."
          lede="Bring your own key, route to any of the wired providers, stream tokens back. The gateway is the same engine the apps use; the API just exposes it."
          ctas={[]}
        />

        <Section id="quickstart" labelledBy="agi-api-docs-quickstart-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-api-docs-quickstart-title">
              Quick start.
            </h2>
            <pre className="agi-ds-prose" data-size="sm" style={{ overflowX: 'auto' }}>
              {`$ curl https://agiworkforce.com/api/llm/v1/chat/completions \\
    -H "Authorization: Bearer $YOUR_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{ "model": "auto", "messages": [{"role":"user","content":"hello"}] }'`}
            </pre>
            <Prose>
              Two credentials reach this API and they are not interchangeable. An AGI API key (
              <code>sk_live_…</code>, issued under Settings, API Keys) authenticates the model
              catalog, audio transcriptions, and the credit balance. Chat completions and embeddings
              take a session bearer token. Every operation in the bundle below names the credential
              it accepts.
            </Prose>
          </Stack>
        </Section>

        <Section id="reference" labelledBy="agi-api-docs-reference-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-api-docs-reference-title">
                Reference.
              </h2>
              <Prose>
                The OpenAPI 3 bundle is published. It describes every endpoint that ships and the
                credential each one takes. There is no Postman collection and no client SDK, call
                the REST endpoints directly.
              </Prose>
            </div>
            <ButtonRow>
              <Button href="/openapi.json">OpenAPI bundle</Button>
              <Button href="/docs/byok-env" variant="secondary">
                BYOK setup
              </Button>
              <Button href="/waitlist" variant="secondary">
                Enterprise SSO early access
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter condensed />
    </div>
  );
}
