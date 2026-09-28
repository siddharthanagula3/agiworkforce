import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { listScheduledModelRetirements } from '@/lib/developer-api/model-retirements';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  CodeTabs,
  Ledger,
  Prose,
  Section,
  SplitFeature,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'API docs: the OpenAI-compatible gateway',
  description:
    'API reference for the managed AGI gateway: OpenAI-compatible endpoints authenticated with a session token or an AGI developer API key.',
  path: '/api-docs',
});

export const revalidate = 3600;

const RETIREMENT_DATE = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const HERO_TABS = [
  {
    label: 'curl',
    language: 'shell',
    code: `curl https://agiworkforce.com/api/llm/v1/chat/completions \\
  -H "Authorization: Bearer <session token>" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{ "model": "auto", "messages": [{ "role": "user", "content": "hello" }] }'`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `import uuid
from openai import OpenAI

client = OpenAI(
    base_url="https://agiworkforce.com/api/llm/v1",
    api_key="<session token>",
)
reply = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "hello"}],
    extra_headers={"Idempotency-Key": str(uuid.uuid4())},
)
print(reply.choices[0].message.content)`,
    note: 'Any OpenAI-compatible client works once it points at this base URL, carries your credential and sends an Idempotency-Key with each chat completion.',
  },
  {
    label: 'TypeScript',
    language: 'typescript',
    code: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://agiworkforce.com/api/llm/v1',
  apiKey: '<session token>',
});
const reply = await client.chat.completions.create(
  { model: 'auto', messages: [{ role: 'user', content: 'hello' }] },
  { headers: { 'Idempotency-Key': crypto.randomUUID() } },
);`,
  },
] as const;

const CREDENTIAL_TABS = [
  {
    label: 'Session token',
    language: 'shell',
    code: `Authorization: Bearer <session token>

GET  /api/llm/v1/models
POST /api/llm/v1/chat/completions
POST /api/llm/v1/embeddings
POST /api/llm/v1/audio/transcriptions
POST /api/llm/v1/route/preview
GET  /api/llm/v1/credits/balance`,
    note: 'A session bearer token, the same one the apps hold. Every operation accepts it.',
  },
  {
    label: 'API key',
    language: 'shell',
    code: `Authorization: Bearer sk_live_…

