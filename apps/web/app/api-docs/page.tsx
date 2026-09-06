import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  CodeTabs,
  Prose,
  Section,
  SplitFeature,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'API docs: the OpenAI-compatible gateway',
  description:
    'API reference for the AGI gateway. OpenAI-compatible endpoints, BYOK across providers.',
  path: '/api-docs',
});

const HERO_TABS = [
  {
    label: 'curl',
    language: 'shell',
    code: `curl https://agiworkforce.com/api/llm/v1/chat/completions \\
  -H "Authorization: Bearer $AGI_SESSION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "auto", "messages": [{ "role": "user", "content": "hello" }] }'`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `from openai import OpenAI

client = OpenAI(
    base_url="https://agiworkforce.com/api/llm/v1",
    api_key=os.environ["AGI_SESSION_TOKEN"],
)
reply = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "hello"}],
)
print(reply.choices[0].message.content)`,
    note: 'Any OpenAI-compatible client works; only the base URL and the credential change.',
  },
  {
    label: 'TypeScript',
    language: 'typescript',
    code: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://agiworkforce.com/api/llm/v1',
  apiKey: process.env.AGI_SESSION_TOKEN,
});
const reply = await client.chat.completions.create({
  model: 'auto',
  messages: [{ role: 'user', content: 'hello' }],
});`,
  },
] as const;

const CREDENTIAL_TABS = [
  {
    label: 'Chat and embeddings',
    language: 'shell',
    code: `Authorization: Bearer <session token>

POST /api/llm/v1/chat/completions
POST /api/llm/v1/embeddings`,
    note: 'A session bearer token, the same one the apps hold.',
  },
  {
    label: 'Catalog, audio, balance',
    language: 'shell',
    code: `Authorization: Bearer sk_live_…

GET  /api/llm/v1/models
POST /api/llm/v1/audio/transcriptions
GET  /api/llm/v1/credits`,
    note: 'An AGI API key issued under Settings, API Keys.',
  },
] as const;

export default function ApiDocsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main>
        <PageHero
          id="agi-api-docs-title"
          eyebrow="API docs"
          title="OpenAI-compatible endpoints."
          lede="Bring your own key, route to any of the wired providers, stream tokens back. The gateway is the same engine the apps use; the API just exposes it."
          ctas={[
            { href: '/openapi.json', label: 'OpenAPI bundle' },
            { href: '/docs/byok-env', label: 'BYOK setup', variant: 'secondary' },
          ]}
          visual={<CodeTabs tabs={HERO_TABS} title="One chat completion against the gateway" />}
        />

        <Section id="quickstart" labelledBy="agi-api-docs-quickstart-title" rule>
          <SplitFeature
            id="agi-api-docs-quickstart-title"
            eyebrow="Quick start"
            title="Two credentials, and they are not interchangeable."
            body={
              <p>
                An AGI API key (<code>sk_live_…</code>, issued under Settings, API Keys)
                authenticates the model catalog, audio transcriptions, and the credit balance. Chat
                completions and embeddings take a session bearer token. Every operation in the
                bundle names the credential it accepts.
              </p>
            }
            points={[
              'Stream tokens back with stream: true',
              'model: "auto" routes per request; name a model to pin it',
              'BYOK on Desktop, CLI and VS Code never touches this gateway',
            ]}
            visual={
              <CodeTabs tabs={CREDENTIAL_TABS} title="Which credential each endpoint takes" />
            }
          />
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
