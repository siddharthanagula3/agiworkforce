# Inventory Audit — TS Contracts: `packages/types` + `packages/llm-normalize`

Slice: TS contracts (types + llm-normalize). Auditor pass: 2026-05-29. RECON / read-only.

Coverage honesty up front: the **spine** of this slice — `models.json` (+ its
`models.curation.json` / `models.synced.json` sources and the `sync-models.mjs`
generator), `suite-contracts.ts`, `model-catalog.ts`, `dispatch.ts`, and the
`llm-normalize` payload-policy / endpoint-classification core — was read in
depth and verified empirically (drift check run, tests run, alias resolution
traced, SLOT/tier/preset cross-refs validated). The remaining ~45 `packages/types`
modules are mostly pure interface/type declarations; those were **signal-scanned**
(TODO/FIXME, `throw`, `as any`/`as unknown as`, security greps) and confirmed via
a passing test suite, but not each read line-by-line. Where I did not reach depth,
I say so.

---

## Purpose & Architecture

**`packages/types` (`@agiworkforce/types`)** — the shared TypeScript contract layer
for all seven surfaces. `src/index.ts` re-exports ~40 modules. Two categories:

1. **Pure type/interface declarations** (the majority): `context`, `chat`,
   `conversation`, `agent`, `workflow`, `provider`, `auth`, `voice`, `memory`,
   `research`, `council`, `a2a`, `cross-device`, `mcp-apps`, `tauri`, `signaling`,
   `pairing`, `runtime`, `artifacts`, `web-offline`, `web-hooks`, `scheduler`,
   `event-triggers`, `errors`, `customModel`, `tool-events`, `agent-status`,
   `command-capabilities`, `provider-adapter`, `on-device-models`, `design-system/*`,
   `workspace-analytics`. These compile to nothing at runtime.

2. **Logic-bearing modules** (the ones that can actually break behavior):
   - `model-catalog.ts` (1939 LOC) — the canonical model-routing engine:
     `SLOT_REGISTRY`, `TIER_POLICIES`, alias resolution, auto-mode routing,
     picker/tier helpers. Reads data from `models.json`.
   - `models.json` (generated) + `models.curation.json` (hand-edited) +
     `models.synced.json` (upstream snapshot) — canonical model catalog (70 models,
     25 providers).
   - `suite-contracts.ts` (1793 LOC) — Local/BYOK/Managed trust-boundary contract,
     chat-sync boundary, generated-file trust-boundary validators, send-preview and
     project-header presentation derivations.
   - `dispatch.ts` — Anthropic Dispatch HMAC envelope **contract** (types + protocol
     constants only; the crypto implementation lives out of slice in mobile/desktop).
   - `audit.ts`, `billing-catalog.ts`, `enterprise/index.ts` — small typed helpers.

**`packages/llm-normalize` (`@agiworkforce/llm-normalize`)** — cross-provider LLM
payload normalization. **All exports are pure functions** (the package header
explicitly states "no runtime, no IO, no provider SDK couplings"). Ported from
OpenClaw (MIT, attributed). Encodes per-vendor request quirks: Anthropic
`cache_control`/`service_tier`, OpenAI Responses `store`/`prompt_cache` policy,
OpenAI strict tool-schema normalization, Gemini schema cleanup, reasoning-effort
resolution, endpoint-class classification. 11 source modules.

### Note on the slice brief vs reality

The brief described `llm-normalize` as "CacheIntent/CacheObservation schemas,
canonical app contract." **This is inaccurate.** A repo-wide grep
(`packages apps services crates`) for `CacheIntent`/`CacheObservation` returns
**zero matches** anywhere. `llm-normalize` is actually a provider-payload
normalization library. See Open Questions #1 — the named "canonical app contract"
does not exist in the codebase.

---

## Alive vs Dead

**Both packages are firmly ALIVE — this is genuinely the spine.**

- `@agiworkforce/types` is imported by 20+ modules across `apps/web`,
  `apps/extension`, `apps/desktop`, `apps/mobile`, and other packages. `models.json`
  is additionally embedded into the Rust desktop binary via `include_str!`
  (per the model-catalog.ts header).
