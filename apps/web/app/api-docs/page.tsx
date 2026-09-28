import Link from 'next/link';

import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { listScheduledModelRetirements } from '@/lib/developer-api/model-retirements';
import {
  DEVELOPER_WEBHOOK_EVENTS,
  DEVELOPER_WEBHOOK_TEST_EVENT,
  DEVELOPER_WEBHOOK_TIMEOUT_SECONDS,
  developerWebhookRetryDays,
} from '@/lib/developer-api/webhook-events';
import { buildMetadata } from '@/lib/seo/metadata';
import { SITE_URL } from '@/lib/seo/site';
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

const GATEWAY_BASE_URL = `${SITE_URL}/api/llm/v1`;
const API_BASE_URL = `${SITE_URL}/api`;

const HERO_TABS = [
  {
    label: 'curl',
    language: 'shell',
    code: `curl ${GATEWAY_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $AGI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "auto", "messages": [{ "role": "user", "content": "hello" }] }'`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `import os
from openai import OpenAI

client = OpenAI(
    base_url="${GATEWAY_BASE_URL}",
    api_key=os.environ["AGI_API_KEY"],
)
reply = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "hello"}],
)
print(reply.choices[0].message.content)`,
    note: "OpenAI's official Python and TypeScript libraries work unchanged once they point at this base URL and carry an AGI API key.",
  },
  {
    label: 'TypeScript',
    language: 'typescript',
    code: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${GATEWAY_BASE_URL}',
  apiKey: process.env.AGI_API_KEY,
});
const reply = await client.chat.completions.create({
  model: 'auto',
  messages: [{ role: 'user', content: 'hello' }],
});
console.log(reply.choices[0]?.message.content);`,
  },
] as const;

const SDK_TABS = [
  {
    label: 'Python',
    language: 'python',
    code: `# pip install openai
# export OPENAI_BASE_URL=${GATEWAY_BASE_URL}
# export OPENAI_API_KEY=sk_live_...
import uuid
from openai import OpenAI

client = OpenAI()

for model in client.models.list():
    print(model.id)

stream = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Summarise the attached notes"}],
    stream=True,
    extra_headers={"Idempotency-Key": str(uuid.uuid4())},
)
for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="")

with open("meeting.m4a", "rb") as audio:
    transcript = client.audio.transcriptions.create(file=audio, model="auto")
print(transcript.text)`,
    note: 'The client reads OPENAI_BASE_URL and OPENAI_API_KEY when base_url and api_key are not passed.',
  },
  {
    label: 'TypeScript',
    language: 'typescript',
    code: `// npm install openai
// export OPENAI_BASE_URL=${GATEWAY_BASE_URL}
// export OPENAI_API_KEY=sk_live_...
import fs from 'node:fs';
import OpenAI from 'openai';

const client = new OpenAI();

for await (const model of client.models.list()) {
  console.log(model.id);
}

const stream = await client.chat.completions.create(
  {
    model: 'auto',
    messages: [{ role: 'user', content: 'Summarise the attached notes' }],
    stream: true,
  },
  { headers: { 'Idempotency-Key': crypto.randomUUID() } },
);
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? '');
}

const transcript = await client.audio.transcriptions.create({
  file: fs.createReadStream('meeting.m4a'),
  model: 'auto',
});
console.log(transcript.text);`,
    note: 'The client reads OPENAI_BASE_URL and OPENAI_API_KEY when baseURL and apiKey are not passed.',
  },
] as const;

const HTTP_TABS = [
  {
    label: 'Route preview',
    language: 'shell',
    code: `curl ${GATEWAY_BASE_URL}/route/preview \\
  -H "Authorization: Bearer $AGI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "selection": "auto", "taskType": "general" }'`,
    note: 'The route auto would take for a task, without running it. Needs inference:write.',
  },
  {
    label: 'Credit balance',
    language: 'shell',
    code: `curl ${GATEWAY_BASE_URL}/credits/balance \\
  -H "Authorization: Bearer $AGI_API_KEY"`,
    note: 'How much of the plan is used and when it resets. Needs usage:read.',
  },
  {
    label: 'Estimate',
    language: 'shell',
    code: `curl ${API_BASE_URL}/usage/estimate \\
  -H "Authorization: Bearer $AGI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "<id from GET /models>", "messages": [{ "role": "user", "content": "hello" }], "max_tokens": 500 }'`,
    note: 'The credit range a chat completion body would cost on a named model, with no provider call and no charge. Needs usage:read.',
  },
  {
    label: 'Settled cost',
    language: 'shell',
    code: `curl ${API_BASE_URL}/usage/turns/$IDEMPOTENCY_KEY \\
  -H "Authorization: Bearer $AGI_API_KEY"`,
    note: 'The credits a request settled at, looked up by the Idempotency-Key it was sent with. Needs usage:read.',
  },
] as const;

