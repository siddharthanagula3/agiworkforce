# Third-Party Licenses

This file documents source code in this proprietary repository that was
ported from third-party open-source projects, along with the upstream license
that travels with that code.

## OpenClaw

- **Upstream**: [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **License**: MIT
- **Copyright**: © 2025 Peter Steinberger
- **Imported into**: `packages/llm-normalize/src/`
- **Files derived from OpenClaw**:
  - `packages/llm-normalize/src/openai-responses-payload-policy.ts`
    ← `src/agents/openai-responses-payload-policy.ts`
  - `packages/llm-normalize/src/openai-reasoning-effort.ts`
    ← `src/agents/openai-reasoning-effort.ts`
  - `packages/llm-normalize/src/system-prompt-cache-boundary.ts`
    ← `src/agents/system-prompt-cache-boundary.ts`
  - `packages/llm-normalize/src/anthropic-payload-policy.ts`
    ← `src/agents/anthropic-payload-policy.ts` (Sprint 2)
  - `packages/llm-normalize/src/openai-completions-compat.ts`
    ← `src/agents/openai-completions-compat.ts` (Sprint 2)
  - `packages/llm-normalize/src/provider-attribution.ts`
    ← simplified port of `src/agents/provider-attribution.ts` (Sprint 2 — stripped plugin-manifest scanning, kept pure capability resolution)
  - `packages/llm-normalize/src/lib/prompt-cache-stability.ts`
    ← `src/agents/prompt-cache-stability.ts`
  - `packages/llm-normalize/src/lib/string-utils.ts`
    ← subset of `src/shared/string-coerce.ts`
  - `packages/llm-normalize/src/openai-tool-schema.ts`
    ← `src/agents/openai-tool-schema.ts` (Sprint 3 — drops the strict-tool-setting re-export which depends on provider-attribution-via-plugin-runtime)
  - `packages/llm-normalize/src/tool-parameter-schema.ts`
    ← simplified port of `src/agents/pi-tools-parameter-schema.ts` (Sprint 3 — replaces ModelCompatConfig sourcing with explicit `unsupportedKeywords` arg)
  - `packages/llm-normalize/src/lib/clean-for-gemini.ts`
    ← `src/agents/schema/clean-for-gemini.ts` (Sprint 3 — TypeBox return type replaced with `unknown`)
  - `packages/types/src/provider-adapter.ts`
    ← interface shape adapted from `packages/plugin-sdk/src/provider-entry.ts` (`ProviderPlugin` type) (Sprint 2)
  - `packages/mcp/src/types.ts`
    ← shape mirrors `src/config/types.mcp.ts` and `src/agents/pi-bundle-mcp-types.ts` (Sprint 4a — code is freshly written, only the config/catalog shapes are aligned for ecosystem compat; not a literal port)
  - `packages/skills/src/types.ts`, `loader.ts`, `merge.ts`, `format.ts`
    ← skill format and precedence rules mirror OpenClaw's `src/agents/skills/*` (Sprint 4a — code is freshly written; the markdown+YAML-frontmatter file format and the 6-tier precedence order are the ecosystem-compatibility surface, not OpenClaw-licensed material)
  - `packages/llm-normalize/src/anthropic-tool-payload-compat.ts`
    ← `src/agents/pi-embedded-runner/anthropic-family-tool-payload-compat.ts` (Tier-1D — generic `StreamFn` type replaces the `@mariozechner/pi-agent-core` dependency so adapters don't need to inherit pi-agent-core types)
  - `packages/apply-patch/src/parse.ts`, `apply-update.ts`, `types.ts`, `index.ts`
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
