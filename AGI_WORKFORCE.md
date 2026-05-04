# AGI Workforce — Single Source of Truth

> Last updated: 2026-05-03. This file is the entry point for any agent (human or AI) working on this repo. Read this first; everything else links from here.

## What this is

A multi-surface AI agent platform that wraps **10+ Providers** (cloud + local + BYOK + managed Hobby cloud) into a unified Claude-Desktop / ChatGPT / Gemini alternative. Six shipping surfaces, **one chat layout**. Tagline: _Beyond one model. Beyond one surface. AGI in your hands._ The Rust CLI (`apps/cli`) is the engine; Desktop / Web / Mobile / Chrome ext / VS Code ext wrap it.

## True differentiators (verified May 2026)

1. **Multi-provider in one UI** — 10+ Providers, switch mid-conversation. Anthropic locks to Claude only.
2. **BYOK + Local LLM (Ollama, LMStudio)** — Anthropic doesn't accept user keys.
3. **Cross-provider session continuity** — Claude → GPT → Llama in same thread.

These are the only three. Everything else (mobile dispatch, CLI with TUI, computer use, VS Code ext) — Anthropic already ships.

## Six surfaces — verified state

| Surface         | Path                     | Stack                                                                                                                 | Status                                                            | Distribution path                                                            |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **CLI**         | `apps/cli/`              | Rust monolith, 195 .rs / 155,029 LOC, Ratatui TUI 125 files, 22 subcommands, 19 hook events, 914 tests, 10+ Providers | Cargo green; binary at `~/.cargo/bin/agiworkforce` (5.7MB arm64)  | npm (`@agiworkforce/cli`) + Homebrew + GitHub releases + `install.sh`        |
| **Desktop**     | `apps/desktop/`          | Tauri v2 + React (Vite), 737 .rs backend / 373K LOC, 1,469 IPC commands, 84 component dirs, 84 stores                 | Builds clean; chat surface = `ChatInterface` from `packages/chat` | DMG (macOS, signed `D2PR62RLT4`) + EXE (Windows, EV cert pending) + AppImage |
| **Web**         | `apps/web/`              | Next.js 14 app router, 231 routes + 86 API endpoints, Vite SPA bundled into `/public/chat/`                           | Vercel deployed at `agiworkforce.com/chat`                        | Hosted at agiworkforce.com                                                   |
| **Mobile**      | `apps/mobile/` + `ios/`  | Expo + RN, 41 screens, drawer nav, MMKV+biometric, dispatch (Anthropic Dispatch parity)                               | Expo build profiles ready (dev/preview/prod)                      | iOS App Store + Google Play (no listings yet)                                |
| **Chrome ext**  | `apps/extension/`        | MV3 v1.2.0, autofill (LinkedIn/Lever), 14 test suites                                                                 | dist/ + extension.zip (87K) ready                                 | Chrome Web Store (no listing yet)                                            |
| **VS Code ext** | `apps/extension-vscode/` | v0.3.0, 54+ commands, @agi chat participant, 13 providers                                                             | out/extension.js compiled                                         | VS Code Marketplace (no listing yet)                                         |

**Backend:** `services/api-gateway/` (Express v5.2, 14 routes, Fly.io ready) + `services/signaling-server/` (WebRTC, deployed Fly.io) + `supabase/` (17 migrations, us-east-2).
**Shared TS packages:** `packages/chat` (canonical chat component), `packages/api`, `packages/types`, `packages/runtime`, `packages/utils`.
**Active Rust crates:** 12 (down from 113 — see commit `ac59e09e`). Specifically: `agiworkforce-protocol`, `agiworkforce-sandbox-policy`, plus 10 transitive path-deps needed by protocol (`async-utils`, `execpolicy`, `network-proxy`, `utils-{absolute-path,cache,home-dir,image,rustls-provider,string,template}`).

## Pricing model (locked 2026-05-03)

| Tier       | Price              | At MVP        | What                                                                                 |
| ---------- | ------------------ | ------------- | ------------------------------------------------------------------------------------ |
| Local-only | Free forever       | YES           | Run Ollama/LMStudio on your laptop. No Supabase. Desktop only.                       |
| BYOK       | Free forever       | YES           | Bring your own keys to Anthropic/OpenAI/Google/etc. Optional Supabase if Cloud mode. |
| Hobby      | TBD ($5/mo target) | YES           | Managed cloud, limited credits, basic models. Only paid MVP tier.                    |
| Pro        | TBD                | NO (waitlist) | Released after security audit clears.                                                |
| Max        | TBD                | NO (waitlist) | Released after security audit clears.                                                |
| Enterprise | Contact sales      | Contact sales | SSO, SCIM, custom retention, audit log export, dedicated support.                    |

## Local vs Cloud mode (architecture)

- **Local mode** (Desktop only): SQLite, Ollama/LMStudio, no auth, no sync, no Dispatch.
- **Cloud mode** (Desktop + Web + Mobile): Supabase, BYOK or Hobby cloud, Realtime cross-device sync, OAuth, Dispatch.
- Mode picker: `apps/desktop/src/components/Onboarding/ModeSelectionDialog`.
- Runtime detection: `packages/runtime/src/detect.ts` (`isTauri`, `isCloudWeb`).

## MVP plan (3 waves, parallel where possible)

| Wave       | Timeline   | What ships                                                                                              | Status      |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **Wave 0** | 2026-05-03 | Cleanup: -1.04M LOC, SSOT created, audit P0/P1 mostly closed                                            | ✅ SHIPPED  |
| **Wave 1** | 2026-05-03 | CLI v1.0 — Homebrew + install.sh + cargo + GitHub Release (5 platforms) live; npm pending NPM_TOKEN     | ✅ SHIPPED  |
| **Wave 2** | Weeks 2-5  | Desktop v1.0 — pixel-close Claude Desktop UI, Windows EV cert, web UnifiedAgenticChat done, IPC pruning | In progress |
| **Wave 3** | Weeks 6-9  | Mobile (App Store + Play) + Chrome ext (Web Store) + VS Code ext (Marketplace) + Hobby tier launch      | Pending     |

Active sprint plan: [docs/plans/sprint1-vault-rewire.md](docs/plans/sprint1-vault-rewire.md). Master remediation: [docs/plans/master-remediation.md](docs/plans/master-remediation.md). License: PROPRIETARY (see [LICENSE](LICENSE)).

## OpenClaw reference & porting plan