const WEBHOOK_TABS = [
  {
    label: 'Payload',
    language: 'json',
    code: `{
  "object": "event",
  "id": "4f2b1c9e-6a3d-4c8e-9b1f-2d7e5a0c3b18",
  "type": "api_key.revoked",
  "created_at": 1790553600,
  "data": {
    "id": "b7a0e2d4-1f3c-4e5a-8b6d-9c0f1e2a3b4c",
    "name": "Production",
    "project_id": null,
    "reason": "deleted"
  }
}`,
    note: 'webhook-id carries the event id, which stays the same when a delivery is retried or resent.',
  },
  {
    label: 'Python',
    language: 'python',
    code: `# pip install standardwebhooks
import os
from standardwebhooks.webhooks import Webhook

webhook = Webhook(os.environ["AGI_WEBHOOK_SECRET"])

def handle(request_body: bytes, headers: dict) -> None:
    event = webhook.verify(request_body, headers)
    print(event["type"], event["data"])`,
    note: 'verify raises when the signature does not match or the timestamp is more than five minutes old.',
  },
  {
    label: 'TypeScript',
    language: 'typescript',
    code: `// npm install standardwebhooks
import { Webhook } from 'standardwebhooks';

const webhook = new Webhook(process.env.AGI_WEBHOOK_SECRET!);

export async function POST(request: Request) {
  const body = await request.text();
  const event = webhook.verify(body, Object.fromEntries(request.headers)) as {
    type: string;
    data: unknown;
  };
  console.log(event.type, event.data);
  return new Response(null, { status: 204 });
}`,
    note: 'Verify the raw body exactly as received; parsing and re-serialising it changes the bytes that were signed.',
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
    note: 'An AGI API key issued in the developer console. Embeddings refuses it, and a call missing the scope on its left answers 403 insufficient_scope.',
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
                An AGI API key (<code>sk_live_…</code>, issued in the{' '}
                <Link href="/developers">developer console</Link>) carries the scopes you pick when
                you create it and reaches everything except embeddings: <code>models:read</code> for
                the catalog, <code>inference:write</code> for chat completions, audio transcriptions
                and route preview, <code>usage:read</code> for the credit balance. Every operation
                in the bundle names the credential and the scope it accepts.
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

        <Section id="sdks" labelledBy="agi-api-docs-sdks-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-api-docs-sdks-title">
                SDKs.
              </h2>
              <Prose>
                There is no AGI SDK. The gateway speaks the OpenAI chat format, so OpenAI&apos;s
                official libraries are the client: install <code>openai</code> from pip or npm, set{' '}
                <code>OPENAI_BASE_URL</code> to <code>{GATEWAY_BASE_URL}</code> and{' '}
                <code>OPENAI_API_KEY</code> to an AGI API key, or pass the same two values to the
                client. Through the library you list models, create chat completions, buffered or
                streamed, and transcribe audio. Embeddings take a session token, not a key. An{' '}
                <code>Idempotency-Key</code> header, sent through <code>extra_headers</code> in
                Python or the request options&apos; <code>headers</code> in TypeScript, makes a
                retry count once and lets you look up what the request cost; without one the gateway
                assigns its own to each call.
              </Prose>
            </div>
            <CodeTabs tabs={SDK_TABS} title="OpenAI's official libraries against the gateway" />
            <div>
              <h3 className="agi-ds-h3">Plain HTTP for the rest</h3>
              <Prose>
                Route preview, the credit balance, cost estimates and settled costs are AGI
                endpoints that the OpenAI libraries have no method for. Call them with any HTTP
                client, with the same key in the <code>Authorization</code> header.
              </Prose>
            </div>
            <CodeTabs tabs={HTTP_TABS} title="AGI endpoints over plain HTTP" />
          </Stack>
        </Section>

        <Section id="webhooks" labelledBy="agi-api-docs-webhooks-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-api-docs-webhooks-title">
                Webhooks.
              </h2>
              <Prose>
                Register an HTTPS endpoint in the <Link href="/developers">developer console</Link>{' '}
                and choose its events. Each event is a POST with a JSON body carrying{' '}
                <code>object</code>, <code>id</code>, <code>type</code>, <code>created_at</code> in
                Unix seconds and <code>data</code>. Requests follow Standard Webhooks:{' '}
                <code>webhook-id</code> is the event id, <code>webhook-timestamp</code> the send
                time in Unix seconds, and <code>webhook-signature</code> is <code>v1,</code>{' '}
                followed by the base64 HMAC-SHA256 of the id, the timestamp and the raw body joined
                with full stops, keyed with the part of your <code>whsec_</code> secret after the
                prefix. Answer with a 2xx within {DEVELOPER_WEBHOOK_TIMEOUT_SECONDS} seconds. Any
                other answer, a redirect or silence is retried with exponential backoff for about{' '}
                {developerWebhookRetryDays()} days, and the console&apos;s delivery log shows each
                attempt and resends any delivery. Send test event delivers{' '}
                <code>{DEVELOPER_WEBHOOK_TEST_EVENT}</code>.
              </Prose>
            </div>
            <Ledger
              caption="Events an endpoint can receive"
              rows={DEVELOPER_WEBHOOK_EVENTS.map((event) => ({
                label: <code>{event.type}</code>,
                value: event.description,
              }))}
            />
            <CodeTabs tabs={WEBHOOK_TABS} title="Receiving and verifying an event" />
          </Stack>
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
                Point the client at <code>{GATEWAY_BASE_URL}</code> and pass an AGI API key with the{' '}
                <code>inference:write</code> scope. An <code>Idempotency-Key</code> header is
                optional with a key; reuse one only to retry the same body. Replace model names with
                an id from <code>GET /models</code>, or send <code>auto</code> to have each request
                routed. The model receives <code>messages</code>, <code>temperature</code>,{' '}
                <code>max_tokens</code> or <code>max_completion_tokens</code>, and{' '}
                <code>tools</code> with <code>tool_choice</code>; <code>response_format</code> with{' '}
                <code>json_object</code> or <code>json_schema</code> is enforced when{' '}
                <code>stream</code> is false. <code>top_p</code>, <code>n</code>, <code>stop</code>,{' '}
                <code>seed</code>, the penalties, <code>logit_bias</code> and <code>user</code> are
                accepted but not passed to the model. The gateway serves chat completions, models,
                audio transcriptions, embeddings (session token only), route preview and the credit
                balance; there is no Responses, Assistants, Batch, Files, Images or fine-tuning
                endpoint.
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
                credential each one takes. There is no Postman collection and no AGI SDK: use
                OpenAI&apos;s libraries for models, chat and transcription, and plain HTTP for the
                rest.
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