- `@agiworkforce/llm-normalize` is wired into shipping import closures:
  `apps/web/app/api/llm/v2/chat/route.ts`, `apps/web/lib/llm-providers/openai.ts`,
  `apps/web/features/chat/.../ComposerFooter.tsx`, and **every** provider adapter
  package (`providers/anthropic`, `/openai`, `/google`, `/deepseek`, `/xai`,
  `/perplexity`, `/lmstudio`) plus `packages/llm-runtime` and
  `packages/types/src/provider-adapter.ts`.
- `model-catalog.ts` `SLOT_REGISTRY`/`TIER_POLICIES` is consumed by the web
  settings UI (`AdvancedModeToggle.tsx`) and quota enforcement
  (`apps/web/lib/assert-quota.ts`).

No dead modules identified within the slice. The `getDefaultModelFor` final
fallback (model-catalog.ts:1806-1809) is self-documented dead-today code (every
tier exposes `workhorse_general`) kept as a defensive net — acceptable, not slop.

---

## Test Coverage

**`packages/types`: 228 tests, 7 files, all passing** (`vitest run`):
`model-catalog.test.ts` (62), `suite-contracts.test.ts` (51), `audit.test.ts`
(47), `tier-policies.test.ts` (43), `dispatch.test.ts` (15), `enterprise.test.ts`
(6), `billing-catalog.test.ts` (4).

The logic-bearing modules are the ones with tests — good prioritization. Pure
type-declaration modules have no tests (expected; nothing to assert at runtime).

**`packages/llm-normalize`: 52 tests, 4 files, all passing**:
`anthropic-payload-policy.test.ts`, `openai-reasoning-effort.test.ts`,
`system-prompt-cache-boundary.test.ts`, `tool-parameter-schema.test.ts`.

**Coverage gap (P2):** 7 of 11 `llm-normalize` source modules have NO unit tests
in this package — `anthropic-tool-payload-compat`, `clean-for-gemini`,
`openai-completions-compat`, `openai-responses-payload-policy`, `openai-tool-schema`,
`provider-attribution`, `prompt-cache-stability`, `string-utils`. These ARE
exercised indirectly through the provider adapters, but the
endpoint-classification logic in `openai-responses-payload-policy.ts`
(`resolveBundledOpenAIResponsesEndpointClass`) is security-relevant (it decides
which hosts count as "native OpenAI" / "local") and deserves direct unit tests.

The model-catalog data integrity is validated by an offline, deterministic CI
gate: `pnpm sync:models:check` — I ran it: **"models.json is in sync with curation
+ synced inputs"**, exit 0. No catalog drift.

---

## Panic / Crash sites

There are **no Rust panics in this slice** (pure TS). The full `throw new`
inventory across both packages (non-test) is **4 sites — all intentional invariant
guards, none on a common user-reachable path**:

| File:line | Site | Reachable on common path? |
|---|---|---|
| `model-catalog.ts:1236` | Module-load drift check: throws if a `SLOT_REGISTRY` modelId is missing from `models.json` | No — fires at import/build, fail-fast by design. Verified all 16 slot models resolve. |
| `model-catalog.ts:1264` | `requireProviderDefaultModel` throws if no default model | No — explicit "require" contract; `getProviderDefaultModel` is the non-throwing variant. |
| `suite-contracts.ts:189` | `assertSurfaceCanSyncChats` throws on CLI/VS Code/Chrome trying to sync | No — deliberate trust-boundary guard at sync service boundary. |
| `suite-contracts.ts:1072` | `assertGeneratedFileTrustBoundary` throws on trust-boundary violations | No — deliberate persistence-boundary guard; non-throwing `validate*` variant exists for graceful callers. |

All 4 are genuine defensive invariants, well-documented, with non-throwing
companions where graceful degradation is wanted. No `unwrap`/`expect`/`todo!`/
`unimplemented!` (not Rust). No crash-prone array indexing on user paths observed
in the logic modules read.

---

## TODO / FIXME / HACK

**Zero** TODO / FIXME / HACK / XXX across both packages' source (verified by grep).
Unusually clean for this codebase.

---

## Security-sensitive code

This slice is low-risk by construction: pure types + pure functions, **no network
egress, no fs, no child_process/exec, no eval, no `process.env` secret reads** in
non-test source. The `apiKey`/`token`/`secret` grep hits are all type-field
declarations and JSDoc examples, not live secret handling.

The genuinely security-relevant code, and its posture:

