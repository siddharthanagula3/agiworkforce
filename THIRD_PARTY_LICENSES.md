# Third-Party Licenses

This file documents source code in this proprietary repository that was
ported from third-party open-source projects, along with the upstream license
that travels with that code.

## OpenClaw

- **Upstream**: [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **License**: MIT
- **Copyright**: © 2025 Peter Steinberger
- **Imported into**: `packages/ai/provider-protocol/src/`
- **Files derived from OpenClaw**:
  - `packages/ai/provider-protocol/src/openai-responses-payload-policy.ts`
    ← `src/agents/openai-responses-payload-policy.ts`
  - `packages/ai/provider-protocol/src/openai-reasoning-effort.ts`
    ← `src/agents/openai-reasoning-effort.ts`
  - `packages/ai/provider-protocol/src/system-prompt-cache-boundary.ts`
    ← `src/agents/system-prompt-cache-boundary.ts`
  - `packages/ai/provider-protocol/src/anthropic-payload-policy.ts`
    ← `src/agents/anthropic-payload-policy.ts` (Sprint 2)
  - `packages/ai/provider-protocol/src/openai-completions-compat.ts`
    ← `src/agents/openai-completions-compat.ts` (Sprint 2)
  - `packages/ai/provider-protocol/src/provider-attribution.ts`
    ← simplified port of `src/agents/provider-attribution.ts` (Sprint 2 — stripped plugin-manifest scanning, kept pure capability resolution)
  - `packages/ai/provider-protocol/src/lib/prompt-cache-stability.ts`
    ← `src/agents/prompt-cache-stability.ts`
  - `packages/ai/provider-protocol/src/lib/string-utils.ts`
    ← subset of `src/shared/string-coerce.ts`
  - `packages/ai/provider-protocol/src/openai-tool-schema.ts`
    ← `src/agents/openai-tool-schema.ts` (Sprint 3 — drops the strict-tool-setting re-export which depends on provider-attribution-via-plugin-runtime)
  - `packages/ai/provider-protocol/src/tool-parameter-schema.ts`
    ← simplified port of `src/agents/pi-tools-parameter-schema.ts` (Sprint 3 — replaces ModelCompatConfig sourcing with explicit `unsupportedKeywords` arg)
  - `packages/ai/provider-protocol/src/lib/clean-for-gemini.ts`
    ← `src/agents/schema/clean-for-gemini.ts` (Sprint 3 — TypeBox return type replaced with `unknown`)
  - `packages/contracts/types/src/provider-adapter.ts`
    ← interface shape adapted from `packages/plugin-sdk/src/provider-entry.ts` (`ProviderPlugin` type) (Sprint 2)
  - `packages/tools/mcp/src/types.ts`
    ← shape mirrors `src/config/types.mcp.ts` and `src/agents/pi-bundle-mcp-types.ts` (Sprint 4a — code is freshly written, only the config/catalog shapes are aligned for ecosystem compat; not a literal port)
  - `packages/tools/skills/src/types.ts`, `loader.ts`, `merge.ts`, `format.ts`
    ← skill format and precedence rules mirror OpenClaw's `src/agents/skills/*` (Sprint 4a — code is freshly written; the markdown+YAML-frontmatter file format and the 6-tier precedence order are the ecosystem-compatibility surface, not OpenClaw-licensed material)
  - `packages/ai/provider-protocol/src/anthropic-tool-payload-compat.ts`
    ← `src/agents/pi-embedded-runner/anthropic-family-tool-payload-compat.ts` (Tier-1D — generic `StreamFn` type replaces the `@mariozechner/pi-agent-core` dependency so adapters don't need to inherit pi-agent-core types)
  - `packages/tools/apply-patch/src/parse.ts`, `apply-update.ts`, `types.ts`, `index.ts`
    ← `src/agents/apply-patch.ts` + `apply-patch-update.ts` (deferred-completion pass — minimal `FSBridge` interface (5 methods: readFile/writeFile/remove/mkdirp/exists) replaces OpenClaw's sandbox-aware `SandboxFsBridge` + `boundary-file-read` + `fs-safe` stack; default `nodeFSBridge()` provided for real disk)
- **Adaptations**:
  - Stripped OpenClaw plugin-sdk imports; helpers are pure functions
  - Renamed boundary marker constant (`OPENCLAW_CACHE_BOUNDARY` → `AGIWORKFORCE_CACHE_BOUNDARY`)
  - Adjusted import paths to the new package layout
  - Adopted single-quote / TS strict-mode style consistent with this repo

### MIT License (OpenClaw)

```
MIT License

Copyright (c) 2025 Peter Steinberger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## SkillSpector

- **Upstream**: [NVIDIA/skillspector](https://github.com/NVIDIA/skillspector)
- **License**: Apache-2.0
- **Copyright**: © NVIDIA Corporation
- **Imported into**: `tools/skill-vetting/`
- **Adoption**: Vendored the runnable scanner package (`src/skillspector/**`, 57 modules + YARA rules) plus `pyproject.toml`. Upstream `LICENSE` and `THIRD_PARTY_NOTICES.md` are preserved verbatim at `tools/skill-vetting/LICENSE` and `tools/skill-vetting/THIRD_PARTY_NOTICES.md`.
- **Local changes**: trimmed upstream `tests/`, `docs/`, `Dockerfile`, `extensions/`, `uv.lock` (kept only the two sample fixtures under `samples/`); added our `README.md` and `verify.sh`; rewrote `model_registry.yaml` to AGI catalog model IDs sourced from `packages/contracts/types/src/models.json`. No upstream source files were modified.

## PptxGenJS

- **Upstream**: [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS)
- **License**: MIT
- **Copyright**: Copyright (c) 2015-2022 Brent Ely
- **Used by**: `apps/web/lib/services/managed-office-file-service.ts`
- **Adoption**: Runtime dependency only; no upstream source was copied or adapted into this repository. The package generates editable Managed Cloud `.pptx` files on the server.
- **Notice**: The complete MIT license is distributed in the installed `pptxgenjs` package.

## OpenDyslexic

- **Upstream**: [antijingoist/opendyslexic](https://github.com/antijingoist/opendyslexic) (https://opendyslexic.org), release `v0.91.12`
- **License**: OFL-1.1
- **Copyright**: © 2012–2019 Abbie Gonzalez (https://abbiecod.es), with Reserved Font Name OpenDyslexic
- **Used by**: `apps/web/public/fonts/opendyslexic/` — self-hosted binaries backing the "Dyslexic friendly" chat font option, wired via `@font-face` in `apps/web/app/globals.css`
- **Adoption**: Runtime font asset only; no source code was ported. Regular, Bold, Italic, and Bold-Italic styles (`.woff2` + `.woff`) are taken unmodified from the upstream GitHub release. Full OFL license text is preserved verbatim at `apps/web/public/fonts/opendyslexic/OFL.txt`.

## models.dev

- **Upstream**: [anomalyco/models.dev](https://github.com/anomalyco/models.dev) (https://models.dev) — the `sst/models.dev` URL now redirects here; the default branch is `dev`, not `main`
- **License**: MIT
- **Copyright**: © 2025 models.dev, maintained by the SST maintainers
- **Used by**: `packages/ai/model-registry/scripts/compile.mjs` — `MODELS_DEV_URL` (https://models.dev/api.json) is fetched at runtime by `pnpm sync:models:refresh` and its values are recorded in `packages/ai/model-registry/catalog/models.synced.json`, whose `source` field names this feed
- **Adoption**: Recurring data sync, not a code port. No upstream source file is copied or adapted, and the feed is never vendored — each refresh re-fetches it and holds any field that moves more than the delta threshold for human review.
- **Notice**: The repository carries a single root MIT `LICENSE` with no directory carve-out, so it covers the `models/` and `providers/` TOML files that generate `api.json`. Neither the site nor the README nor the `api.json` response states any data-specific licence or attribution requirement distinct from that MIT grant, so the position that MIT reaches the data is an inference from the absence of a carve-out rather than a stated term. Do not confuse the dataset licence with the per-model `license` field inside the feed, which records the licence of the AI model being described.

## litellm (model price cross-check)

- **Upstream**: [BerriAI/litellm](https://github.com/BerriAI/litellm) — specifically `model_prices_and_context_window.json` at the repository root
- **License**: MIT
- **Copyright**: © 2023 Berri AI
- **Used by**: `packages/ai/model-registry/scripts/pricing-drift.mjs` — `LITELLM_URL` fetches the file at runtime for `pnpm check:pricing-drift`
- **Adoption**: Advisory cross-check data only. The file is fetched at runtime and never vendored, no upstream source code is ported, and nothing it reports is written to the catalog — a drift row is an instruction to open the provider's own pricing page and decide there.
- **Notice**: litellm is split-licensed. Its root `LICENSE` reads "All content that resides under the `enterprise/` directory of this repository, if that directory exists, is licensed under the license defined in `enterprise/LICENSE`" and "Content outside of the above mentioned directories or restrictions above is available under the MIT license". `enterprise/` is a separate commercial licence (© 2024–present Berrie AI Inc.) that forbids distribution and sublicensing, and nothing from it is used here: `model_prices_and_context_window.json` sits at the repository root, outside that subtree, under the MIT grant. Because of the split, GitHub's licence detector reports the repository as `NOASSERTION`; the MIT classification above applies to the specific file consumed, not to the repository as a whole.

## Porting policy

`scripts/check-licenses.mjs` (run via `pnpm check:licenses`) enforces this file:
every `## Heading` that declares a `**License**:` line is validated against the
allowed-license set, and its `**Upstream**:` is checked against the study-only
denylist. Add a port block here before merging any adapted third-party code.

### Approved donor repositories (porting allowlist)

| Repository   | License           | Use                                                 |
| ------------ | ----------------- | --------------------------------------------------- |
| codex-rs     | Apache-2.0        | Runtime: tool trait, compaction, exec-policy wiring |
| continue     | Apache-2.0        | VS Code surface: IDE host, autocomplete, lazy-apply |
| opencode     | MIT               | Agent patterns                                      |
| odysseus     | MIT               | Workspace patterns (provider detect, tool parsing)  |
| SkillSpector | Apache-2.0        | Skill/plugin/MCP pre-install vetting                |
| gemini-cli   | Apache-2.0        | Compaction prompt, sandbox profiles                 |
| supermemory  | MIT (schema only) | Memory data model                                   |
| LMCache      | Apache-2.0        | Managed-cloud KV-cache (service)                    |
| liteparse    | Apache-2.0        | On-device document parsing                          |
| VoxCPM       | Apache-2.0        | Text-to-speech                                      |
| supervision  | MIT               | Vision utilities (pair with a permissive VLM)       |

### Runtime-fetched data sources (never ported, never vendored)

These are data feeds, not donor code. Nothing is copied into the tree: each is
fetched over the network at run time by the script named below, so the porting
allowlist above does not apply to them and no source file is derived from them.

| Source                                           | License | Fetched by                                             | Use                                            |
| ------------------------------------------------ | ------- | ------------------------------------------------------ | ---------------------------------------------- |
| models.dev (`api.json`)                          | MIT     | `packages/ai/model-registry/scripts/compile.mjs`       | Recurring pricing/limits sync into the catalog |
| litellm (`model_prices_and_context_window.json`) | MIT     | `packages/ai/model-registry/scripts/pricing-drift.mjs` | Advisory pricing cross-check; writes nothing   |

### Study-only / forbidden (never ported)

| Source                | Reason                                                       |
| --------------------- | ------------------------------------------------------------ |
| claude-code           | Anthropic proprietary — no license                           |
| crush                 | FSL-1.1 — competing-use ban                                  |
| auto-code-rover       | SONAR source-available — competing-use                       |
| Devon                 | AGPL-3.0 — copyleft                                          |
| Ultralytics YOLO      | AGPL-3.0 — use a permissive detector                         |
| init, chat-template   | No license — all rights reserved                             |
| litellm `enterprise/` | Commercial licence — distribution and sublicensing forbidden |
