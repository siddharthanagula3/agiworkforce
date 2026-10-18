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
  - `packages/tools/skills/src/types.ts`, `loader.ts`, `merge.ts`
    ← skill format and precedence rules mirror OpenClaw's `src/agents/skills/*` (Sprint 4a — code is freshly written; the markdown+YAML-frontmatter file format and the 6-tier precedence order are the ecosystem-compatibility surface, not OpenClaw-licensed material)
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

- **Upstream**: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) @ `063bee94c3f4df8453406c830b0a7df0f2860278` (`skills/web-design-guidelines`, `skills/react-best-practices`, `skills/composition-patterns`, `skills/react-native-skills`)
- **License**: MIT
- **Copyright**: Not stated in the fetched commit; the repository carries no `LICENSE`, `NOTICE`, or copyright header anywhere in `package.json`, `README.md`, or `AGENTS.md`. Attributed here to Vercel Labs as the publishing organization named in the repository path.
- **Imported into**: `.agents/skills/web-design-guidelines/`, `.agents/skills/vercel-react-best-practices/` (from `skills/react-best-practices`), `.agents/skills/vercel-composition-patterns/` (from `skills/composition-patterns`), `.agents/skills/vercel-react-native-skills/` (from `skills/react-native-skills`, added 2026-10-13)
- **Notice**: The fetched commit carries no root `LICENSE` file; the license is the repository's explicit grant stated in its `README.md` ("## License" → "MIT") and in the `license: MIT` frontmatter field of three of the four vendored `SKILL.md` files.
- **Adoption**: Vendored the four skill directories as published, named for each skill's own frontmatter `name` field. A top-level `version` frontmatter field was added to each (`"1.0.0"`, matching the value each file already carried under a nested `metadata.version` key that this repository's minimal frontmatter parser does not read); the folded multi-line `description:` blocks of the `composition-patterns` and `react-native-skills` skills were reflowed to a single line because that parser does not support folded YAML scalars, with no wording changed. No other frontmatter or body text was changed. Locked in `skills-lock.json`.

## extract-design-system