1. **`anthropic-payload-policy.ts:52-73` — SSRF-shaped hostname hardening (GOOD).**
   Carries an explicit `AUDIT-FIX: alert-396` fix: replaced a free-form
   `endsWith('-aiplatform.googleapis.com')` substring match (which would accept
   `evil-aiplatform.googleapis.com`) with an anchored region-pattern regex
   `VERTEX_REGION_HOST_REGEX`. Long-TTL cache eligibility is gated on parsed
   `URL().hostname` exact-match against `api.anthropic.com` /
   `aiplatform.googleapis.com` plus the region regex. This is correct defensive code.

2. **`openai-responses-payload-policy.ts:107-225` — endpoint classification (GOOD).**
   `normalizeComparableBaseUrl` rejects non-http(s) protocols (line 117), strips
   hash/search, and `resolveBundledOpenAIResponsesEndpointClass` uses exact host
   match + suffix matching with anchored `.`/`-` prefixes (`hostMatchesSuffix`,
   line 144). Local-host detection (`isLocalEndpointHost`) is conservative. This is
   what decides `usesKnownNativeOpenAIEndpoint` / `allowsResponsesStore`, so it is
   trust-relevant; the logic looks sound but is **untested** (see Test Coverage P2).

3. **`dispatch.ts` — HMAC envelope CONTRACT (types only; implementation out of slice).**
   Defines `hmac-sha256-v2`, HKDF info `dispatch-hmac-v2`, 30s message-age window,
   60s nonce-cache TTL (correctly ≥2× message age to defeat edge-of-window replay),
   nonce/timestamp replay parameters, and a transitional cutoff
   (`DISPATCH_HMAC_REQUIRED_AFTER = 2026-05-26`). The actual sign/verify (and thus
   any constant-time-compare concern) lives in `apps/mobile/lib/dispatchHmac.ts` and
   `apps/desktop/src-tauri/.../dispatch_hmac.rs` — **out of this slice**. The header
   itself flags the real risk: "Drift between the two sides is a security defect."
   No in-slice defect; recorded as a cross-surface watch item.

4. **`suite-contracts.ts` trust-boundary validators (GOOD, central to the product's
   locked Local/BYOK/Managed rule).** `validateGeneratedFileTrustBoundary` /
   `assertGeneratedFileTrustBoundary` enforce that local files stay on `file://` +
   `local_device` scope, BYOK transfers require preview+approval evidence, and
   managed files require quota/owner/checksum/retention/deletion metadata. This is
   exactly the kind of guard the project's locked privacy rule needs. The
   `summarizeSendPreview` "what will be sent" disclosure (1569+) is privacy-positive
   and correct.

No P0/P1 security findings in slice.

---

## AI-slop

The slice is largely clean. Minor smells:

1. **Stale price literals in `SLOT_REGISTRY` descriptions (P3)** — see Broken/half-built.
   Human-written pricing baked into description strings has drifted from the catalog.
2. **Double-casts (`as unknown as`)** — 2 occurrences, both low-risk:
   - `model-catalog.ts:1309` — `MANAGED_CLOUD_PROVIDER_IDS.filter(...) as unknown as Provider[]`
     (works around a `const`-tuple-to-Provider[] narrowing limitation; the array
     literally contains Provider strings).
   - `anthropic-tool-payload-compat.ts:184` — `payload as unknown as Record<string,unknown>`
     (payload coercion at the compat boundary).
   Neither is a correctness hazard, but both are the same cast-smell worth noting.
3. **Single-cast `as string`** at `model-catalog.ts:500` guarding a future
   `'experimental'` status not yet in the `ModelStatus` union — defensive, fine.
4. No duplicated-logic stubs, no placeholder/hardcoded user-facing returns, no
   hallucinated APIs found in the logic modules. `void input.transport/capability/modelId`
   in `provider-attribution.ts:164-167` are deliberate future-compat unused-param
   markers, not dead slop.

---

## Broken / half-built features