models:read      GET  /api/llm/v1/models
inference:write  POST /api/llm/v1/chat/completions
inference:write  POST /api/llm/v1/audio/transcriptions
inference:write  POST /api/llm/v1/route/preview
usage:read       GET  /api/llm/v1/credits/balance`,
    note: 'An AGI API key issued under Settings, API Keys. Embeddings refuses it, and a call missing the scope on its left answers 403 insufficient_scope.',
  },
] as const;

export default function ApiDocsPage() {
  const retirements = listScheduledModelRetirements();
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main>
        <PageHero
          id="agi-api-docs-title"
          eyebrow="API docs"
          title="OpenAI-compatible endpoints."
          em="endpoints."
          lede="Use a session token or an AGI developer API key, route through the managed gateway, and stream tokens back. Calls consume the managed-cloud credits attached to the account."
          ctas={[
            { href: '/openapi.json', label: 'OpenAPI bundle' },
            { href: '#quickstart', label: 'Authentication and scopes', variant: 'secondary' },
          ]}
          visual={<CodeTabs tabs={HERO_TABS} title="One chat completion against the gateway" />}
        />

        <Section id="quickstart" labelledBy="agi-api-docs-quickstart-title" rule>
          <SplitFeature
            id="agi-api-docs-quickstart-title"
            eyebrow="Quick start"
            title="Two credentials, and only one of them is refused anywhere."
            body={
              <p>
                A session bearer token, the same one the apps hold, is accepted on every operation.
                An AGI API key (<code>sk_live_…</code>, issued under Settings, API Keys) carries the
                scopes you pick when you create it and reaches everything except embeddings:{' '}
                <code>models:read</code> for the catalog, <code>inference:write</code> for chat
                completions, audio transcriptions and route preview, <code>usage:read</code> for the
                credit balance. Every operation in the bundle names the credential and the scope it
                accepts.
              </p>
            }
            points={[
              'Stream tokens back with stream: true',
              'model: "auto" routes per request; name a model to pin it',
              `BYOK on ${BYOK_SURFACES.shipped} never touches this gateway`,
            ]}
            visual={
              <CodeTabs tabs={CREDENTIAL_TABS} title="Which credential each endpoint takes" />
            }
          />
        </Section>

        <Section id="migrating" labelledBy="agi-api-docs-migrating-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-api-docs-migrating-title">
                Moving to the gateway.
              </h2>
              <Prose>
                Three moves cover most code: from the OpenAI API, from the Anthropic API, and from
                one model to another once you are here.
              </Prose>
            </div>
            <div>
              <h3 className="agi-ds-h3">From the OpenAI API</h3>
              <Prose>
                Point the client at <code>https://agiworkforce.com/api/llm/v1</code>, pass an AGI
                API key with the <code>inference:write</code> scope, and send an{' '}
                <code>Idempotency-Key</code> header with each chat completion; reuse a key only to
                retry the same body. Replace model names with an id from <code>GET /models</code>,
                or send <code>auto</code> to have each request routed. The model receives{' '}
                <code>messages</code>, <code>temperature</code>, <code>max_tokens</code> or{' '}
                <code>max_completion_tokens</code>, and <code>tools</code> with{' '}
                <code>tool_choice</code>; <code>response_format</code> with <code>json_object</code>{' '}
                or <code>json_schema</code> is enforced when <code>stream</code> is false.{' '}
                <code>top_p</code>, <code>n</code>, <code>stop</code>, <code>seed</code>, the
                penalties, <code>logit_bias</code> and <code>user</code> are accepted but not passed
                to the model. The gateway serves chat completions, models, audio transcriptions,
                embeddings (session token only), route preview and the credit balance; there is no
                Responses, Assistants, Batch, Files, Images or fine-tuning endpoint.
              </Prose>
            </div>
            <div>
              <h3 className="agi-ds-h3">From the Anthropic API</h3>
              <Prose>
                Requests use the OpenAI chat format rather than Messages. Put the{' '}
                <code>system</code> prompt first in <code>messages</code> with the role{' '}
                <code>system</code>. A tool becomes{' '}
                <code>
                  {'{ "type": "function", "function": { name, description, parameters } }'}
                </code>
                , with your <code>input_schema</code> as <code>parameters</code>. A{' '}
                <code>tool_use</code> block comes back as an entry in the assistant message&apos;s{' '}
                <code>tool_calls</code>, its input a JSON string in <code>function.arguments</code>,
                and you answer it with a message whose role is <code>tool</code> and whose{' '}
                <code>tool_call_id</code> names the call. <code>stream: true</code> sends{' '}
                <code>chat.completion.chunk</code> events ending in <code>[DONE]</code> instead of
                message events. Stop sequences are not applied.
              </Prose>
            </div>
            <div>
              <h3 className="agi-ds-h3">Between models</h3>
              <Prose>
                A request that names a model keeps it until you change the id; <code>auto</code>{' '}
                picks per request under your plan and workspace policy.{' '}
                <code>POST /route/preview</code> shows the route <code>auto</code> would take for a
                task without running it, so you can compare before switching. When a model you pin
                is scheduled to leave, its <code>deprecation_date</code> in <code>GET /models</code>{' '}
                tells you when to move.
              </Prose>
            </div>
          </Stack>
        </Section>

        <Section id="deprecations" labelledBy="agi-api-docs-deprecations-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-api-docs-deprecations-title">
                Deprecations.
              </h2>
              <Prose>
                A model that is leaving is announced before it goes. Every model in{' '}
                <code>GET /models</code> carries a <code>deprecation_date</code>, <code>null</code>{' '}
                until a retirement is scheduled; the Models page in the app marks it Retiring with
                that date, and as the date nears the model picker says Leaving. From that date the
                model is no longer listed.
              </Prose>
            </div>
            {retirements.length > 0 ? (
              <Ledger
                caption="Scheduled model retirements"
                rows={retirements.map((retirement) => ({
                  label: (
                    <>
                      {retirement.name} <code>{retirement.id}</code>
                    </>
                  ),
                  value: RETIREMENT_DATE.format(new Date(`${retirement.retiresOn}T00:00:00Z`)),
                }))}
              />
            ) : (
              <Prose>No model retirements are scheduled.</Prose>
            )}
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
              <Button href="#quickstart" variant="secondary">
                Authentication and scopes
              </Button>
              <Button href="/waitlist" variant="secondary">
                Discuss Enterprise access
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter condensed />
    </div>
  );
}
