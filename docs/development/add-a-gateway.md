# Add a gateway

Status: Current
Owner: Platform lead
Last updated: 2026-09-06

A gateway is any OpenAI Chat Completions, OpenAI Responses, or Anthropic
Messages compatible endpoint: a self-hosted proxy, an aggregator, a corporate
LLM gateway. Adding one needs no dedicated provider package.
`createGatewayAdapter` in `packages/ai/providers/factory` builds a working
adapter straight from a declarative entry in
`packages/ai/model-registry/catalog/gateways.json`.

## How a definition reaches live traffic

A definition is inert until a harness points at it. The path, end to end:

1. A harness in `packages/ai/model-registry/catalog/harnesses.json` names
   `gatewayId` instead of a literal `baseUrl` and `apiKeyEnv`. `compile.mjs`
   checks the reference, checks that the harness protocol speaks the gateway's
   dialect, and emits a `gateways` section into the generated registry carrying
   the env var **names** and the declared host, never a value.
2. `listGatewayRoutes()` returns every route whose harness is gateway-backed,
   the same shape `listProtocolRoutes()` returns for literal-endpoint harnesses.
3. `apps/web/lib/services/gateway-routing.ts` turns one of those into a live
   adapter. It resolves `baseUrlEnv` and `apiKeyEnv` from the process
   environment, validates the resolved base URL against the host the definition
   declares, and hands the pair to `createGatewayAdapter`. The host check is not
   optional: a literal `baseUrl` harness is pinned by the catalog, while a
   gateway one takes its endpoint from an env var, and an unchecked env var is
   an SSRF hole. A gateway host also joins the managed egress allowlist
   (`REGISTRY_DECLARED_PROVIDER_HOSTS`, which widens
   `ALLOWED_MANAGED_PROVIDER_HOSTS`) only when the harness declares
   `hostPolicy: "registry_declared"` and the definition's governance block
   records a review, meaning an `https://` `source` and an ISO `verifiedOn`.
   The compile step turns that pair into `governanceReviewedOn`; a definition
   without it dispatches to its own declared host but widens nothing.
4. `ADAPTER_PROVIDERS` in
   `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts` registers
   those provider ids, so a gateway route dispatches through the same
   `buildChatRequest` and error mapper as any other route of its protocol.
5. The route id, the price sheet and the ledger need no new code. The compiled
   route id stays `<provider>/<modelKey>`, `buildServingRouteId` reproduces it
   from the dispatch provider, `getRoutePricing(routeId)` returns the gateway
   route's own prices, and `cogs-ledger-service` records that id as
   `servedRouteId`. A cheaper gateway route therefore bills at gateway rates and
   shows up in the route-cache observability view with no consumer change.
6. Failover treats a gateway route as an ordinary same-model fallback. It is
   ranked and rotated onto exactly like a native route, and the flag below is
   what keeps it out of the plan when it must not serve.

The upstream model id comes from the route's `providerModelId`, so a gateway
that calls a model by a different name needs a route record, not a code branch.

## The flag

`AGI_ROUTING_GATEWAY_ROUTES` gates the whole path. Default off. Set it to `1`
to turn gateway routes on for a process.

The flag is enforced twice, on purpose:

- **Admission.** `admittedHarnessIds()` returns every harness id except the
  gateway-backed ones while the flag is off, and the web request passes that as
  `allowedHarnessIds`, which the resolver intersects with the runtime profile's
  own list. The resolver then refuses those routes outright. Ranking alone
  would not hold, because an empty credential set is dropped by the request
  builder and a cheaper gateway route would win on a process that has no way to
  dispatch it.
- **Dispatch.** `ADAPTER_PROVIDERS` gains no entry for a gateway provider while
  the flag is off, so `resolveWireMode` refuses the provider by name.

`apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.test.ts` asserts
the two halves agree: every gateway route the table cannot serve is a route the
resolver will not admit.

A gateway provider also has to be credentialed to be selected.
`listAvailableManagedProviderIds()` adds one only when the flag is on and both
`baseUrlEnv` and `apiKeyEnv` resolve.

## Admitting a gateway route to managed traffic

A gateway route ships `commercialStatus: "experimental_only"`, which the
resolver refuses for managed traffic and admits for a trust mode where the
customer brings the key. Moving one to `agi_direct` or
`authorized_marketplace` asserts that a reseller agreement exists, so it needs
a reseller agreement confirmed by the founder, not an engineering judgement.
That single field is the last step between a cheaper route and live managed
traffic; everything above it is already wired.

The live examples: `cheaperinference`, `cheaperinference_anthropic`,
`deepinfra`, `together` and `novita` are gateway-backed harnesses in the
`managed-text` group, refused today only by that commercial field and by the
flag.

## Discount policies

A marketplace gateway may declare a `discount` block: the request body field
that carries the minimum discount and the minimum percent the product accepts,
with a source and a verification date. A route on that gateway declares
`"discount": "gateway"` instead of a price; the compiler prices it at the
canonical model's list price reduced by the minimum percent and records the
list price beside it under `route.discount.listPricing`. `createGatewayAdapter`
sends the field on every request, so the gateway either bills at or under that
ceiling or refuses with its documented capacity error, which
`@agiworkforce/provider-runtime` classifies as `capacity_off_switch` and the
failover plan rotates past. No observed discount is ever written into the
catalog.

## The five steps

### 1. Define the entry

Add an object to the `gateways` map in
`packages/ai/model-registry/catalog/gateways.json`, keyed by a new gateway id:

