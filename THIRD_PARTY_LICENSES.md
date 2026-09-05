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

## Leaflet

- **Upstream**: [Leaflet/Leaflet](https://github.com/Leaflet/Leaflet), release `1.9.4`
- **License**: BSD-2-Clause
- **Copyright**: Copyright (c) 2010-2024, Volodymyr Agafonkin; Copyright (c) 2010-2011, CloudMade
- **Used by**: `apps/web/features/chat/components/messages/cards/map/LeafletMapCanvas.tsx` and its stylesheet import
- **Adoption**: Runtime dependency only; no upstream source was copied or adapted into this repository. It draws the interactive map inside a chat transcript. The tile endpoint it reads is repository configuration, not a Leaflet default: no vendor host is compiled into the component.
- **Notice**: The complete BSD-2-Clause license is distributed in the installed `leaflet` package.

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

## Anthropic frontend-design skill

- **Upstream**: [anthropics/skills](https://github.com/anthropics/skills) @ `41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f` (`skills/frontend-design`)
- **License**: Apache-2.0
- **Copyright**: © 2026 Anthropic, PBC.
- **Imported into**: `.agents/skills/frontend-design/`
- **Adoption**: Vendored the skill directory as published (`SKILL.md` plus its per-skill `LICENSE.txt`). A top-level `version` frontmatter field (the fetched commit sha) was added because it was absent upstream and this repository's skill loader contract expects one; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## taste-skill

- **Upstream**: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) @ `ccbc15639c97057cbfcf32ecebc38ef716e4bb37` (`skills/taste-skill`, `skills/redesign-skill`)
- **License**: MIT
- **Copyright**: © 2026 Leonxlnx
- **Imported into**: `.agents/skills/design-taste-frontend/` (from `skills/taste-skill`, frontmatter name `design-taste-frontend`), `.agents/skills/redesign-existing-projects/` (from `skills/redesign-skill`, frontmatter name `redesign-existing-projects`)
- **Adoption**: Vendored both skill directories as published. Each directory is named for the skill's own frontmatter `name` field rather than its upstream folder name, matching this repository's convention of directory-name-as-skill-id. A top-level `version` frontmatter field (the fetched commit sha) was added to each; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## anti-slop

- **Upstream**: [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) @ `dd43e13ff9b4c92222461df30270514278d5b70b` (`skills/antislop`, `skills/antislop-copywriting`, `skills/antislop-layoutmobile`, `skills/antislop-code`, `skills/antislop-ui`, `skills/antislop-human`)
- **License**: MIT
- **Copyright**: © 2026 Miqdad Badjuber
- **Imported into**: `.agents/skills/antislop/`, `.agents/skills/antislop-copywriting/`, `.agents/skills/antislop-layoutmobile/`, `.agents/skills/antislop-code/`, `.agents/skills/antislop-ui/`, `.agents/skills/antislop-human/`
- **Adoption**: Vendored all six skill directories as published. Each expects a project `DESIGN.md`; this repository provides one through the first-party `agiworkforce-design` skill. A top-level `version` frontmatter field (the fetched commit sha) was added to each; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## agent-skills (Vercel Labs)

- **Upstream**: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) @ `063bee94c3f4df8453406c830b0a7df0f2860278` (`skills/web-design-guidelines`, `skills/react-best-practices`, `skills/composition-patterns`)
- **License**: MIT
- **Copyright**: Not stated in the fetched commit; the repository carries no `LICENSE`, `NOTICE`, or copyright header anywhere in `package.json`, `README.md`, or `AGENTS.md`. Attributed here to Vercel Labs as the publishing organization named in the repository path.
- **Imported into**: `.agents/skills/web-design-guidelines/`, `.agents/skills/vercel-react-best-practices/` (from `skills/react-best-practices`), `.agents/skills/vercel-composition-patterns/` (from `skills/composition-patterns`)
- **Notice**: The fetched commit carries no root `LICENSE` file; the license is the repository's explicit grant stated in its `README.md` ("## License" → "MIT") and in the `license: MIT` frontmatter field of two of the three vendored `SKILL.md` files.
- **Adoption**: Vendored the three skill directories as published, named for each skill's own frontmatter `name` field. A top-level `version` frontmatter field was added to each (`"1.0.0"`, matching the value each file already carried under a nested `metadata.version` key that this repository's minimal frontmatter parser does not read); the `composition-patterns` skill's folded multi-line `description:` block was reflowed to a single line because that parser does not support folded YAML scalars, with no wording changed. No other frontmatter or body text was changed. Locked in `skills-lock.json`.

## extract-design-system