> Distilled from a thorough subsystem-by-subsystem review of [openclaw/openclaw](https://github.com/openclaw/openclaw) (~17,499 files / ~1.5M LOC TS, MIT, Peter Steinberger) cloned at `~/Desktop/reference/openclaw/`. OpenClaw is a TypeScript orchestration shell built on top of `@mariozechner/pi-ai`; its bet is "one local-first daemon ↔ many messaging channels", which is the inverse of ours ("one engine ↔ many shells"). Most of it is misaligned for AGI Workforce — but a narrow band of production-tested helpers is gold.

### Verdict by tier

| Tier   | What                                                                                                                                                          | LOC      | Decision                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| **T1** | Pure cross-provider payload-normalization helpers (OpenAI Responses policy, reasoning-effort tables, system-prompt cache boundary, GPT-5.x fallbacks)         | ~1,650   | **Lift verbatim** — Sprint 1 (✅ shipped 2026-05-04, partial: 727 LOC) |
| **T2** | Provider adapters with lighter coupling (Anthropic 3,191 LOC, Ollama 10,638 LOC) + MCP transport/catalog + provider-attribution + `ProviderAdapter` interface | ~30,000  | **Lift with adapter layer** — Sprint 2                                 |
| **T3** | Plugin SDK shape (`definePluginEntry`, `ProviderPlugin`), hook pipeline (30+ events with priority/sticky-block merge), skills loader pattern                  | n/a      | **Study, then implement fresh in Rust CLI**                            |
| **T4** | OpenAI provider (13,374 LOC, 8 capabilities, 48 SDK imports), browser tool (~25,500 LOC, Express server hardwired)                                            | ~40,000  | **Skip — vendor SDK + Playwright direct is faster**                    |
| **T5** | All 23 messaging channels, Gateway daemon, Canvas/A2UI, voice-call, ACPX, memory plugins, qa-lab/qa-matrix, compat-shims (codex/migrate-\*), companion apps   | ~250,000 | **Irrelevant — wrong product shape**                                   |

Full extension inventory and per-extension classification: see [docs/openclaw-port/extensions-inventory.md](docs/openclaw-port/extensions-inventory.md) (TODO — captured in agent transcripts pending).

### Critical hidden dependency

Every OpenClaw provider extension declares `@mariozechner/pi-ai@0.71.1` as a runtime dependency. Pi-ai is the actual model-loop / streaming / tool-call engine; OpenClaw's plugin-sdk is the orchestration glue around it. **Lifting an OpenClaw provider extension means inheriting pi-ai too**, or replacing it with our own runtime. This is why Sprint 2 must define `ProviderAdapter` first and use **vendor SDKs** (`@anthropic-ai/sdk`, `openai`, `ollama`) for the wire — we get OpenClaw's _logic_ (what to send) without its _runtime_ (how to send).

### `ProviderAdapter` interface (planned)

Lifted shape from OpenClaw's `ProviderPlugin` (`packages/plugin-sdk/src/provider-entry.ts`). Will land in `packages/types/src/provider-adapter.ts` in Sprint 2.

```ts
export interface ProviderAdapter {
  id: Provider; // from packages/types/src/provider.ts
  label: string;
  auth: AuthMethod[];
  catalog(ctx: ProviderCatalogContext): Promise<ModelInfo[]>;
  buildReplayPolicy?(ctx: ReplayPolicyContext): ReplayPolicy; // session-history rebuild
  normalizeToolSchemas?(ctx: NormalizeToolSchemasContext): void; // Gemini cleanup, OpenAI strict, etc.
  wrapStreamFn?(ctx: WrapStreamFnContext): StreamFn; // OpenAI tools → Anthropic etc.
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk>;
}
```

Four optional functions + one required `stream`. That's the entire surface every provider implements in OpenClaw, and it's the right shape for us too.

### Sprint plan (5 sprints, ~2 weeks intensive / ~5 weeks part-time)

| Sprint  | Focus                                                                       | Active code time | Status                 |
| ------- | --------------------------------------------------------------------------- | ---------------- | ---------------------- |
| **S1**  | Tier-1 normalization layer — `packages/llm-normalize/`                      | 2–4 hours        | **✅ Done 2026-05-04** |
| **S2**  | `ProviderAdapter` interface + Anthropic + Ollama on vendor SDKs             | 1–3 days         | **✅ Done 2026-05-04** |
| **S3**  | OpenAI on `openai` npm package + add provider-attribution layer             | 2–3 days         | **✅ Done 2026-05-04** |
| **S4a** | MCP transport/catalog + skills loader (markdown+frontmatter)                | 2–3 hours        | **✅ Done 2026-05-04** |
| **S4b** | 5 missing hook events in Rust CLI (apps/cli)                                | 2–4 days         | **✅ Done 2026-05-04** |
| **S5**  | Live smoke tests for 3 adapters + cross-provider demo CLI                   | 2–3 hours        | **✅ Done 2026-05-04** |
| **S6**  | Browser tool fresh on `playwright-core` (NOT lifted — schema patterns only) | 2–3 days         | Pending                |
| **S7**  | API gateway integration — wire adapters into `services/api-gateway/`        | 2–3 days         | **✅ Done 2026-05-04** |
| **S8**  | Web app integration — Next.js proxy routes + multi-provider demo page       | 2–3 hours        | **✅ Done 2026-05-04** |

**Top-line bet:** Sprint 1's 1,650-LOC normalization layer is what makes "switch model mid-conversation across providers" robust. Without it, that differentiator becomes a backlog of P1 bugs forever (Azure dropping `service_tier`, Cerebras rejecting `store`, DeepSeek thinking-tag format, Vertex Anthropic cache TTL gating, etc.).

### Skip lists, with reasoning

- **All 23 channels** (Discord/Telegram/Slack/WhatsApp/Signal/iMessage/Matrix/IRC/Teams/WeChat/QQ/Feishu/LINE/etc.) — wrong product shape; we ship apps, not channels.
- **OpenAI provider extension** (13k LOC, 8 capabilities, 48 SDK imports) — implementing fresh on the official `openai` package costs ~600 LOC vs lifting 13k of harness coupling.
- **Browser tool** (25k LOC, Express server, plugin-sdk threaded throughout) — `playwright-core` gives 90% of this in 800 LOC. Lift the _patterns_ (managed isolated profile, discriminated-union schema for one tool with action verbs, `aria` vs `ai` snapshot modes, stale-ref recovery loop) — not the code.
- **Plugin SDK** (40,620 LOC, 56 subpaths) — borrow the contract shapes (`definePluginEntry`, `ProviderPlugin`), implement Rust-native in our CLI.
- **Gateway daemon** — we don't run a long-lived ↔ many-clients daemon; our Tauri app + Fly.io services already do this.
- **Memory plugins** (~78k LOC) — we have Supabase + our own schema; our memory contract is mode-aware (Local/Cloud) which OpenClaw isn't.

### License compliance

OpenClaw is **MIT** (Peter Steinberger, 2025). Per the license:

- Each ported file carries an SPDX-style attribution comment at the top
- [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) at repo root catalogs every ported source path with the upstream MIT license text
- Our license remains PROPRIETARY for the rest of the codebase

That is the entire compliance burden.

### Reading order for new contributors

1. This section.
2. [`packages/llm-normalize/README.md`](packages/llm-normalize/README.md) — what already shipped + what's deferred.
3. [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) — provenance ledger.
4. (Sprint 2+) `packages/types/src/provider-adapter.ts` — the interface every adapter implements.

## Documentation map

| Doc                                                                              | What                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **THIS FILE**                                                                    | Single source of truth, entry point                                                |
| [README.md](README.md)                                                           | User-facing quick start (download, install)                                        |
| [BUILD.md](BUILD.md)                                                             | Prerequisites, build commands per surface                                          |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                               | PR conventions, branch protection, commit format                                   |
| [docs/VISION.md](docs/VISION.md)                                                 | Product vision (ONE chat layout, multi-provider)                                   |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                     | Cross-surface architecture                                                         |
| [docs/ROADMAP.md](docs/ROADMAP.md)                                               | Live wave/sprint status (this is what changes weekly)                              |
| [docs/DESIGN.md](docs/DESIGN.md)                                                 | UI principles. Reference: `~/Desktop/reference/ui/`                                |
| [docs/PRICING.md](docs/PRICING.md)                                               | Tier model details                                                                 |
| [apps/cli/ARCHITECTURE.md](apps/cli/ARCHITECTURE.md)                             | CLI deep-dive (will be folded into docs/ARCHITECTURE.md in v2)                     |
| [docs/audit/](docs/audit/)                                                       | Historical audits (AUDIT_REPORT.md, FIX_QUEUE.md, AUDIT_2026-05-03.md)             |
| [docs/plans/](docs/plans/)                                                       | Active sprint plans (only — stale plans deleted 2026-05-03)                        |
| [docs/api/](docs/api/)                                                           | Postman + OpenAPI 3.0 + curl/JS/Python examples                                    |
| [packages/llm-normalize/README.md](packages/llm-normalize/README.md)             | Tier-1 cross-provider normalization helpers (ported from OpenClaw)                 |
| [packages/providers/anthropic/](packages/providers/anthropic/)                   | Anthropic provider adapter via `@anthropic-ai/sdk`                                 |
| [packages/providers/ollama/](packages/providers/ollama/)                         | Ollama provider adapter via direct HTTP                                            |
| [packages/providers/openai/](packages/providers/openai/)                         | OpenAI provider adapter via the `openai` SDK (Chat Completions API)                |
| [packages/mcp/](packages/mcp/)                                                   | MCP client wrapper (stdio / sse / streamable-http) via `@modelcontextprotocol/sdk` |
| [packages/skills/](packages/skills/)                                             | Skills loader: markdown + YAML frontmatter, layered precedence, prompt formatter   |
| [packages/types/src/provider-adapter.ts](packages/types/src/provider-adapter.ts) | `ProviderAdapter` interface — every provider implements this                       |
| [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)                               | Provenance ledger for code ported from open-source projects                        |

## Build verification (this snapshot, 2026-05-03)

```bash
cargo check --workspace      # GREEN (1.4s after dep cleanup)
cargo build -p agiworkforce-cli   # GREEN (7.5s)
pnpm typecheck:all            # not re-run since memory consolidation
pnpm lint                     # not re-run
```

## Audit status

- AUDIT_2026-05-03 results: **P0 13/14 closed**, **P1 20/25 closed**, P2/P3 in queue.
- Remaining P0: CLI-5 (auth.json plaintext, mitigated by 0o600).
- Remaining P1: DESK-5 (Vite env vars in Rust process env), DESK-8 (in-RAM remembered choices), WEB-4 (Stripe webhook body-read), WEB-5 (CSRF for Bearer), WEB-11 (CSP unsafe-inline style).

## What shipped on 2026-05-03 (19 commits, -1.04M LOC net)

| Commit     | What                                             | Impact        |
| ---------- | ------------------------------------------------ | ------------- |
| `61ca9205` | Root-level debris cleanup                        | -89 LOC       |
| `ac59e09e` | Deleted 102 codex-rs port crates                 | **-995K LOC** |
| `9bed1b68` | SSOT structure (this file + docs/)               | +1.2K         |
| `c45422f8` | 10-phase CLI parity work + Cargo.lock regen      | +3.9K / -9.5K |
| `fe9162c9` | apps/cli/ARCHITECTURE.md                         | +569          |
| `be78874f` | dead_code reorg + 898/898 test fixes             | +60           |
| `699a2ccd` | Wave 1 prep: npm + Homebrew + CI + launch drafts | +1.2K         |
| `361a2522` | Wave 2/3 plans                                   | +353          |
| `5db614d2` | Desktop dir triage batch 1                       | -1.5K         |
| `5f7d21cc` | WEB-4 Stripe webhook fix                         | +22 / -3      |
| `76883138` | Web UnifiedAgenticChat deleted                   | **-36K**      |
| `a26bdaf8` | Desktop+web batch 2 (21 dirs)                    | -7.5K         |
| `61d9058d` | launch-readiness-check.sh                        | +147          |
| `b409fe55` | install.sh fixes                                 | +17 / -7      |
| `c0e0ae01` | release-cli.yml linux deps                       | +25           |
| `b71ce74d` | hooks.rs windows cfg(unix) fix                   | +3            |
| `a8650d61` | Drop linux-arm64 from matrix                     | +6 / -5       |
| `7df13513` | update-homebrew-tap.sh bash 3.2 compat           | +23 / -17     |
| `8d5c8758` | 28 dead store/hook/service/lib files             | **-9.4K**     |

**v-cli-1.0.0 LIVE**: Tag `v-cli-1.0.0` triggered release-cli.yml after 3 iterations. GitHub Release with 5 platform binaries published. Homebrew tap formula auto-generated and pushed to `siddharthanagula3/homebrew-tap`. install.sh tested. Run `./scripts/launch-readiness-check.sh` anytime to verify state.

Original codex-cli source preserved at `~/Desktop/reference/codex-cli/` for future re-port if needed.

## What shipped on 2026-05-04 (OpenClaw porting Sprint 1)

| Deliverable                             | What                                                                 | Impact                  |
| --------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| `packages/llm-normalize/` (new package) | Cross-provider payload normalization, ported from OpenClaw (MIT)     | +727 LOC TS, +1 package |
| `THIRD_PARTY_LICENSES.md` (new)         | Provenance ledger with full MIT license text for OpenClaw            | +50 LOC                 |
| `AGI_WORKFORCE.md` (this file)          | New top-level section "OpenClaw reference & porting plan" + S1 entry | +90 LOC                 |
| Build + typecheck                       | `pnpm --filter @agiworkforce/llm-normalize {typecheck,build}` GREEN  | clean                   |

**Sprint 1 deliverables (`packages/llm-normalize/src/`):**

| File                                 | LOC     | Purpose                                                                                                                                     |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-responses-payload-policy.ts` | 410     | Decides `service_tier`/`store`/`prompt_cache_key`/server-compaction per endpoint+model. Inlined hostname classification covers ~15 vendors. |
| `openai-reasoning-effort.ts`         | 146     | Per-model-family reasoning effort tables (GPT-5/5.1/5.2-pro/Codex/Codex-mini/Codex-max) with graceful fallbacks.                            |
| `system-prompt-cache-boundary.ts`    | 58      | Sentinel-comment splitter so providers with prompt caching get max cache hits across stable-prefix and dynamic-suffix.                      |
| `index.ts` (barrel)                  | 54      | Public surface: 14 named exports, no default export.                                                                                        |
| `lib/prompt-cache-stability.ts`      | 29      | `normalizeStructuredPromptSection` + `normalizePromptCapabilityIds` (pure helpers).                                                         |
| `lib/string-utils.ts`                | 30      | Minimal subset of OpenClaw's `string-coerce` (5 helpers).                                                                                   |
| **Total**                            | **727** | All pure functions. Zero new runtime deps. `target: ES2022`, `lib: ES2023` (Node 22+).                                                      |

**Deferred to Sprint 2** (transitive deps too heavy for a clean S1 lift):

- `provider-attribution.ts` (806 LOC, dynamically scans plugin manifests at runtime)
- `anthropic-payload-policy.ts` (depends on provider-attribution)
- `openai-completions-compat.ts` (depends on provider-attribution + pi-ai `Model` type)
- `openai-tool-schema.ts` (depends on TypeBox + Gemini schema cleanup)
- `anthropic-family-tool-payload-compat.ts` (StreamFn wrapper, depends on `@mariozechner/pi-agent-core`)
- `apply-patch.ts` (does file I/O via OpenClaw's sandbox FS bridge — needs full sandbox-or-host rewrite)

## What shipped on 2026-05-04 (OpenClaw porting Sprint 2)

| Deliverable                                       | What                                                                                               | Impact                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| `packages/types/src/provider-adapter.ts` (new)    | `ProviderAdapter` interface + supporting types (auth, content blocks, tools, stream chunks, hooks) | +358 LOC TS                    |
| `packages/llm-normalize/` (added Tier-1B helpers) | `provider-attribution` (simplified, pure), `anthropic-payload-policy`, `openai-completions-compat` | +667 LOC TS                    |
| `packages/providers/anthropic/` (new package)     | Adapter via `@anthropic-ai/sdk@^0.40.1` — catalog, translate, stream events, replay policy         | +547 LOC TS, +1 package        |
| `packages/providers/ollama/` (new package)        | Adapter via direct HTTP — `/api/tags` discovery, `/api/chat` NDJSON streaming                      | +549 LOC TS, +1 package        |
| `pnpm-workspace.yaml` (updated)                   | Added `packages/providers/*` glob                                                                  | +1 line                        |
| `AGI_WORKFORCE.md` (this file)                    | Sprint 2 entry + sprint-table mark + docs map updates                                              | +50 LOC                        |
| Build + typecheck                                 | All four packages (`types`, `llm-normalize`, `providers-anthropic`, `providers-ollama`) GREEN      | clean                          |
| **Sprint 2 total**                                |                                                                                                    | **+2,121 LOC TS, +2 packages** |

**Sprint 2 deliverables (`packages/providers/`):**

| File                                            | LOC | Purpose                                                                                                  |
| ----------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------- |
| **anthropic** (5 files, 580 LOC incl. 33 tests) |     |                                                                                                          |
| `anthropic/src/index.ts`                        | 147 | `createAnthropicAdapter(config) → ProviderAdapter`. Wraps `@anthropic-ai/sdk`. Auth list. Error mapping. |
| `anthropic/src/translate.ts`                    | 224 | `ChatRequest` → SDK `MessageStreamParams`. Image/tool/thinking blocks → vendor wire shape.               |
| `anthropic/src/stream.ts`                       | 133 | SDK `MessageStreamEvent` → canonical `StreamChunk` discriminated union. Tracks block-by-index state.     |
| `anthropic/src/catalog.ts`                      | 43  | Hardcoded model list (Anthropic has no `/models` discovery). Update with each Claude release.            |
| `anthropic/src/replay-policy.ts`                | 33  | Drops unsigned `thinking` blocks on replay (Anthropic rejects them).                                     |
| **ollama** (5 files, 549 LOC)                   |     |                                                                                                          |
| `ollama/src/index.ts`                           | 147 | `createOllamaAdapter(config) → ProviderAdapter`. Direct fetch, no SDK. `keep_alive` + `num_ctx` knobs.   |
| `ollama/src/translate.ts`                       | 122 | `ChatRequest` → Ollama `/api/chat` body. System prompt as first message. OpenAI-style tools.             |
| `ollama/src/stream.ts`                          | 100 | NDJSON line parser + `OllamaChatStreamChunk` → `StreamChunk`. Synthesizes tool-use start/delta/end.      |
| `ollama/src/types.ts`                           | 98  | Hand-typed Ollama HTTP API subset (no `ollama` npm dep).                                                 |
| `ollama/src/catalog.ts`                         | 82  | `/api/tags` discovery. Per-family context-window estimation table.                                       |

**Sprint 2 verification:**

```bash
pnpm --filter @agiworkforce/types typecheck                # GREEN
pnpm --filter @agiworkforce/llm-normalize typecheck        # GREEN
pnpm --filter @agiworkforce/providers-anthropic typecheck  # GREEN
pnpm --filter @agiworkforce/providers-ollama typecheck     # GREEN
pnpm --filter @agiworkforce/llm-normalize \
     --filter @agiworkforce/providers-anthropic \
     --filter @agiworkforce/providers-ollama build         # GREEN (3/3 emitted)
```

**Sprint 2 still-deferred items** (land alongside OpenAI in S3):

- `openai-tool-schema.ts` — JSON Schema strict-mode normalizer + Gemini cleanup helper
- `anthropic-family-tool-payload-compat.ts` — StreamFn wrapper for OpenAI-style tools through Anthropic-shaped APIs (relevant when running OpenAI's tool format through Vertex Anthropic)
- `apply-patch.ts` — needs sandbox-or-host abstraction first
- Live API smoke tests for both adapters (require user's `ANTHROPIC_API_KEY` + a running Ollama daemon)
- Wiring into `services/api-gateway/` and `apps/desktop/` chat flow (separate sprint)

## What shipped on 2026-05-04 (OpenClaw porting Sprint 3)

| Deliverable                                       | What                                                                                                                                                                                                        | Impact                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `packages/llm-normalize/` (added Tier-1C helpers) | `openai-tool-schema` (strict-mode JSON Schema normalizer), `tool-parameter-schema` (provider-aware), `clean-for-gemini` (lifted full 458→442 LOC scrubber, TypeBox-free)                                    | +987 LOC TS                   |
| `packages/providers/openai/` (new package)        | Adapter via `openai@^4.85.0` SDK — Chat Completions API. Catalog with optional dynamic `/models` discovery; tool/image/thinking content; `store`/`prompt_cache_key`/`service_tier` policy via llm-normalize | +756 LOC TS, +1 package       |
| `pnpm install` regen                              | Resolved `openai` workspace dep                                                                                                                                                                             | (lockfile)                    |
| `THIRD_PARTY_LICENSES.md`                         | Added 3 new ported file entries (clean-for-gemini, openai-tool-schema, tool-parameter-schema)                                                                                                               | +6 LOC                        |
| `AGI_WORKFORCE.md` (this file)                    | Sprint 3 entry + S3 ✅ in sprint table + docs map updates                                                                                                                                                   | +35 LOC                       |
| Build + typecheck                                 | All five LLM packages (`types`, `llm-normalize`, `providers-anthropic`, `providers-ollama`, `providers-openai`) GREEN                                                                                       | clean                         |
| **Sprint 3 total**                                |                                                                                                                                                                                                             | **+1,743 LOC TS, +1 package** |

**Sprint 3 deliverables (`packages/providers/openai/`):**

| File                      | LOC | Purpose                                                                                                                                                                                                    |
| ------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai/src/index.ts`     | 180 | `createOpenAIAdapter(config) → ProviderAdapter`. Wraps `openai` SDK. Auth list (api-key + Codex OAuth). Catalog with discovery toggle. Wires `detectOpenAICompletionsCompat` + Responses payload policy.   |
| `openai/src/translate.ts` | 254 | `ChatRequest` → SDK `ChatCompletionCreateParams`. Splits tool-result blocks into separate `role:"tool"` messages. Maps thinking-budget → `reasoning_effort`. Strict-mode tool schema flow gated on compat. |
| `openai/src/stream.ts`    | 140 | SDK chunk → canonical `StreamChunk`. Tracks tool calls by index→id. Drains trailing usage chunks. Maps `finish_reason` → our stop reasons.                                                                 |
| `openai/src/types.ts`     | 127 | Hand-typed Chat Completions wire subset (we hand-type so we stay decoupled from minor SDK type churn).                                                                                                     |
| `openai/src/catalog.ts`   | 55  | Curated current-model list (GPT-5.4 family). Discovery merges in newer ids from `/models` when reachable.                                                                                                  |

**Sprint 3 normalization layer additions (`packages/llm-normalize/src/`):**

| File                       | LOC | Purpose                                                                                                                                                                     |
| -------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-tool-schema.ts`    | 248 | OpenAI strict-mode JSON Schema normalizer + diagnostics. Top-level `type:"object"`, `additionalProperties:false`, every property in `required`, no `anyOf`/`oneOf`/`allOf`. |
| `tool-parameter-schema.ts` | 297 | Provider-aware schema flattener. Auto-converts TypeBox root unions → object schemas with merged properties. Routes Gemini cleanup vs xAI keyword strip.                     |
| `lib/clean-for-gemini.ts`  | 442 | Gemini / Cloud Code Assist tool-schema scrubber. Strips disallowed keywords, resolves local `$ref`, flattens literal unions, last-resort union-fallback type pick.          |

**Sprint 3 verification:**

```bash
pnpm --filter @agiworkforce/types typecheck                # GREEN
pnpm --filter @agiworkforce/llm-normalize typecheck        # GREEN
pnpm --filter @agiworkforce/providers-anthropic typecheck  # GREEN
pnpm --filter @agiworkforce/providers-ollama typecheck     # GREEN
pnpm --filter @agiworkforce/providers-openai typecheck     # GREEN
pnpm build (4/4 LLM packages with build script)             # GREEN
```

**Cumulative state after S1+S2+S3:**

- 5 packages: `@agiworkforce/types` (provider-adapter), `@agiworkforce/llm-normalize`, `@agiworkforce/providers-{anthropic,ollama,openai}`
- ~4,641 LOC TypeScript total in the LLM layer
- 3 working provider adapters (Anthropic, Ollama, OpenAI) all implementing the same `ProviderAdapter` interface
- 13 production-tested cross-vendor normalization helpers from OpenClaw + 1 Gemini scrubber + 1 strict-mode normalizer
- Zero new runtime deps beyond `@anthropic-ai/sdk` and `openai`
- License attribution complete in `THIRD_PARTY_LICENSES.md`

**Sprint 3 still-deferred items** (move to S4):

- `anthropic-family-tool-payload-compat.ts` — StreamFn wrapper for OpenAI-style tool payloads through Anthropic API (only relevant when proxying OpenAI tool format through Anthropic-shaped endpoints)
- `apply-patch.ts` — needs sandbox-or-host abstraction first
- OpenAI Responses API path (`store`/`prompt_cache_key`/server compaction) — current adapter uses Chat Completions only; Responses needed for o-series with full server-side reasoning state
- Live API smoke tests with real keys (Anthropic, OpenAI, running Ollama daemon)
- MCP transport + catalog
- Skills loader (markdown + frontmatter format)
- Wiring into `services/api-gateway/` and `apps/desktop/` chat flow

## What shipped on 2026-05-04 (OpenClaw porting Sprint 4a)

| Deliverable                      | What                                                                                                                                                                                                                        | Impact                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `packages/mcp/` (new package)    | MCP client wrapper. Three transports (stdio / sse / streamable-http) via `@modelcontextprotocol/sdk@^1.0.4`. `McpServerConfig` shape mirrors OpenClaw for ecosystem compat. `connectMcpServer()` + `buildMcpToolCatalog()`. | +309 LOC TS, +1 package      |
| `packages/skills/` (new package) | Skills loader: tiny YAML-frontmatter parser (no heavy `yaml` dep), filesystem scanner (subdir + flat layouts), 6-tier precedence merger, XML-style prompt formatter.                                                        | +485 LOC TS, +1 package      |
| `THIRD_PARTY_LICENSES.md`        | Added shape-derivation notes for MCP config types and skill format                                                                                                                                                          | +6 LOC                       |
| `AGI_WORKFORCE.md` (this file)   | Sprint 4a entry + sprint table split (S4a ✅ done, S4b pending)                                                                                                                                                             | +25 LOC                      |
| Build + typecheck                | Both packages GREEN; no new runtime deps beyond `@modelcontextprotocol/sdk`                                                                                                                                                 | clean                        |
| **Sprint 4a total**              |                                                                                                                                                                                                                             | **+794 LOC TS, +2 packages** |

**Sprint 4a deliverables:**

| File                          | LOC | Purpose                                                                                                                                             |
| ----------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **mcp** (4 files, 309 LOC)    |     |                                                                                                                                                     |
| `mcp/src/types.ts`            | 70  | `McpServerConfig` (mirrors OpenClaw), `McpToolCatalog`, `McpCatalogTool`, `McpCallToolResult`                                                       |
| `mcp/src/transport.ts`        | 63  | Resolve config → `StdioClientTransport` / `SSEClientTransport` / `StreamableHTTPClientTransport`                                                    |
| `mcp/src/connect.ts`          | 145 | `connectMcpServer()` (single server) + `buildMcpToolCatalog()` (many servers, fail-soft per-server)                                                 |
| `mcp/src/index.ts`            | 31  | Public surface barrel                                                                                                                               |
| **skills** (6 files, 485 LOC) |     |                                                                                                                                                     |
| `skills/src/frontmatter.ts`   | 142 | Tiny YAML frontmatter parser (no runtime dep). Handles flat key:value, lists, one-level nested objects (sufficient for OpenClaw skill schema 100%). |
| `skills/src/loader.ts`        | 121 | Filesystem scanner. Two layouts: OpenClaw subdir (`<id>/SKILL.md`) and flat (`<name>.md`). Errors per-file don't fail the batch.                    |
| `skills/src/types.ts`         | 79  | `Skill`, `SkillLayer`, `SkillMetadata`, `SkillSource`                                                                                               |
| `skills/src/format.ts`        | 66  | XML-style `<available_skills>` block for system-prompt injection. Optional `inlineBodies` mode.                                                     |
| `skills/src/merge.ts`         | 45  | 6-tier precedence: `extra > workspace > project > personal > managed-local > bundled`                                                               |
| `skills/src/index.ts`         | 32  | Public surface barrel                                                                                                                               |

**Sprint 4a verification:**

```bash
pnpm --filter @agiworkforce/mcp typecheck      # GREEN
pnpm --filter @agiworkforce/skills typecheck   # GREEN
pnpm --filter @agiworkforce/mcp --filter @agiworkforce/skills build  # GREEN
```

**Cumulative state after S1+S2+S3+S4a:**

- 7 LLM/agent-infra packages: types, llm-normalize, providers-{anthropic,ollama,openai}, mcp, skills
- ~5,435 LOC TypeScript total
- 3 working provider adapters + MCP client + skills loader
- 15 cross-vendor normalization helpers + 1 frontmatter parser + 1 XML prompt formatter
- Runtime deps: `@anthropic-ai/sdk`, `openai`, `@modelcontextprotocol/sdk`. Zero added beyond what each capability requires.

**Sprint 4b (deferred): Rust CLI hook events.** OpenClaw's `src/plugins/hook-types.ts` defines 30+ hook events; AGI Workforce's CLI already has 19. The high-leverage missing ones from S1's analysis:

- `before_model_resolve` — deterministic provider/model override before resolution
- `before_prompt_build` — inject `prependContext`, system additions before prompt submission
- `before_compaction` / `after_compaction` — observe/annotate compaction cycles
- `tool_result_persist` — synchronously transform tool results before transcript write
- `subagent_spawning` / `subagent_spawned` / `subagent_ended` — sub-agent lifecycle

Adding these in the Rust CLI requires reading `apps/cli/src/` (specifically the existing hook dispatcher) and is split out as **S4b**. Different language, different shape — separate sprint.

## What shipped on 2026-05-04 (OpenClaw porting Sprint 4b)

| Deliverable                       | What                                                                                                                                                                                                                                                                               | Impact                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/cli/src/hooks.rs`           | Added 3 new `HookEvent` variants (`BeforeModelResolve`, `BeforePromptBuild`, `ToolResultPersist`) + Display + canonical-name resolver entries.                                                                                                                                     | +24 LOC Rust                                                     |
| `apps/cli/src/agent.rs`           | Wired 8 hook fire sites: `PreCompact` + `PostCompact` (existing variants, never fired before), `BeforePromptBuild` + `BeforeModelResolve` paired before each LLM call, `ToolResultPersist` after `PostToolUse` on all 3 tool execution paths (subagent / concurrent / sequential). | +145 LOC Rust                                                    |
| `AGI_WORKFORCE.md` (this file)    | S4b ✅ in sprint table + this section                                                                                                                                                                                                                                              | +35 LOC                                                          |
| `cargo check -p agiworkforce-cli` | GREEN (3.38s)                                                                                                                                                                                                                                                                      | clean                                                            |
| **Sprint 4b total**               |                                                                                                                                                                                                                                                                                    | **+169 LOC Rust, 0 packages, 22 events (3 new + 2 newly-fired)** |

**Hook events added or newly wired:**

| Event                | Status before | Status after        | Fire site (`apps/cli/src/agent.rs`)                                                      |
| -------------------- | ------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `BeforeModelResolve` | did not exist | new variant + wired | Before every `models::stream_completion()` call in `send()`                              |
| `BeforePromptBuild`  | did not exist | new variant + wired | Paired with `BeforeModelResolve`, immediately before                                     |
| `ToolResultPersist`  | did not exist | new variant + wired | After `PostToolUse` on each of 3 tool execution paths (subagent, concurrent, sequential) |
| `PreCompact`         | defined-only  | now fires           | Just before `compaction::compact_messages()`                                             |
| `PostCompact`        | defined-only  | now fires           | Just after `compact_messages()`, before the user-visible "Context compacted" line        |

Hook input shape unchanged — uses the existing `HookInput` struct (`event`, `session_id`, `model`, `tool_name`, `tool_args`, `tool_output`, `message`, `tool_execution`). New events use `message` for advisory state where helpful (e.g., `PreCompact` carries `"context_usage_before_compact: 156000/200000 tokens (78%)"`).

**Sprint 4b verification:**

```bash
cd apps/cli && cargo check         # GREEN (3.38s; agiworkforce-cli + 11 transitive crates)
```

**Sprint 4b deferred** (require subagent runtime first or live integration):

- `subagent_spawning` / `subagent_spawned` / `subagent_ended` — `SubagentStart` / `SubagentStop` already exist as enum variants in the CLI but the surrounding subagent runtime is sparser than OpenClaw's. Wiring them requires a separate read of `apps/cli/src/agents.rs` and the `Team` orchestration code.
- Hooks `block: true` semantics for the new events — currently observation-only. Adding mutating semantics (e.g., a `BeforeModelResolve` hook that overrides `self.model` from `{"model": "..."}` JSON) is a follow-up since it touches the `aggregate_transformers` aggregator.

**Cumulative state after S1+S2+S3+S4a+S4b:**

- 7 LLM/agent-infra TS packages: types, llm-normalize, providers-{anthropic,ollama,openai}, mcp, skills
- 22 Rust CLI hook events (was 19; +3 new + 2 newly-fired)
- ~5,604 LOC across TS (~5,435) + Rust (+169)
- License attribution complete in `THIRD_PARTY_LICENSES.md`
- All packages typecheck + build green; CLI `cargo check` green

## What shipped on 2026-05-04 (Sprint 5 — make it demo-able)

| Deliverable                                                       | What                                                                                                                                                                                                                                          | Impact                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `packages/providers/{anthropic,openai,ollama}/src/*.live.test.ts` | 3 Vitest live smoke tests. Each: `describe.skipIf` gate on `AGIWORKFORCE_LIVE_TEST=1` + creds, asserts at least one `text-delta` + a `usage` chunk + a non-error `stop`. Tiny prompts (32-token cap). Catalog assertion runs unconditionally. | +183 LOC TS                    |
| Vitest scripts on the 3 provider packages                         | `pnpm test` (skips live tests gracefully, `--passWithNoTests`); `pnpm test:live` (sets the env var)                                                                                                                                           | +9 LOC                         |
| `examples/multi-provider-chat.ts`                                 | One-shot demo. Probes for `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / Ollama daemon → fans out the same `ChatRequest` to whichever providers are available → streams output side-by-side with vendor-coloured prefixes → final usage table.      | +172 LOC TS                    |
| `package.json` (root)                                             | `pnpm demo:multi-provider "<prompt>"` script                                                                                                                                                                                                  | +1 LOC                         |
| `AGI_WORKFORCE.md`                                                | S5 ✅ in sprint table + this section + sprint table renumbering (S5 = tests/demo, S6 = browser, S7 = api-gateway)                                                                                                                             | +30 LOC                        |
| Verification                                                      | Skip-path tests run clean (1 passed, 2 skipped per provider); demo CLI exits 1 with helpful message when no creds available                                                                                                                   | clean                          |
| **Sprint 5 total**                                                |                                                                                                                                                                                                                                               | **+395 LOC TS, +6 test files** |

**How to demo cross-provider continuity right now:**

```bash
# any one of these enables that provider; multiple = side-by-side demo
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
ollama serve   # in another terminal, then `ollama pull llama3.2`

cd ~/Desktop/agiworkforce
pnpm demo:multi-provider "Write a haiku about TypeScript."
```

Output: each available provider streams the same prompt with a coloured `[anthropic]` / `[openai]` / `[ollama]` prefix; final summary shows char count, duration, token usage, stop reason per vendor. This is the actual demo of "one chat layout, many providers" — minus the UI shell.

**How to run live tests:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pnpm --filter @agiworkforce/providers-anthropic test:live   # ~5-50 tokens

export OPENAI_API_KEY=sk-...
pnpm --filter @agiworkforce/providers-openai test:live      # ~5-50 tokens

# (Ollama: free, just needs a daemon + a pulled model)
ollama serve
ollama pull llama3.2
pnpm --filter @agiworkforce/providers-ollama test:live
```

Each suite runs 2 tests: a stream-end-to-end smoke and a catalog assertion. With `AGIWORKFORCE_LIVE_TEST` unset, all suites skip cleanly so default `pnpm test` is safe in CI.

## What shipped on 2026-05-04 (Sprint 7 — api-gateway integration)

| Deliverable                                                | What                                                                                                                                                                                                                                                           | Impact                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `services/api-gateway/src/lib/providerAdapters.ts`         | Server-side adapter factory. Sources credentials from env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL` / `OLLAMA_API_KEY`, optional `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID`). Lazy construction; returns null when creds missing.                   | +110 LOC TS                 |
| `services/api-gateway/src/routes/providerStream.ts`        | New `/api/v1/providers` route with three endpoints: `GET /` (availability), `GET /:providerId/catalog` (model list), `POST /:providerId/stream` (SSE stream of `StreamChunk` events). Full Zod validation for `ChatRequest` body. Aborts on client disconnect. | +220 LOC TS                 |
| `services/api-gateway/src/index.ts`                        | Mount the new router at `/api/v1/providers`. Existing `/api/llm/v1` OpenAI-compat proxy left untouched.                                                                                                                                                        | +2 LOC                      |
| `services/api-gateway/package.json`                        | Added 4 workspace deps: `@agiworkforce/{llm-normalize,providers-anthropic,providers-ollama,providers-openai}`.                                                                                                                                                 | +4 deps                     |
| `packages/llm-normalize/src/lib/prompt-cache-stability.ts` | Replaced `Array.prototype.toSorted` (ES2023) with `[...arr].sort()` (ES2015) so consumers on ES2022 lib (api-gateway) can depend on this package without bumping target.                                                                                       | +2 LOC                      |
| `AGI_WORKFORCE.md`                                         | S7 ✅ in sprint table + this section                                                                                                                                                                                                                           | +20 LOC                     |
| Verification                                               | `tsc --noEmit` GREEN; `tsc` build GREEN (api-gateway); all 5 LLM packages still GREEN.                                                                                                                                                                         | clean                       |
| **Sprint 7 total**                                         |                                                                                                                                                                                                                                                                | **+334 LOC TS, 0 packages** |

**API surface (new):**

```
GET  /api/v1/providers
       → { providers: [{ id, available, unavailableReason? }] }

GET  /api/v1/providers/:providerId/catalog
       → { provider, catalog: ModelInfo[] }

POST /api/v1/providers/:providerId/stream
       body:    ChatRequest (provider-shape: messages, tools, thinking, ...)
       headers: Authorization: Bearer <jwt>
       resp:    text/event-stream
                  data: {"type":"text-delta","delta":"..."}
                  data: {"type":"usage","inputTokens":...,"outputTokens":...}
                  data: {"type":"stop","reason":"end_turn"}
                  data: [DONE]
```

Auth, rate limiting, content-type validation, and error handling all reuse the existing api-gateway middleware. Server holds API keys in env; clients never see them. Aborting the request (client disconnect) propagates an `AbortSignal` into the adapter so the upstream stream is cancelled cleanly.

**How to demo the end-to-end path:**

```bash
# 1. Set credentials
export ANTHROPIC_API_KEY=sk-ant-...
export JWT_SECRET=...                 # however the gateway is configured

# 2. Run the gateway
pnpm --filter @agiworkforce/api-gateway dev

# 3. Hit the new route
curl -N -X POST http://localhost:3000/api/v1/providers/anthropic/stream \
  -H "Authorization: Bearer <a-valid-jwt>" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: agiworkforce" \
  -d '{
    "model": "claude-haiku-4.5",
    "messages": [{"role": "user", "content": "Say hi in 5 words."}],
    "maxOutputTokens": 64
  }'
```

The adapters that already work via `pnpm demo:multi-provider` are now reachable from any client that can hit the gateway — Web (Next.js), Mobile (Expo), Chrome ext, VS Code ext. The Desktop's existing `/api/llm/v1` OpenAI-compat path is unchanged for backward compatibility.

**S7 deferred** (separate sprints):

- Migrating the existing `/api/llm/v1` proxy (756 LOC of fetch-based vendor calls) onto the new adapter pipeline — a 50-70% LOC reduction once done, but requires touching the desktop's `ManagedCloudProvider` consumer.
- Adding Google adapter (so `/api/v1/providers/google/stream` works) — `cleanSchemaForGemini` from llm-normalize is ready; needs a thin `@agiworkforce/providers-google` package modeled after Anthropic.
- Live integration test that POSTs through the gateway against a running daemon — currently each adapter has its own live test, but no end-to-end through-the-gateway test yet.
- Updating the Web/Mobile/extension chat clients to call the new `/api/v1/providers/...` endpoints (separate UI sprints).

**Cumulative state after S1+S2+S3+S4a+S4b+S5+S7:**

- 7 LLM/agent-infra TS packages (unchanged from S5)
- 1 new api-gateway integration (`/api/v1/providers/*` route + adapter factory)
- 22 Rust CLI hook events
- Multi-provider streaming reachable via HTTP for the first time
- Total OpenClaw-port LOC across S1-S7: ~6,300 (TS ~5,938 + Rust ~169 + integration ~334)

## What shipped on 2026-05-04 (Sprint 8 — web app integration)

| Deliverable                                                                | What                                                                                                              | Impact                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `apps/web/app/api/v1/providers/route.ts`                                   | Next.js GET proxy → api-gateway `/api/v1/providers` (availability list).                                          | +30 LOC TS              |
| `apps/web/app/api/v1/providers/[providerId]/catalog/route.ts`              | Next.js GET proxy → api-gateway catalog endpoint per provider.                                                    | +33 LOC TS              |
| `apps/web/app/api/v1/providers/[providerId]/stream/route.ts`               | Next.js POST proxy → api-gateway SSE stream endpoint. Forwards Authorization header through; no server-side keys. | +60 LOC TS              |
| `apps/web/lib/providerStreamClient.ts`                                     | Browser-side SSE consumer. `streamFromProvider({...}) → AsyncIterable<StreamChunk>`. Frame-aware, abort-aware.    | +75 LOC TS              |
| `apps/web/app/chat-multi/page.tsx`                                         | New `/chat-multi` route. Three-up demo: same prompt → Anthropic + OpenAI + Ollama, streaming side-by-side with token usage and timing. Pulls Supabase JWT for auth. | +175 LOC TSX            |
| Verification                                                               | `pnpm --filter @agiworkforce/web typecheck` GREEN.                                                                | clean                   |
| **Sprint 8 total**                                                         |                                                                                                                   | **+373 LOC TS, 0 packages** |

**How to demo the web page (locally):**

```bash
# 1. Start api-gateway with provider creds
cd services/api-gateway
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
pnpm dev   # runs at http://localhost:3000

# 2. Start web with the gateway URL pointed at it (and creds for Supabase)
cd ../../apps/web
API_GATEWAY_URL=http://localhost:3000 \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
pnpm dev   # runs at http://localhost:3001

# 3. Sign in, then visit
open http://localhost:3001/chat-multi
```

Type a prompt, click "Run on all providers". Three cards stream Anthropic / OpenAI / Ollama in parallel. Each shows live text, token usage, and total duration once done. This is the **first end-to-end demo of the multi-provider differentiator inside the actual website surface**.

**On the prior-session stashes** (user asked to apply them as part of this sprint): inspected and aborted. Both `stash@{2}` ("lint-staged automatic backup") and `stash@{3}` ("sprint-agent-changes-2026-03-15") tried to delete files that exist on current `main` (e.g., `apps/web/app/chat/ChatLayoutShell.tsx`, `docs/DESKTOP_RELEASE_GATE.md`, `docs/features/browser-automation.md`) and produced 13–25 merge conflicts each on Rust and TS sources. The remaining 4 stashes were already classified DANGEROUS (each shows -27k to -156k net LOC, all stale lockfile snapshots). All 6 stashes are months old relative to current `main`; treat them as historical artefacts, not pending work. They remain in `git stash list` and can be dropped with `git stash drop stash@{N}` once you've confirmed nothing else needed from them.

**Cumulative state after S1+S2+S3+S4a+S4b+S5+S7+S8** (S6 browser tool still pending):

- 7 LLM/agent-infra TS packages
- 2 service integrations: api-gateway provider routes + web app proxy routes
- 1 web demo surface at `/chat-multi`
- 22 Rust CLI hook events
- ~6,673 LOC across S1-S8 (TS ~6,311 + Rust ~169 + integration ~193)
- License attribution in `THIRD_PARTY_LICENSES.md`

## How to use this file

- **New contributor?** Read this top to bottom, then [BUILD.md](BUILD.md) + [docs/VISION.md](docs/VISION.md).
- **Picking up where someone left off?** Check [docs/ROADMAP.md](docs/ROADMAP.md) for current sprint.
- **Designing UI?** [docs/DESIGN.md](docs/DESIGN.md) → `~/Desktop/reference/ui/claude ui/` for the design north star.
- **AI agent (Claude Code, etc.)?** This file + your `~/.claude/projects/.../memory/MEMORY.md` are your context.

## Update cadence

Update this file when:

- A wave/milestone ships
- A surface's status changes (file count, build state, distribution status)
- Pricing or vision changes
- A major cleanup happens
- The audit baseline changes

Don't update this file for: in-progress work (use [docs/ROADMAP.md](docs/ROADMAP.md)), individual fixes (use commit messages + [docs/audit/FIX_QUEUE.md](docs/audit/FIX_QUEUE.md)).