- **Upstream**: [arvindrk/extract-design-system](https://github.com/arvindrk/extract-design-system) @ `1873741ba8dea755e35e6e15134f7918cd58e036` (`skills/extract-design-system`)
- **License**: MIT
- **Copyright**: © 2026 Arvind
- **Imported into**: `.agents/skills/extract-design-system/`
- **Adoption**: Vendored the skill directory as published; the repository's standalone CLI was not vendored. A top-level `version` frontmatter field (the fetched commit sha) was added because it was absent upstream; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## Emil Kowalski design skills

- **Upstream**: [emilkowalski/skills](https://github.com/emilkowalski/skills) @ `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7` (`skills/emil-design-eng`, `skills/review-animations`)
- **License**: MIT
- **Copyright**: © 2026 Emil Kowalski
- **Imported into**: `.agents/skills/emil-design-eng/`, `.agents/skills/review-animations/`
- **Adoption**: Vendored two of the six skill directories as published. skills/improve-animations was dropped on 2026-09-05 because the skill supply-chain vetter rates its body, which quotes an injection phrase as an example, as not installable. skills/find-animation-opportunities, skills/apple-design and skills/pick-ui-library were removed on 2026-10-13 because the `agiworkforce-design` pipeline names none of them. A top-level `version` frontmatter field (the fetched commit sha) was added to each; no other frontmatter or body text was changed. Locked in `skills-lock.json`.

## Microsoft frontend-design-review skill

- **Upstream**: [microsoft/skills](https://github.com/microsoft/skills) @ `02e0b2f852b39ea00c43283f999b83fc12079273` (`.github/skills/frontend-design-review`)
- **License**: MIT
- **Copyright**: © Microsoft Corporation.
- **Imported into**: `.agents/skills/ms-frontend-design-review/`
- **Adoption**: Vendored the skill directory as published, under the directory name `ms-frontend-design-review` because this repository already has a first-party `frontend-design-review` skill; the frontmatter `name` field was changed from `frontend-design-review` to `ms-frontend-design-review` to match. A top-level `version` frontmatter field (the fetched commit sha) was added because it was absent upstream. The folded `description:` and literal `acknowledgments:` block-scalar frontmatter values were each reflowed to a single line because this repository's minimal frontmatter parser does not support folded or literal YAML block scalars; wording was not changed. No other frontmatter or body text was changed. Locked in `skills-lock.json`.

## Marketing Skills (Corey Haines)

- **Upstream**: [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) @ `5b2c0007766c6a1cf1d53fd8fc73e979e0821022` (`skills/ab-testing`, `skills/ads`, `skills/ai-seo`, `skills/analytics`, `skills/aso`, `skills/attribution`, `skills/churn-prevention`, `skills/cold-email`, `skills/community-marketing`, `skills/competitor-profiling`, `skills/competitors`, `skills/content-strategy`, `skills/copy-editing`, `skills/copywriting`, `skills/cro`, `skills/customer-research`, `skills/emails`, `skills/free-tools`, `skills/influencer-marketing`, `skills/launch`, `skills/lead-magnets`, `skills/marketing-ideas`, `skills/marketing-loops`, `skills/marketing-plan`, `skills/marketing-psychology`, `skills/offers`, `skills/onboarding`, `skills/paywalls`, `skills/popups`, `skills/pricing`, `skills/product-marketing`, `skills/programmatic-seo`, `skills/prospecting`, `skills/public-relations`, `skills/referrals`, `skills/sales-enablement`, `skills/schema`, `skills/seo-audit`, `skills/signup`, `skills/site-architecture`, `skills/social`)
- **License**: MIT
- **Copyright**: © 2025 Corey Haines
- **Imported into**: `.agents/skills/<name>/` for each of the 41 skill directories listed above, unchanged from their upstream directory name (no collision with an existing skill)
- **Adoption**: Vendored 49 of the 50 upstream skill directories as published (`skills/ad-creative` was dropped: the supply-chain vetter rejects its reference files, which carry shell download commands against third-party generation APIs); 41 remain after eight were removed from the in-product catalog on 2026-10-13 (`skills/marketing-council`, which simulates advice from named marketers; `skills/image` and `skills/video`, which direct the user to third-party generation tools although this product generates images and video itself; and `skills/co-marketing`, `skills/directory-submissions`, `skills/events`, `skills/revops` and `skills/sms`, which cover narrow business-operations tasks). The remaining skills are marked `audience: product` in `skills-lock.json` because each is a marketing task an end user of this product would ask for (positioning, copywriting, SEO, email sequences, landing pages, launch plans, pricing pages, ads, analytics, and related growth work), so the vendored bundle reaches the in-product Skills catalog rather than staying repository-only tooling. Every `SKILL.md` already carried a real per-skill semantic version under a nested `metadata.version` key that this repository's minimal frontmatter parser does not read; a top-level `version` frontmatter field was added to each, set to that same existing value (matching the `agent-skills` (Vercel Labs) precedent above) rather than the fetched commit sha, so the lock file's `declaredVersion` reflects the skill's own release history instead of one shared repository-wide value. No other frontmatter or body text was changed; every vendored file was run through this repository's own `prettier --write` before hashing so the lock's `computedHash` matches what `lint-staged` produces at commit time, and the tables and code fences prettier reformatted carry no wording changes. Each skill also ships an upstream `evals/` directory (static prompt/expected-output JSON fixtures, not executable) and some ship `references/` markdown; both were vendored as published. Every `SKILL.md` and reference file across the 49 vendored skills was checked for shell/download instructions and for prompt-injection example phrasing before vendoring; none were found; one file (`skills/ads/references/audit-guardrails.md`) explicitly warns the agent to treat fetched pages as data and never follow embedded directives, which is a defensive pattern and not an instruction to exclude. Skills reference a `tools/` integrations registry from the upstream repository root (for example `../../tools/integrations/ga4.md`) that was not vendored because it is outside `skills/`; those relative links do not resolve inside this repository, matching how other vendored skill bundles' repository-root cross-references are left unresolved rather than rewritten. Locked in `skills-lock.json`.

## Engineering skills vendored 2026-10-13

Twenty-eight developer-audience skills (`audience: developer` in `skills-lock.json`, so none reaches the in-product Skills catalog) for the stack this repository builds on. Each was fetched at the pinned commit below, run through this repository's own `prettier --write` before hashing, parsed with `packages/tools/skills/src/frontmatter.ts` and a full YAML parser to confirm both read the same `name`, `version` and `description`, and cleared by `scripts/scan-skills-with-vetting.mjs` (`SAFE` for all but `expo-data-fetching`, which is rated `CAUTION`, a passing verdict, for naming `.env` files in its environment-variable guidance). Unless a row says otherwise, the only change to a vendored file is a top-level `version` frontmatter field, set to the value the file already carried under a nested `metadata.version` key, or to the fetched commit sha where it carried none.

| Skill directory                                     | Upstream @ commit (path)                                                                                                                                                         | License    | Copyright                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| `.agents/skills/neon-postgres/`                     | [neondatabase/agent-skills](https://github.com/neondatabase/agent-skills) @ `bfd013c352ed31b57a573e4f60263afc5fdd7f7a` (`skills/neon-postgres`)                                  | Apache-2.0 | Neon, as the publishing organization                 |
| `.agents/skills/chrome-extensions/`                 | [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) @ `b31dc0a43ff5d19bcf386a3476a216f3b39a6f55` (`skills/chrome-extensions`)                | Apache-2.0 | Google LLC, as the publishing organization           |
| `.agents/skills/clerk-testing/`                     | [clerk/skills](https://github.com/clerk/skills) @ `a02dbd2a933b8929525129a6cb9dcf6ed66d0adf` (`skills/clerk-testing`)                                                            | MIT        | Clerk, as the publishing organization                |
| `.agents/skills/clerk-nextjs-patterns/`             | [clerk/skills](https://github.com/clerk/skills) @ `a02dbd2a933b8929525129a6cb9dcf6ed66d0adf` (`skills/clerk-nextjs-patterns`)                                                    | MIT        | Clerk, as the publishing organization                |
| `.agents/skills/clerk-chrome-extension-patterns/`   | [clerk/skills](https://github.com/clerk/skills) @ `a02dbd2a933b8929525129a6cb9dcf6ed66d0adf` (`skills/clerk-chrome-extension-patterns`)                                          | MIT        | Clerk, as the publishing organization                |
| `.agents/skills/rust-best-practices/`               | [apollographql/skills](https://github.com/apollographql/skills) @ `5f02fcfcebec678e2e55777b639e32346622a963` (`skills/rust-best-practices`)                                      | MIT        | © 2024 Apollo Graph, Inc.                            |
| `.agents/skills/rust-async-patterns/`               | [wshobson/agents](https://github.com/wshobson/agents) @ `46891e7e60da0e52baf1050b7b6391b64e84c6d9` (`plugins/systems-programming/skills/rust-async-patterns`)                    | MIT        | © 2024 Seth Hobson                                   |
| `.agents/skills/accessibility/`                     | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) @ `afa8da942115f2961fdbfa80807ea0b232ff6c00` (`skills/accessibility`)                          | MIT        | © 2026 Addy Osmani                                   |
| `.agents/skills/vitest/`                            | [antfu/skills](https://github.com/antfu/skills) @ `feb0f3aba6566426f12230e7fc7a10d97c1293bb` (`skills/vitest`)                                                                   | MIT        | © 2025-present Anthony Fu                            |
| `.agents/skills/expo-native-ui/`                    | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/expo-native-ui`)                                                | MIT        | © 2025-present 650 Industries, Inc. (aka Expo)       |
| `.agents/skills/expo-upgrade/`                      | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/expo-upgrade`)                                                  | MIT        | © 2025-present 650 Industries, Inc. (aka Expo)       |
| `.agents/skills/eas-app-stores/`                    | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/eas-app-stores`)                                                | MIT        | © 2025-present 650 Industries, Inc. (aka Expo)       |
| `.agents/skills/supabase-postgres-best-practices/`  | [supabase/agent-skills](https://github.com/supabase/agent-skills) @ `c9be0e931b7930f7d02126d04774d904c381e7d7` (`skills/supabase-postgres-best-practices`)                       | MIT        | © 2026 Supabase                                      |
| `.agents/skills/expo-router/`                       | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/expo-router`)                                                   | MIT        | © 2025-present 650 Industries, Inc. (aka Expo)       |
| `.agents/skills/expo-animation/`                    | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/expo-animation`)                                                | MIT        | © 2026 Emil Kowalski (per the skill's own `LICENSE`) |
| `.agents/skills/expo-data-fetching/`                | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/expo-data-fetching`)                                            | MIT        | © 2025-present 650 Industries, Inc. (aka Expo)       |
| `.agents/skills/expo-dev-client/`                   | [expo/skills](https://github.com/expo/skills) @ `d4f484024fec15196bfd3c272e953e3f983972cf` (`plugins/expo/skills/expo-dev-client`)                                               | MIT        | © 2025-present 650 Industries, Inc. (aka Expo)       |
| `.agents/skills/react-native-testing/`              | [callstack/react-native-testing-library](https://github.com/callstack/react-native-testing-library) @ `5678d04ea90505762ff3ef63a9fd12c66eea28e6` (`skills/react-native-testing`) | MIT        | © 2018 Callstack and Rally Health                    |
| `.agents/skills/tanstack-query-best-practices/`     | [deckardger/tanstack-agent-skills](https://github.com/deckardger/tanstack-agent-skills) @ `b2fc14c974b2ca09b38de09c28237f240175205b` (`skills/tanstack-query`)                   | MIT        | © 2026 Deckard Gerritsen                             |
| `.agents/skills/typescript-advanced-types/`         | [wshobson/agents](https://github.com/wshobson/agents) @ `46891e7e60da0e52baf1050b7b6391b64e84c6d9` (`plugins/javascript-typescript/skills/typescript-advanced-types`)            | MIT        | © 2024 Seth Hobson                                   |
| `.agents/skills/core-web-vitals/`                   | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) @ `afa8da942115f2961fdbfa80807ea0b232ff6c00` (`skills/core-web-vitals`)                        | MIT        | © 2026 Addy Osmani                                   |
| `.agents/skills/verification-before-completion/`    | [obra/superpowers](https://github.com/obra/superpowers) @ `bb92a77741419a4ab5f06e711a283343f1ada0c3` (`skills/verification-before-completion`)                                   | MIT        | © 2025 Jesse Vincent                                 |
| `.agents/skills/api-and-interface-design/`          | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) @ `1be8e34187e34647bb83adc3a1323b26ae6f6abe` (`skills/api-and-interface-design`)                           | MIT        | © 2025 Addy Osmani                                   |
| `.agents/skills/observability-and-instrumentation/` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) @ `1be8e34187e34647bb83adc3a1323b26ae6f6abe` (`skills/observability-and-instrumentation`)                  | MIT        | © 2025 Addy Osmani                                   |
| `.agents/skills/performance-optimization/`          | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) @ `1be8e34187e34647bb83adc3a1323b26ae6f6abe` (`skills/performance-optimization`)                           | MIT        | © 2025 Addy Osmani                                   |
| `.agents/skills/neon-postgres-branches/`            | [neondatabase/agent-skills](https://github.com/neondatabase/agent-skills) @ `bfd013c352ed31b57a573e4f60263afc5fdd7f7a` (`skills/neon-postgres-branches`)                         | Apache-2.0 | Neon, as the publishing organization                 |
| `.agents/skills/animate/`                           | [emilkowalski/skills](https://github.com/emilkowalski/skills) @ `2d228630ba1446365f614a108cb8252f1feda202` (`skills/animate`)                                                    | MIT        | © 2026 Emil Kowalski                                 |
| `.agents/skills/mobile-native/`                     | [emilkowalski/skills](https://github.com/emilkowalski/skills) @ `2d228630ba1446365f614a108cb8252f1feda202` (`skills/mobile-native`)                                              | MIT        | © 2026 Emil Kowalski                                 |

- **Notice**: The three Apache-2.0 skills carry the upstream `LICENSE` verbatim as `LICENSE.txt` inside the skill directory; neither upstream repository ships a `NOTICE` file, and neither `LICENSE` names a copyright holder. `animate` and `mobile-native` come from a later commit of `emilkowalski/skills` than the two skills in the section above. `clerk/skills` carries no `LICENSE` file at the fetched commit; the license is the grant stated in its `README.md` ("## License" → "MIT") and in the `license: MIT` frontmatter field of each vendored `SKILL.md`.
- **Adoption**: The folded or multi-line `description:` values of `neon-postgres`, `neon-postgres-branches`, `chrome-extensions`, `rust-best-practices`, `react-native-testing`, `clerk-testing`, `clerk-nextjs-patterns` and `clerk-chrome-extension-patterns` were reflowed to a single line because this repository's minimal frontmatter parser does not support them, and the four that then contained a colon followed by a space were wrapped in quotes so they remain valid YAML; wording was not changed. The `templates/` directory of `clerk-nextjs-patterns` and of `clerk-chrome-extension-patterns` (sample application source with its own `package.json`) was not vendored; neither `SKILL.md` refers to it. The seven Expo skills already carried a top-level `version` field and are unchanged apart from formatting; `expo-animation` ships its own `LICENSE`, vendored as published. `tanstack-query-best-practices` is named for its frontmatter `name` field, not its upstream folder (`skills/tanstack-query`). `supabase-postgres-best-practices` is used for its vendor-neutral Postgres guidance (indexes, locking, connection pooling, row-level security); its Supabase-specific notes do not describe this repository, which runs on Neon.
- **Considered and not vendored**: `currents-dev/playwright-best-practices-skill`, `addyosmani/agent-skills` `skills/security-and-hardening` and `getsentry/skills` `skills/security-review` and `cloudflare/security-audit-skill` (the supply-chain vetter rates each `DO_NOT_INSTALL`), `antfu/skills` `skills/pnpm` (it documents a newer pnpm major than the `packageManager` this repository pins), and `vercel/turborepo` `skills/turborepo` (it only points at a `docs/` directory inside the installed `turbo` package, which the `turbo` version installed here does not ship).

## Anthropic knowledge-work plugins

- **Upstream**: [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) @ `da38ec1ee89d41e5380e652a97382695003396e7` (`legal/skills/review-contract`, `legal/skills/triage-nda`, `customer-support/skills/ticket-triage`, `customer-support/skills/draft-response`, `customer-support/skills/customer-escalation`, `human-resources/skills/recruiting-pipeline`, `human-resources/skills/interview-prep`, `sales/skills/pipeline-review`, `sales/skills/deal-review`)
- **License**: Apache-2.0
- **Copyright**: Not stated in the fetched commit; every `LICENSE` file there leaves the Apache appendix placeholder unfilled. Attributed to Anthropic, the author each plugin's `.claude-plugin/plugin.json` declares.
- **Imported into**: `.agents/skills/<name>/` for each of the nine skill directories listed above, unchanged from their upstream directory name (no collision with an existing skill)
- **Adoption**: Vendored each `SKILL.md` as published, with the plugin's Apache-2.0 `LICENSE` copied beside it and a `NOTICE` that names the upstream, commit, path, publisher and license and states the changes made. The human-resources plugin has no `LICENSE` of its own and is covered by the repository's root `LICENSE`, whose Apache-2.0 text matches the other plugins' `LICENSE` files apart from stray trailing lines that are not license terms, so its two skills carry that same plugin `LICENSE` text. Marked `audience: product` in `skills-lock.json` because each is legal, support, recruiting or sales work an end user of this product asks for (contract review and NDA triage, ticket triage, customer replies and escalations, recruiting pipelines and interview plans, pipeline and deal reviews), so the skills reach the in-product Skills catalog. A top-level `version` frontmatter field (the fetched commit sha) was added because the skills carry none; every `SKILL.md` was run through this repository's `prettier --write` before hashing, which changed only quoting, blank lines and table alignment, not wording. Every vendored file passes the 14-rule plugin content scan (`scanPluginPackage`) with no findings. The skills name connected tools by category placeholders such as `~~CRM` and `~~support platform`, which each plugin maps in a `CONNECTORS.md` at its root; that file describes the upstream plugin's own pre-configured servers, so it was not vendored and the `../../CONNECTORS.md` links are left unresolved, matching the Marketing Skills precedent above. Locked in `skills-lock.json`.

## OmniRoute

- **Upstream**: [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute)
- **License**: MIT
- **Copyright**: Copyright (c) 2026 diegosouzapw
- **Imported into**: `packages/ai/routing/src/breaker-profiles.ts`
- **Adoption**: Numeric threshold pattern only, no upstream source file copied. `DEFAULT_BREAKER_PROFILES` reproduces the shape of OmniRoute's `open-sse/config/constants.ts` `PROVIDER_PROFILES` (three credential-class breaker profiles: static API key, OAuth/session token, local runtime), read from a local read-only clone, not the npm registry. Selection logic (`resolveCredentialClass`, `credentialClassForProvider`) is freshly written against this repository's own `RoutingTrustMode` registry field rather than ported.

## LobeHub Icons

- **Upstream**: [lobehub/lobe-icons](https://github.com/lobehub/lobe-icons)
- **Package**: `@lobehub/icons-static-svg`
- **License**: MIT
- **Imported into**: `apps/mobile/src/features/model-picker/components/ProviderLogo.tsx`
- **Files/data derived from LobeHub Icons**:
  - OpenAI provider mark path from `icons/openai.svg`
  - Claude provider mark path from `icons/claude-color.svg`, used for Anthropic/Claude model rows
  - Gemini provider mark path from `icons/gemini.svg`, used for Google/Gemini model rows
  - Perplexity provider mark path from `icons/perplexity.svg`, used for Perplexity model rows
  - DeepSeek provider mark path from `icons/deepseek.svg`
  - Grok provider mark path from `icons/grok.svg`, used for xAI/Grok model rows

### MIT License (LobeHub Icons)

```
MIT License

Copyright (c) 2023 LobeHub

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
| OmniRoute    | MIT               | Resilience/routing patterns (data shape only)       |

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