1. **`SLOT_REGISTRY` description price drift (real, low impact).**
   Two slot descriptions advertise prices that no longer match the catalog the slot
   resolves to:
   - `model-catalog.ts:567-568` (`coding_fast`): claims "DeepSeek V3.2 … **$0.27/$0.42**",
     but `modelId: 'deepseek-chat'` is a **canonicalization alias →
     `deepseek-v4-flash`** (confirmed via `models.curation.json:172`), whose catalog
     price is **$0.14/$0.28**. (Also: the displayed model name will be V4-Flash, not
     "V3.2".)
   - `model-catalog.ts:740` (`escalation_coding`): claims "GLM-4.7: **$0.30/$1.20**",
     but `models.json` has glm-4.7 at **$0.6/$2.2** — ~2× understated.
   **Impact downgraded to P3:** the only confirmed UI consumer,
   `apps/web/features/settings/components/AdvancedModeToggle.tsx:76-83`, renders
   `slotDef.label` + the catalog-resolved `modelName`, NOT `slotDef.description`. So
   these stale strings are **not currently shown to users** — they are
   developer-facing documentation that has drifted from catalog truth, and a latent
   risk if a future surface ever renders `.description`.

No empty shells, dead buttons, or stubbed returns found in the slice.

---

## Severity-ranked issues

### P2
- **`llm-normalize` security-relevant logic is untested.** 7/11 modules have no unit
  tests; notably `openai-responses-payload-policy.ts`
  (`resolveBundledOpenAIResponsesEndpointClass`, lines 159-225) and
  `provider-attribution.ts` decide "native endpoint" / `allowsResponsesStore` /
  `allowsAnthropicServiceTier` — trust-relevant classification.
  *Fix hint:* add direct unit tests for hostname/endpoint classification incl.
  adversarial hosts (`evil-aiplatform.googleapis.com`, `api.openai.com.evil.com`,
  IDN/case variants), mirroring the alert-396 hardening already done in
  `anthropic-payload-policy.ts`.

### P3
- **Stale price literals in `SLOT_REGISTRY` descriptions** —
  `model-catalog.ts:567-568` (claims $0.27/$0.42, resolves to deepseek-v4-flash
  @ $0.14/$0.28, and names "V3.2" while alias → V4-Flash) and
  `model-catalog.ts:740` (claims GLM-4.7 $0.30/$1.20, catalog is $0.6/$2.2).
  *Fix hint:* either drop hardcoded prices from descriptions (derive from catalog at
  render time) or add a unit assertion that any `$x/$y` in a slot description matches
  `getModelMetadataById(normalizeModelId(slot.modelId))`. Not user-visible today.
- **Double-casts** `as unknown as` at `model-catalog.ts:1309` and
  `anthropic-tool-payload-compat.ts:184`. *Fix hint:* tighten the `MANAGED_CLOUD_PROVIDER_IDS`
  tuple typing to avoid the double-cast; cheap cleanup.
- **`models.json` self-flagged unverified IDs** (see Open Questions) — track for the
  next manual verification cycle; not a code defect.

---

## Open questions / uncertainty

1. **CacheIntent / CacheObservation do not exist anywhere in the repo.** Both the
   slice brief and `MEMORY.md` describe these as `llm-normalize`'s "canonical app
   contract." Repo-wide grep across `packages apps services crates` = zero matches.
   Either (a) the doc/memory pointer is stale and the contract was renamed/removed,
   or (b) a named-canonical contract was never built. Recommend resolving which, then
   correcting the brief/MEMORY or filing the missing contract as a tracked gap. I did
   not attempt to guess its intended replacement.

2. **`models.json` IDs I could NOT independently verify offline** (the catalog's own
   `verificationLog` self-flags these): `mistral-large-2512`, `mistral-medium-2508`,
   `codestral-2508` ("not independently verifiable via free docs fetch; flag for next
   manual verification cycle"), and the `gpt-5.x` family (logged as "this project's
   internal identifiers"). The offline `sync:models:check` passing proves
   curation+synced→json consistency, NOT that every upstream model ID is live. The
   zero/negative-cost scan found no anomalies (the zero-cost entries — `auto*` virtual
   routing aliases, `nvidia/*` NIM BYOK, OpenRouter `:free` models — are all
   legitimate). Live ID verification requires online provider-doc checks, out of scope
   for read-only offline recon.

3. **Dispatch HMAC implementation lockstep** — I verified only the contract
   (`dispatch.ts`). Whether `apps/mobile/lib/dispatchHmac.ts` and the Rust verifier
   actually agree on the canonical signing input, use constant-time comparison, and
   honor the same constants is out of this slice and should be confirmed by the
   mobile/desktop audits.

4. **Coverage scope statement:** spine read in depth; the ~45 pure-type modules in
   `packages/types` were signal-scanned + test-pass-verified, not read line-by-line.
   I did not find evidence of problems in them, but I cannot claim exhaustive
   line-level review of every type declaration.
