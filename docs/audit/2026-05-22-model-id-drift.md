# Model ID Drift Audit — Mistral / Groq / OpenRouter

**Date:** 2026-05-22
**Auditor:** web-engineer (R25-V2)
**Scope:** `packages/types/src/models.json` — all entries where `provider` is `mistral`, `groq`, or `open_router`

---

## Models Verified (15 total)

### Mistral (5 entries)

| Internal ID        | apiModelId (before)    | apiModelId (after)       | Status                                                                                                                |
| ------------------ | ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `mistral-large-3`  | `mistral-large-2512`   | unchanged                | Verified valid                                                                                                        |
| `mistral-medium-3` | `mistral-medium-2508`  | unchanged                | Verified valid (Medium 3.1)                                                                                           |
| `mistral-small-3`  | `mistral-small-2506`   | **`mistral-small-2603`** | CORRECTED — 2506 deprecated Apr 30 2026                                                                               |
| `codestral-2`      | `codestral-2`          | **`codestral-2508`**     | CORRECTED — bare "codestral-2" is not a Mistral API ID                                                                |
| `pixtral-large`    | `pixtral-large-latest` | unchanged                | Unverified — Mistral docs did not surface Pixtral specs through WebFetch; `-latest` alias treated as safe passthrough |

### Groq (2 entries)

| Internal ID          | apiModelId                | Pricing (in/out per 1M) | Status           |
| -------------------- | ------------------------- | ----------------------- | ---------------- |
| `groq-llama-3.3-70b` | `llama-3.3-70b-versatile` | $0.59 / $0.79           | Verified correct |
| `groq-llama-3.1-8b`  | `llama-3.1-8b-instant`    | $0.05 / $0.08           | Verified correct |

Source: https://console.groq.com/docs/models (production models section, verified 2026-05-22)

### OpenRouter (8 entries)

| Internal ID                                     | Status                              | Notes                                                       |
| ----------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `meta-llama/llama-3.3-70b-instruct:free`        | Verified valid                      | 131K context                                                |
| `mistralai/mistral-small-3.1-24b-instruct:free` | CORRECTED (context window)          | Was 32768; corrected to 128000                              |
| `qwen/qwen3-coder:free`                         | Verified valid                      | 1M context                                                  |
| `nvidia/nemotron-3-super-120b-a12b:free`        | CORRECTED (wrong ID)                | Replaced with `nvidia/llama-3.3-nemotron-super-49b-v1:free` |
| `anthropic/claude-opus-4`                       | Unverified — model card not fetched | ID format matches OpenRouter convention                     |
| `openai/gpt-4o`                                 | Unverified — model card not fetched | ID format matches OpenRouter convention                     |
| `google/gemini-2.5-pro`                         | Unverified — model card not fetched | ID format matches OpenRouter convention                     |
| `deepseek/deepseek-r1`                          | Unverified — model card not fetched | ID format matches OpenRouter convention                     |

---

## Drift Corrected (4 instances)

### 1. `nvidia/nemotron-3-super-120b-a12b:free` — Hallucinated ID

- **Before:** `nvidia/nemotron-3-super-120b-a12b:free` (does not exist on OpenRouter)
- **After:** `nvidia/llama-3.3-nemotron-super-49b-v1:free`
- **Source:** https://openrouter.ai/nvidia/llama-3.3-nemotron-super-49b-v1:free (valid, free, 131K context, released April 8 2025)
- **Files changed:** `models.json` (3 locations: model entry key+id+apiModelId, taskRouting.complex_reasoning, selectableModels entry), `apps/web/lib/llm-providers/openrouter.ts` (comment only)
- **Severity:** High — every OpenRouter `complex_reasoning` task route would have resolved to a non-existent model ID

### 2. `mistralai/mistral-small-3.1-24b-instruct:free` — Context window drift

- **Before:** `contextWindow: 32768`
- **After:** `contextWindow: 128000`
- **Source:** https://openrouter.ai/mistralai/mistral-small-3.1-24b-instruct:free ("128k token context window")
- **Severity:** Medium — context-limit checks (splitting, chunking) would have been unnecessarily conservative

### 3. `mistral-small-3` — Deprecated `apiModelId`

- **Before:** `apiModelId: "mistral-small-2506"`, name: "Mistral Small 3.2"
- **After:** `apiModelId: "mistral-small-2603"`, name: "Mistral Small 4"
- **Source:** https://docs.mistral.ai/getting-started/models/models_overview/ ("Mistral Small 3.2 deprecated April 30, 2026; upgrade to Mistral Small 4 = mistral-small-2603")
- **Severity:** High — API calls using the deprecated ID would fail or be rejected after April 30 2026 (today is May 22)

### 4. `codestral-2` — Invalid `apiModelId`

- **Before:** `apiModelId: "codestral-2"` (not a Mistral API model ID)
- **After:** `apiModelId: "codestral-2508"`
- **Source:** https://docs.mistral.ai/getting-started/models/models_overview/ (Codestral v25.08 = `codestral-2508`)
- **Severity:** High — API calls would fail; `"codestral-2"` is the internal catalog slug, not a Mistral API identifier

---

## Items Not Corrected (deliberate)

- **Pricing for Mistral models** — Mistral's documentation pages did not surface per-token pricing through WebFetch. Existing pricing fields are retained without change to avoid introducing unverified data.
- **Pixtral Large** — `pixtral-large-latest` is a Mistral `-latest` alias style consistent with other models. Pixtral did not appear in the fetched docs. Retained as-is; flagged for follow-up.
- **Mistral Medium 3.5 / Small 4 as new entries** — OpenRouter API surfaced these as newer models not in our catalog. Adding net-new catalog entries is out of scope for a drift-correction pass; flagged for a future catalog-expansion PR.
- **OpenRouter paid models** (claude-opus-4, gpt-4o, gemini-2.5-pro, deepseek-r1) — ID format verified as consistent with OpenRouter convention but individual model pages not fetched. Pricing matches upstream sources at time of last catalog update.

---

## Hardcoded ID scan in `apps/`

Searched for hardcoded model ID strings in production source (`apps/web/lib/`, `apps/web/app/`) excluding minified bundles. Findings:

- `apps/web/lib/llm-providers/mistral.ts:46-47` — comment listing model ID mappings (not runtime code). Updated.
- `apps/web/lib/llm-providers/openrouter.ts:68` — comment example listing (not runtime code). Updated.

No production runtime string literals found outside of comments.

---

## Tests Added

File: `packages/types/src/__tests__/model-catalog.test.ts`

Added `describe('R25-V2 model-id drift...')` block with 8 assertions:

- Groq model IDs resolve with correct apiModelId
- Mistral Large 3 apiModelId is `mistral-large-2512`
- Mistral Small 3 apiModelId is `mistral-small-2603` (not deprecated `2506`)
- Codestral-2 apiModelId is `codestral-2508` (not bare `codestral-2`)
- Old nvidia ID returns null; correct ID resolves
- Mistral OpenRouter free model has 128K context
- Unknown/null/undefined model IDs return null gracefully

Result: 228 tests pass (0 failures).

---

## Verification Gates

- `pnpm --filter @agiworkforce/types typecheck` — PASS
- `pnpm --filter @agiworkforce/types test` — PASS (228/228)
- `pnpm -w build` — PASS for `@agiworkforce/types`; `packages/mcp` failure is pre-existing (missing `@modelcontextprotocol/sdk` types, reproduced on clean `main`)