```json
"my_gateway": {
  "id": "my_gateway",
  "displayName": "My Gateway",
  "protocol": "openai_chat_completions",
  "baseUrlEnv": "MY_GATEWAY_BASE_URL",
  "apiKeyEnv": "MY_GATEWAY_API_KEY",
  "extraHeaderEnvs": {},
  "modelsSource": { "kind": "remote", "path": "/v1/models", "requiresKey": false },
  "pricingSource": { "kind": "static" },
  "host": "api.my-gateway.example.com",
  "governance": {
    "dataRetentionClass": "unknown",
    "trainsOnInputs": "unknown"
  }
}
```

Field reference:

- `protocol`: `openai_chat_completions`, `openai_responses`, or
  `anthropic_messages`. Pick whichever wire dialect the gateway actually
  speaks; do not guess.
- `baseUrlEnv` / `apiKeyEnv`: env var **names**, never a literal URL or key.
  `createGatewayAdapter` resolves these at call time from the env source its
  caller passes in.
- `extraHeaderEnvs`: header name to env var name, for a gateway whose auth or
  routing needs a header beyond the bearer token. Omit or leave `{}` when
  none is needed.
- `modelsSource` / `pricingSource`: `{ "kind": "static" }` when you will hand
  author the model catalog entries yourself, or `{ "kind": "remote", "path": "..." }`
  when the gateway publishes an endpoint you intend to sync from, mirroring
  `scripts/sync-openrouter-catalog.mjs`. `requiresKey` on `modelsSource` says
  whether listing models itself needs the API key.
- `host`: the bare hostname added to the managed egress allowlist, read
  alongside `packages/ai/model-registry/catalog/provider-hosts.json`. It is
  also what the resolved `baseUrlEnv` is checked against at build time. Two
  definitions may share a host only when they speak different protocols, which
  is how one gateway exposes both an OpenAI-compatible and an
  Anthropic-compatible dialect.
- `governance`: the retention/training stub. Use `"unknown"` for anything not
  yet verified against the gateway's own docs; add `source` (an `https://`
  URL) and `verifiedOn` (an ISO day) once you have read them, matching the
  fuller records in `packages/ai/model-registry/catalog/provider-governance.json`.
  Those two fields are also the egress gate: without both, the definition's
  host never enters the managed allowlist.

See `openrouter_via_gateway` in the same file for a complete, real, verified
example, deliberately not wired into live routing since OpenRouter already has
its own dedicated harness. For an entry that IS wired, see `cheaperinference`
and the harness that names it.

### 1b. Point a harness at it

Add `"gatewayId": "my_gateway"` to the harness in `harnesses.json` that serves
this provider, and give the harness the matching `protocol` and
`"hostPolicy": "registry_declared"`. A gateway-backed harness must not carry a
literal `baseUrl` or `apiKeyEnv`; the compile step refuses one that does. Add
the harness id to whichever `harnessGroups` entry the surfaces that may reach
it are built from.

### 2. Set the env names

Set the two or three environment variables the entry names
(`MY_GATEWAY_BASE_URL`, `MY_GATEWAY_API_KEY`, and any `extraHeaderEnvs`
values) wherever your other provider keys live. Nothing in the catalog ever
carries the literal value.

### 3. Run the sync

If `modelsSource.kind` is `"remote"`, write a small sync script under
`packages/ai/model-registry/scripts/` that fetches the gateway's models
endpoint and produces catalog entries, following `sync-openrouter-catalog.mjs`
as the template: fetch, transform, sort by key, write idempotently, skip
anything already hand-curated. If `"static"`, author the model entries
directly in `models.curation.json` with `provider` set to your gateway id.

### 4. Regenerate fixtures

```
pnpm --filter @agiworkforce/model-registry generate
```

This recompiles `generated/registry.json`, `generated/registry.ts`, and the
Rust mirrors under `crates/agiworkforce-model-registry` and
`crates/agiworkforce-protocol`.

### 5. Run the checks

```
pnpm --filter @agiworkforce/model-registry test
pnpm --filter @agiworkforce/model-registry check:gateways
node scripts/generate-doc-matrices.mjs
node scripts/env-doctor.mjs --check-examples
```

`check:gateways` validates the entry's shape (env var naming, protocol enum,
governance fields, host and protocol uniqueness, base-url env ownership). It
also runs inside `compile.mjs`, so an invalid definition fails the build rather
than only a separate check. `test` also runs
`scripts/compile.mjs --check`, which fails on drift between the catalog and
the generated registry. Also run `scripts/check-no-hardcoded-model-ids.mjs`
from the repo root; it fails if a model id your sync introduced then gets
copy-pasted as a literal outside the registry's own files.

## Instantiating the adapter

Web server code does not call the factory directly. It asks
`apps/web/lib/services/gateway-routing.ts`, which owns the flag check, the env
resolution and the host validation:

```ts
import { buildGatewayRouteAdapter } from '@/lib/services/gateway-routing';

const adapter = buildGatewayRouteAdapter(providerId);
```

Outside that surface, build it from the compiled registry and an env source:

```ts
import { createGatewayAdapter } from '@agiworkforce/providers-factory';
import { getGatewayHarness } from '@agiworkforce/types';

const harness = getGatewayHarness(harnessId);
const adapter = harness ? createGatewayAdapter(harness.gateway, process.env) : null;
```

`createGatewayAdapter` throws immediately, naming the missing env var, if
`baseUrlEnv` or `apiKeyEnv` resolves to nothing. It never reads `process.env`
itself, so it stays safe to import from any runtime. It takes only the
dispatch fields (`GatewayEndpointDefinition`), which is why the compiled
registry can carry those and leave the sync-time and governance fields in the
catalog.