- **Upstream**: [arvindrk/extract-design-system](https://github.com/arvindrk/extract-design-system) @ `1873741ba8dea755e35e6e15134f7918cd58e036` (`skills/extract-design-system`)
- **License**: MIT
- **Copyright**: © 2026 Arvind
- **Imported into**: `.agents/skills/extract-design-system/`
- **Adoption**: Vendored the skill directory as published; the repository's standalone CLI was not vendored. A top-level `version` frontmatter field (the fetched commit sha) was added because it was absent upstream; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## Emil Kowalski design skills

- **Upstream**: [emilkowalski/skills](https://github.com/emilkowalski/skills) @ `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7` (`skills/emil-design-eng`, `skills/review-animations`, `skills/find-animation-opportunities`, `skills/apple-design`, `skills/pick-ui-library`)
- **License**: MIT
- **Copyright**: © 2026 Emil Kowalski
- **Imported into**: `.agents/skills/emil-design-eng/`, `.agents/skills/review-animations/`, `.agents/skills/find-animation-opportunities/`, `.agents/skills/apple-design/`, `.agents/skills/pick-ui-library/`
- **Adoption**: Vendored five of the six skill directories as published; skills/improve-animations was dropped on 2026-09-05 because the skill supply-chain vetter rates its body, which quotes an injection phrase as an example, as not installable. A top-level `version` frontmatter field (the fetched commit sha) was added to each; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## Microsoft frontend-design-review skill

- **Upstream**: [microsoft/skills](https://github.com/microsoft/skills) @ `02e0b2f852b39ea00c43283f999b83fc12079273` (`.github/skills/frontend-design-review`)
- **License**: MIT
- **Copyright**: © Microsoft Corporation.
- **Imported into**: `.agents/skills/ms-frontend-design-review/`
- **Adoption**: Vendored the skill directory as published, under the directory name `ms-frontend-design-review` because this repository already has a first-party `frontend-design-review` skill; the frontmatter `name` field was changed from `frontend-design-review` to `ms-frontend-design-review` to match. A top-level `version` frontmatter field (the fetched commit sha) was added because it was absent upstream. The folded `description:` and literal `acknowledgments:` block-scalar frontmatter values were each reflowed to a single line because this repository's minimal frontmatter parser does not support folded or literal YAML block scalars; wording was not changed. No other frontmatter or body text was changed. Locked in `skills-lock.json`.

## Marketing Skills (Corey Haines)

- **Upstream**: [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) @ `5b2c0007766c6a1cf1d53fd8fc73e979e0821022` (`skills/ab-testing`, `skills/ads`, `skills/ai-seo`, `skills/analytics`, `skills/aso`, `skills/attribution`, `skills/churn-prevention`, `skills/co-marketing`, `skills/cold-email`, `skills/community-marketing`, `skills/competitor-profiling`, `skills/competitors`, `skills/content-strategy`, `skills/copy-editing`, `skills/copywriting`, `skills/cro`, `skills/customer-research`, `skills/directory-submissions`, `skills/emails`, `skills/events`, `skills/free-tools`, `skills/image`, `skills/influencer-marketing`, `skills/launch`, `skills/lead-magnets`, `skills/marketing-council`, `skills/marketing-ideas`, `skills/marketing-loops`, `skills/marketing-plan`, `skills/marketing-psychology`, `skills/offers`, `skills/onboarding`, `skills/paywalls`, `skills/popups`, `skills/pricing`, `skills/product-marketing`, `skills/programmatic-seo`, `skills/prospecting`, `skills/public-relations`, `skills/referrals`, `skills/revops`, `skills/sales-enablement`, `skills/schema`, `skills/seo-audit`, `skills/signup`, `skills/site-architecture`, `skills/sms`, `skills/social`, `skills/video`)
- **License**: MIT
- **Copyright**: © 2025 Corey Haines
- **Imported into**: `.agents/skills/<name>/` for each of the 50 skill directories listed above, unchanged from their upstream directory name (no collision with an existing skill)
- **Adoption**: Vendored 49 of the 50 skill directories as published (`skills/ad-creative` was dropped: the supply-chain vetter rejects its reference files, which carry shell download commands against third-party generation APIs), marked `audience: product` in `skills-lock.json` because each is a marketing task an end user of this product would ask for (positioning, copywriting, SEO, email sequences, landing pages, launch plans, pricing pages, ads, analytics, and related growth work), so the vendored bundle reaches the in-product Skills catalog rather than staying repository-only tooling. Every `SKILL.md` already carried a real per-skill semantic version under a nested `metadata.version` key that this repository's minimal frontmatter parser does not read; a top-level `version` frontmatter field was added to each, set to that same existing value (matching the `agent-skills` (Vercel Labs) precedent above) rather than the fetched commit sha, so the lock file's `declaredVersion` reflects the skill's own release history instead of one shared repository-wide value. No other frontmatter or body text was changed; every vendored file was run through this repository's own `prettier --write` before hashing so the lock's `computedHash` matches what `lint-staged` produces at commit time, and the tables and code fences prettier reformatted carry no wording changes. Each skill also ships an upstream `evals/` directory (static prompt/expected-output JSON fixtures, not executable) and some ship `references/` markdown and, for `directory-submissions`, one static template file (`references/submission-tracker-template.csv`); both were vendored as published. Every `SKILL.md` and reference file across the 49 vendored skills was checked for shell/download instructions and for prompt-injection example phrasing before vendoring; none were found; one file (`skills/ads/references/audit-guardrails.md`) explicitly warns the agent to treat fetched pages as data and never follow embedded directives, which is a defensive pattern and not an instruction to exclude. Skills reference a `tools/` integrations registry from the upstream repository root (for example `../../tools/integrations/ga4.md`) that was not vendored because it is outside `skills/`; those relative links do not resolve inside this repository, matching how other vendored skill bundles' repository-root cross-references are left unresolved rather than rewritten. Locked in `skills-lock.json`.

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
