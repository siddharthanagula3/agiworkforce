# Add a gateway

Status: Current
Owner: Repository maintainers

A gateway is any OpenAI Chat Completions, OpenAI Responses, or Anthropic
Messages compatible endpoint: a self-hosted proxy, an aggregator, a corporate
LLM gateway. Adding one needs no dedicated provider package.
`createGatewayAdapter` in `packages/ai/providers/factory` builds a working
adapter straight from a declarative entry in
`packages/ai/model-registry/catalog/gateways.json`.

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
  author the model catalog entries yourself, or `{ "kind": "remote", "path":
"..." }` when the gateway publishes a models/pricing endpoint you intend to
  sync from, mirroring `scripts/sync-openrouter-catalog.mjs`. `requiresKey`
  on `modelsSource` says whether listing models itself needs the API key.
- `host`: the bare hostname added to the managed egress allowlist, read
  alongside `packages/ai/model-registry/catalog/provider-hosts.json`.
- `governance`: the retention/training stub. Use `"unknown"` for anything not
  yet verified against the gateway's own docs; add `source` (an `https://`
  URL) and `verifiedOn` (an ISO day) once you have read them, matching the
  fuller records in `packages/ai/model-registry/catalog/provider-governance.json`.

See `openrouter_via_gateway` in the same file for a complete, real, verified
example, deliberately not wired into live routing since OpenRouter already
has its own dedicated harness.

### 2. Set the env names

Set the two or three environment variables the entry names
(`MY_GATEWAY_BASE_URL`, `MY_GATEWAY_API_KEY`, and any `extraHeaderEnvs`
values) wherever your other provider keys live. Nothing in the catalog ever
carries the literal value.

### 3. Run the sync

If `modelsSource.kind` is `"remote"`, write a small sync script under
`packages/ai/model-registry/scripts/` that fetches the gateway's models
endpoint and produces catalog entries, following
`sync-openrouter-catalog.mjs` as the template: fetch, transform, sort by key,
write idempotently, skip anything already hand-curated. If `"static"`, author
the model entries directly in `packages/ai/model-registry/catalog/models.curation.json`
with `provider` set to your gateway id.

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
```

`check:gateways` validates the entry's shape (env var naming, protocol enum,
governance fields, host uniqueness). `test` also runs
`scripts/compile.mjs --check`, which fails on drift between the catalog and
the generated registry. Also run `scripts/check-no-hardcoded-model-ids.mjs`
from the repo root; it fails if a model id your sync introduced then gets
copy-pasted as a literal outside the registry's own files.

## Instantiating the adapter

Server-only code builds the adapter from the catalog entry and env source:

```ts
import { createGatewayAdapter } from '@agiworkforce/providers-factory';
import gateways from '@agiworkforce/model-registry/catalog/gateways.json' with { type: 'json' };

const adapter = createGatewayAdapter(gateways.gateways.my_gateway, process.env);
```

`createGatewayAdapter` throws immediately, naming the missing env var, if
`baseUrlEnv` or `apiKeyEnv` resolves to nothing. It never reads `process.env`
itself, so it stays safe to import from any runtime.
