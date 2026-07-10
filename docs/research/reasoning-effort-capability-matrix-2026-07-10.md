# Reasoning / Effort Capability Matrix (per provider, per model)

Status: Research + design proposal (NO code or models.json changes in this doc)
Author: research agent
Date: 2026-07-10
Scope: every model served in `packages/types/src/models.json`, grounded in each
provider's official docs plus live API probes on the keys in
`apps/web/.env.local`.

## Why this exists

The app treats reasoning/effort roughly uniformly. In reality it differs per
provider **and per model**:

- Some models have **no** reasoning at all (effort UI must be hidden).
- Some are **reasoner-only** (reasoning always on, cannot be disabled).
- Some take an **on/off toggle**.
- Some take a **token budget**.
- Some take **discrete effort levels** — and the allowed set differs by model
  (e.g. GPT-5.5 has no `minimal` and no `max`; base GPT-5 has `minimal` but no
  `xhigh`; Anthropic Opus 4.8 adds `max`).
- The reigning example of drift: **Anthropic Opus 4.8 rejects the classic
  `thinking:{type:"enabled",budget_tokens}` shape entirely** and requires the
  new `output_config.effort` + adaptive-thinking API.

This doc is the authoritative map so a follow-up wave can (1) add per-model
capability metadata to models.json, (2) fix the drifted request paths, and
(3) render the effort UI correctly per model.

---

## Control-type taxonomy (proposed vocabulary)

| `reasoningControl` | Meaning                                                                    | Effort UI                                |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| `none`             | Not a reasoning model. No thinking param accepted.                         | Hide effort control entirely             |
| `always_on`        | Reasoner-only; reasoning cannot be disabled. May or may not expose levels. | Show levels if any; no off switch        |
| `thinking_toggle`  | Boolean on/off (e.g. `enable_thinking`, `thinking:{type}`).                | On/off switch                            |
| `thinking_budget`  | Token budget with min/max/default.                                         | Budget slider (or level→budget presets)  |
| `effort_levels`    | Discrete named levels; allowed set is per-model.                           | Chip subset from the model's allowed set |

Several models are **hybrid** (e.g. Qwen3 = toggle + budget; DeepSeek V4 =
default-on + effort levels). The schema below carries a primary `control` plus
secondary fields so hybrids are expressible.

---

## Live-probe accessibility results (2026-07-10, keys in apps/web/.env.local)

Distinguish **model absent (404)** from **our key stale (401)** — the latter is
NOT a fake-availability signal, it's an ops/key problem. Keys were checked for
mangling (length/prefix/trailing-space) and are well-formed; the 401s are
genuinely stale credentials.

| Provider                    | Probe                                               | Result                                                | Meaning                                              |
| --------------------------- | --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| OpenAI                      | `gpt-5.5` chat/completions                          | **200**                                               | real                                                 |
| OpenAI                      | `gpt-4.1-nano`                                      | 400 "Unrecognized request argument: reasoning_effort" | real, non-reasoning                                  |
| OpenAI                      | `gpt-5.6-sol` / `-terra` / `-luna` / bare `gpt-5.6` | **404 "model does not exist"**                        | model ABSENT (matches 2026-07-10 catalog correction) |
| Anthropic                   | `claude-opus-4-8`                                   | 200 (adaptive+effort) / **400** (enabled+budget)      | real; classic thinking rejected                      |
| Anthropic                   | `claude-sonnet-4-6`                                 | 200 (both shapes)                                     | real; transitional                                   |
| Anthropic                   | `claude-haiku-4-5`                                  | **200 with `thinking_tokens`**                        | real; DOES support thinking                          |
| Google                      | `gemini-3.5-flash`                                  | 200 (`thoughtsTokenCount`)                            | real                                                 |
| DeepSeek                    | `deepseek-v4-flash` / `-pro`                        | 200 (reasoning_tokens by default)                     | real                                                 |
| Moonshot                    | `kimi-k2.6`                                         | 200 (`reasoning_content` by default)                  | real                                                 |
| xAI                         | `grok-4.3`                                          | 400 "Incorrect API key"                               | **UNKNOWN — key stale**, not model-absent            |
| Qwen                        | `qwen3-max` (intl + mainland)                       | 401 invalid_api_key                                   | **UNKNOWN — key stale**                              |
| Zhipu                       | `glm-*`                                             | 401 身份验证失败 (auth failed)                        | **UNKNOWN — key stale**                              |
| Perplexity                  | `sonar-reasoning`                                   | 401 insufficient_quota                                | auth OK, quota-blocked — control from docs           |
| Mistral / Groq / OpenRouter | —                                                   | no key in env                                         | UNKNOWN — control from docs                          |

Providers marked UNKNOWN above are grounded in **official docs** below, labeled
doc-sourced (not live-verified). Reading levels off the app's own `effort.ts`
would be circular and is deliberately avoided.

---

## Full per-model matrix

Legend for "request param" — the exact field the adapter must send.
`chat` = `/chat/completions`, `responses` = OpenAI Responses API,
`messages` = Anthropic Messages API, `gen` = Gemini `:generateContent`.

| Model id (catalog)                                                                                                          | Provider    | Reasoning?                              | reasoningControl                               | supportedEfforts / budget                                                                                        | Request param (API · path)                                                                            | Source · probe                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| gpt-5.5                                                                                                                     | openai      | yes                                     | effort_levels                                  | `none,low,medium,high,xhigh` (default `medium`; **no `minimal`, no `max`**)                                      | chat/responses · `reasoning_effort` (chat) / `reasoning.effort` (responses)                           | OpenAI reasoning guide + **live 400 enumeration**                         |
| gpt-5.4-mini                                                                                                                | openai      | yes                                     | effort_levels                                  | `none,low,medium,high,xhigh` (gpt-5.4 family)                                                                    | chat · `reasoning_effort`                                                                             | resolveOpenAISupportedReasoningEfforts; docs                              |
| gpt-5-nano                                                                                                                  | openai      | yes                                     | effort_levels                                  | `minimal,low,medium,high` (**gpt-5 base family — has `minimal`, no `xhigh`**)                                    | chat · `reasoning_effort`                                                                             | OpenAI GPT-5 model page; code `GPT_5_REASONING_EFFORTS`                   |
| gpt-4.1-nano                                                                                                                | openai      | **no**                                  | none                                           | — (param rejected: "Unrecognized request argument")                                                              | —                                                                                                     | **live 400**                                                              |
| claude-opus-4.8                                                                                                             | anthropic   | yes                                     | effort_levels                                  | `low,medium,high,xhigh,max` (**adds `max`**)                                                                     | messages · `output_config.effort` + `thinking:{type:"adaptive"}`; **`enabled`+`budget_tokens` → 400** | **live probe (effort enum from 400)** + Anthropic extended-thinking docs  |
| claude-sonnet-4.6                                                                                                           | anthropic   | yes                                     | effort_levels                                  | `low,medium,high,xhigh,max` (transitional: also accepts `enabled`+`budget_tokens`)                               | messages · `output_config.effort` (preferred) OR `thinking:{type:"enabled",budget_tokens}`            | **live 200 on both** + docs                                               |
| claude-haiku-4.5                                                                                                            | anthropic   | **yes** (models.json says no — WRONG)   | thinking_budget                                | `budget_tokens` min ~1024 / model-max; classic `enabled` API                                                     | messages · `thinking:{type:"enabled",budget_tokens:N}`                                                | **live 200 with `thinking_tokens:23`** + docs (Haiku 4.5 = manual budget) |
| gemini-3.1-pro-preview                                                                                                      | google      | yes                                     | effort_levels (3.x)                            | `minimal,low,medium,high` (`thinking_level`); legacy `thinkingBudget` still accepted                             | gen · `generationConfig.thinkingConfig.thinkingLevel` (3.x) / `.thinkingBudget` (legacy)              | ai.google.dev thinking docs                                               |
| gemini-3.5-flash                                                                                                            | google      | yes                                     | effort_levels (3.x)                            | `minimal,low,medium,high` (default `medium`)                                                                     | gen · `thinkingConfig.thinkingLevel`; `thinkingBudget` legacy-compat                                  | docs + **live 200 with thinkingBudget**                                   |
| gemini-3.1-flash-lite                                                                                                       | google      | optional (off by default)               | thinking_toggle + effort_levels                | thinking Off by default; `minimal,low,medium,high` when enabled                                                  | gen · `thinkingConfig.thinkingLevel` (or budget `0` to disable)                                       | ai.google.dev thinking docs                                               |
| grok-4.3                                                                                                                    | xai         | yes (always on)                         | always_on (+ effort_levels, version-dependent) | docs show grok-4.5 = `reasoning_effort` `low,medium,high` (default `high`, **cannot disable**); grok-4.3 UNKNOWN | chat · `reasoning_effort`                                                                             | docs.x.ai reasoning (grok-4.5/4.20) — **grok-4.3 not in docs; key stale** |
| deepseek-v4-flash                                                                                                           | deepseek    | yes (on by default)                     | thinking_toggle + effort_levels (hybrid)       | reasons by default; `thinking:{type:"enabled"/"disabled"}` + `reasoning_effort`                                  | chat · `thinking` and/or `reasoning_effort`                                                           | api-docs.deepseek.com + **live 200, reasoning_tokens by default**         |
| deepseek-v4-pro                                                                                                             | deepseek    | yes (on by default)                     | thinking_toggle + effort_levels (hybrid)       | as above                                                                                                         | chat · `thinking` / `reasoning_effort`                                                                | docs + **live 200**                                                       |
| qwen-max (`qwen3-max`)                                                                                                      | qwen        | yes (hybrid, off by default)            | thinking_toggle + thinking_budget              | `enable_thinking:true/false`; `thinking_budget` caps CoT tokens (default = model max CoT)                        | chat · `enable_thinking` + `thinking_budget`                                                          | alibabacloud Model Studio docs — **key stale, doc-sourced**               |
| qwen-flash (`qwen3.5-flash`)                                                                                                | qwen        | yes (hybrid, off by default)            | thinking_toggle + thinking_budget              | `enable_thinking` + `thinking_budget`                                                                            | chat · `enable_thinking`                                                                              | docs — doc-sourced                                                        |
| qwen-3.5-plus (`qwen3.5-plus`)                                                                                              | qwen        | yes (hybrid)                            | thinking_toggle + thinking_budget              | `enable_thinking` + `thinking_budget`                                                                            | chat · `enable_thinking`                                                                              | docs — doc-sourced                                                        |
| qwen-coder-plus                                                                                                             | qwen        | yes                                     | thinking_toggle                                | `enable_thinking`                                                                                                | chat · `enable_thinking`                                                                              | docs — doc-sourced                                                        |
| qwen-coder-flash                                                                                                            | qwen        | no (models.json thinking:false)         | none                                           | —                                                                                                                | —                                                                                                     | docs                                                                      |
| qwen-turbo                                                                                                                  | qwen        | deprecated                              | none                                           | —                                                                                                                | —                                                                                                     | catalog (deprecated 2026-06-20)                                           |
| kimi-k2.6                                                                                                                   | moonshot    | yes (on by default)                     | always_on / thinking_toggle                    | reasons by default (`reasoning_content`); `supports_reasoning:true` in model list                                | chat · (default)                                                                                      | **live 200, reasoning_tokens:31** + Moonshot model list                   |
| glm-5.2                                                                                                                     | zhipu       | yes                                     | thinking_toggle                                | `thinking:{type:"enabled"/"disabled"}` (default enabled); no effort/budget                                       | chat · `thinking:{type}`                                                                              | docs.z.ai GLM — **key stale, doc-sourced**                                |
| mistral-large-3                                                                                                             | mistral     | catalog says reasoning — **UNVERIFIED** | UNKNOWN                                        | docs mention reasoning_effort only for medium/small; large not listed                                            | chat · `reasoning_effort`?                                                                            | docs.mistral.ai reasoning — no key, UNKNOWN                               |
| mistral-medium-3 (`mistral-medium-3-5`)                                                                                     | mistral     | yes                                     | effort_levels                                  | `reasoning_effort` = `high` \| `none` (2 values only)                                                            | chat · `reasoning_effort`                                                                             | docs.mistral.ai reasoning — doc-sourced                                   |
| mistral-small-3                                                                                                             | mistral     | yes (reasoning available)               | effort_levels                                  | `reasoning_effort` = `high` \| `none`                                                                            | chat · `reasoning_effort`                                                                             | docs.mistral.ai — doc-sourced                                             |
| codestral-2 / pixtral-large                                                                                                 | mistral     | no                                      | none                                           | —                                                                                                                | —                                                                                                     | catalog thinking:false                                                    |
| sonar                                                                                                                       | perplexity  | no                                      | none                                           | —                                                                                                                | —                                                                                                     | docs (base search, no reasoning)                                          |
| sonar-reasoning                                                                                                             | perplexity  | yes                                     | effort_levels                                  | `reasoning_effort` = `minimal,low,medium,high`                                                                   | chat · `reasoning_effort`                                                                             | docs.perplexity.ai schema — doc-sourced (quota-blocked)                   |
| sonar-reasoning-pro                                                                                                         | perplexity  | yes                                     | effort_levels                                  | `reasoning_effort` = `minimal,low,medium,high`                                                                   | chat · `reasoning_effort`                                                                             | docs.perplexity.ai — doc-sourced                                          |
| sonar-deep-research                                                                                                         | perplexity  | yes                                     | effort_levels                                  | `reasoning_effort` = `minimal,low,medium,high`                                                                   | chat · `reasoning_effort`                                                                             | docs.perplexity.ai — doc-sourced                                          |
| sonar-pro                                                                                                                   | perplexity  | no (search)                             | none                                           | —                                                                                                                | —                                                                                                     | docs                                                                      |
| groq-llama-3.3-70b / 3.1-8b                                                                                                 | groq        | no                                      | none                                           | —                                                                                                                | —                                                                                                     | catalog (deprecated 2026-08-16); Llama 3.x non-reasoning                  |
| nvidia/nemotron-3-\*                                                                                                        | nvidia_nim  | no (models.json thinking:false)         | none                                           | —                                                                                                                | —                                                                                                     | catalog                                                                   |
| meta-llama/llama-3.3-70b:free                                                                                               | open_router | no                                      | none                                           | —                                                                                                                | —                                                                                                     | catalog                                                                   |
| mistralai/mistral-small-3.1-24b:free                                                                                        | open_router | no                                      | none                                           | —                                                                                                                | —                                                                                                     | catalog                                                                   |
| qwen/qwen3-coder:free                                                                                                       | open_router | no                                      | none                                           | —                                                                                                                | —                                                                                                     | catalog                                                                   |
| nvidia/llama-3.3-nemotron-super-49b:free                                                                                    | open_router | yes (thinking:true)                     | thinking_toggle                                | Nemotron reasoning on/off via system prompt (`detailed thinking on/off`)                                         | chat · system-prompt directive                                                                        | NVIDIA Nemotron docs — doc-sourced                                        |
| GPT-5.6 Sol/Terra/Luna                                                                                                      | openai      | ANNOUNCED (404 on our key)              | effort_levels + ultraMode                      | `none,low,medium,high,xhigh,max` (**adds `max`**); Ultra = multi-agent                                           | chat/responses · `reasoning_effort`; Ultra = Responses API multi-agent beta                           | openai.com/index/gpt-5-6 + **live 404**                                   |
| Image / video / TTS / STT (imagen-4*, veo-3, gpt-image-2, tts-1*, whisper-1, ideogram-2, stable-diffusion-xl, runway-gen-4) | various     | no                                      | none                                           | —                                                                                                                | —                                                                                                     | modality — never reasoning                                                |

---

## Per-provider effort model (prose)

### OpenAI — per-model discrete effort, enforced server-side

`reasoning_effort` on chat/completions (`reasoning.effort` on the Responses
API). Allowed set is **model-family-specific** and OpenAI rejects out-of-set
values with a 400 that enumerates the legal set:

- **GPT-5.5 / 5.4 family**: `none, low, medium, high, xhigh`. Default `medium`.
  Live-proven: `minimal` → 400, `max` → 400 with
  _"Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'."_
- **GPT-5 base family (gpt-5-nano)**: `minimal, low, medium, high` (has
  `minimal`, no `xhigh`).
- **GPT-5.6 (Sol/Terra/Luna)**: adds **`max`** on top of `xhigh` — the highest
  single-agent reasoning setting. Plus **Ultra mode** = OpenAI's multi-agent
  feature that spawns concurrent subagents and synthesizes them in one request;
  in the API this is the **multi-agent beta on the Responses API** (exact param
  name not yet published — mark UNKNOWN). Max ≠ Ultra: `max` deepens one agent's
  reasoning; `ultra` delegates across agents. **404 on our key today.**
- **Non-reasoning (gpt-4.1-nano)**: rejects `reasoning_effort` outright
  ("Unrecognized request argument"). Effort UI must be hidden.

The app already resolves this per-model in
`packages/llm-normalize/src/openai-reasoning-effort.ts`
(`resolveOpenAISupportedReasoningEfforts`), which the OpenAI adapters call. That
is the correct, authoritative path — see the `effort.ts` drift note below.

### Anthropic — new adaptive + `output_config.effort` (the headline drift)

Anthropic split into two API generations:

- **Newest (Opus 4.8/4.7, Sonnet 5)**: adaptive thinking + discrete effort.
  `thinking:{type:"adaptive"}` (no `budget_tokens` — `adaptive.budget_tokens`
  → 400 "Extra inputs are not permitted"), and effort via
  **`output_config.effort` ∈ {`low`,`medium`,`high`,`xhigh`,`max`}** (values
  enumerated by a live 400). The classic `thinking:{type:"enabled",
budget_tokens}` is **rejected with 400** on Opus 4.8. Effort may be sent
  independently of any `thinking` block.
- **Transitional (Sonnet 4.6, Opus 4.6)**: accept **both** the new
  `output_config.effort` and the legacy `enabled`+`budget_tokens` (live-proven
  both return 200). Docs recommend adaptive+effort going forward.
- **Legacy manual (Opus 4.5, Haiku 4.5)**: classic
  `thinking:{type:"enabled",budget_tokens:N}`. **Haiku 4.5 supports extended
  thinking** (live 200, `thinking_tokens:23`) — models.json marking it
  `thinking:false` is a bug (see flags).

Note Anthropic is the only provider whose top level is **`max`** (above
`xhigh`) — mirrors the app's `Effort` union `low|medium|high|xhigh|max`.

### Google Gemini — moved from token budget to discrete `thinking_level`

For Gemini **3.x** the current control is
`generationConfig.thinkingConfig.thinkingLevel` ∈ `minimal, low, medium, high`
(Gemini 3.5 Flash default `medium`). The **2.5-era `thinkingBudget` token
integer** is still accepted for backward compat (our live probe of
gemini-3.5-flash with `thinkingBudget:512` returned 200 with
`thoughtsTokenCount:61`), and `-1` = dynamic, `0` = off where the model allows
disabling (Flash-Lite is off by default). Go-forward: send `thinkingLevel` for
3.x, not a raw budget.

### xAI Grok — always-on reasoning, low/medium/high (version-dependent)

Docs (docs.x.ai) describe `reasoning_effort` ∈ `low, medium, high` (default
`high`) for **grok-4.5**, and note **reasoning cannot be disabled** on Grok
reasoning models (also: `presence_penalty`/`frequency_penalty`/`stop` are
incompatible). Our served id is **grok-4.3, which does not appear in the current
xAI docs**, and our key is stale — so grok-4.3's exact level set is **UNKNOWN**
(model-id itself may be stale; flagged separately).

### DeepSeek V4 — reasoning on by default, toggle + effort

`deepseek-v4-flash`/`-pro` emit `reasoning_tokens` on a plain request (live).
Docs: `deepseek-reasoner` = thinking mode, `deepseek-chat` = non-thinking mode
of v4-flash (deepseek-chat deprecates 2026-07-24); thinking is controllable via
`thinking:{type:"enabled"/"disabled"}` and `reasoning_effort`. Treat as hybrid:
default-on, disable via `thinking.disabled`, tune via `reasoning_effort`.

### Qwen3 — `enable_thinking` toggle + `thinking_budget` cap (hybrid, off by default)

Model Studio docs: qwen3-max/plus/flash/turbo are **hybrid, thinking disabled by
default**; set `enable_thinking:true` to reason and `thinking_budget` (token
integer, default = model max CoT) to cap. Reasoning-only variants
(`*-thinking-*`) are not in our served set. Key stale → doc-sourced.

### Moonshot Kimi — reasoning on by default

Kimi K2.6 returns `reasoning_content`/`reasoning_tokens` on a plain request
(live). Model list reports `supports_reasoning:true`. No effort-level knob
observed; treat as always_on/toggle.

### Zhipu GLM — `thinking:{type}` on/off, no levels

docs.z.ai: `thinking:{type:"enabled"|"disabled"}`, default `enabled`; no
`reasoning_effort`/budget. Key stale → doc-sourced.

### Mistral — `reasoning_effort` = `high|none` (two values), medium/small only

docs.mistral.ai: native Magistral models deprecated; reasoning now via
`mistral-small-latest` and `mistral-medium-3-5` with `reasoning_effort`
∈ `high`|`none`. **Mistral Large 3 reasoning is not documented** → catalog's
`modelType:"reasoning"` for mistral-large-3 is unverified. The adapter comment
"does not send reasoning_effort" is now outdated (see flags). No key → doc-sourced.

### Perplexity Sonar — `reasoning_effort` = minimal/low/medium/high

docs.perplexity.ai schema exposes `reasoning_effort` ∈
`minimal, low, medium, high`, applicable to the reasoning sonar models
(`sonar-reasoning`, `sonar-reasoning-pro`, `sonar-deep-research`). Base `sonar`
/ `sonar-pro` are search, not reasoning. Auth OK but quota-blocked → doc-sourced.

### Groq / OpenRouter / NVIDIA NIM — mostly non-reasoning Llama/Nemotron

Served Groq (Llama 3.x) and most OpenRouter/NIM entries are non-reasoning →
`none`. Exception: Nemotron reasoning variants toggle via a `detailed thinking
on/off` **system-prompt directive**, not a request param. No keys → doc-sourced.

---

## Proposed models.json capability schema

Add a single optional `reasoning` object per model (absent ⇒ `none`). This is
additive and backward-compatible; nothing reads it until the follow-up wave
wires it in. **Do not apply in this doc** — this is the proposed diff.

```jsonc
// Proposed per-model field (schema)
"reasoning": {
  "capable": true,                       // false ⇒ hide effort UI entirely
  "control": "effort_levels",            // none|always_on|thinking_toggle|thinking_budget|effort_levels
  "supportedEfforts": ["low","medium","high","xhigh","max"], // effort_levels only
  "defaultEffort": "medium",
  "canDisableThinking": true,            // false for always_on reasoners
  "thinkingBudget": { "min": 0, "max": 32768, "default": 8192 }, // thinking_budget only
  "ultraMode": false,                    // OpenAI GPT-5.6 multi-agent (Responses API beta)
  "request": {
    "api": "messages",                   // chat|responses|messages|gen
    "effortPath": "output_config.effort",// where the level string goes
    "togglePath": null,                  // e.g. "enable_thinking" or "thinking.type"
    "budgetPath": null                   // e.g. "thinking.budget_tokens" or "thinkingConfig.thinkingBudget"
  }
}
```

### Four worked examples (one per control-type)

```jsonc
// effort_levels — Anthropic Opus 4.8 (adaptive + output_config.effort; adds max)
"claude-opus-4.8": {
  "reasoning": {
    "capable": true,
    "control": "effort_levels",
    "supportedEfforts": ["low","medium","high","xhigh","max"],
    "defaultEffort": "high",
    "canDisableThinking": true,
    "ultraMode": false,
    "request": { "api": "messages", "effortPath": "output_config.effort",
                 "togglePath": "thinking.type", "budgetPath": null }
  }
}

// effort_levels — OpenAI GPT-5.5 (no minimal, no max)
"gpt-5.5": {
  "reasoning": {
    "capable": true,
    "control": "effort_levels",
    "supportedEfforts": ["none","low","medium","high","xhigh"],
    "defaultEffort": "medium",
    "canDisableThinking": true,
    "ultraMode": false,
    "request": { "api": "chat", "effortPath": "reasoning_effort",
                 "togglePath": null, "budgetPath": null }
  }
}

// thinking_budget — Anthropic Haiku 4.5 (classic enabled+budget)  [fixes thinking:false bug]
"claude-haiku-4.5": {
  "reasoning": {
    "capable": true,
    "control": "thinking_budget",
    "canDisableThinking": true,
    "thinkingBudget": { "min": 1024, "max": 32768, "default": 8192 },
    "ultraMode": false,
    "request": { "api": "messages", "effortPath": null,
                 "togglePath": "thinking.type", "budgetPath": "thinking.budget_tokens" }
  }
}

// thinking_toggle (+budget) — Qwen3 Max (hybrid, off by default)
"qwen-max": {
  "reasoning": {
    "capable": true,
    "control": "thinking_toggle",
    "canDisableThinking": true,
    "thinkingBudget": { "min": 0, "max": 38912, "default": 0 },
    "ultraMode": false,
    "request": { "api": "chat", "effortPath": null,
                 "togglePath": "enable_thinking", "budgetPath": "thinking_budget" }
  }
}
```

For `none` models (gpt-4.1-nano, sonar, codestral-2, all image/video/tts,
Groq/OpenRouter Llama, Nemotron non-reasoners) simply set
`"reasoning": { "capable": false, "control": "none" }` (or omit and let absent ⇒
`none`).

---

## UI adaptation spec (model-picker effort flyout)

Drive the flyout off `model.reasoning.control`. Reference points: **claude.ai**
surfaces effort as a small set of named chips (not a raw slider);
the **OpenAI Playground** shows a `reasoning_effort` dropdown limited to the
model's legal set and hides it for non-reasoning models.

| control                    | Flyout rendering                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `none` / `capable:false`   | **Render nothing.** No effort affordance, no disabled control — hide entirely.                                                                                                                                                             |
| `always_on` (no levels)    | Static "Reasoning: always on" label, no toggle. Optionally a non-interactive badge.                                                                                                                                                        |
| `thinking_toggle`          | A single **on/off switch** ("Extended thinking"). If also `thinkingBudget`, reveal a budget control only when on.                                                                                                                          |
| `thinking_budget`          | **Budget control** — either a slider (min→max, default marked) or, preferred for parity, map the app's `low/medium/high/xhigh/max` chips to preset budgets and send the mapped integer. Include an "off" position if `canDisableThinking`. |
| `effort_levels`            | **Chip row rendered from `supportedEfforts` only** — never show `minimal`/`max`/`xhigh` for a model that lacks them. Default-select `defaultEffort`. This is the fix for the current "xhigh for everyone" behavior.                        |
| `ultraMode:true` (GPT-5.6) | Add a separate **"Ultra (multi-agent)" toggle** distinct from the effort chips, since Ultra is orthogonal to `max`. Gate behind availability; today it 404s.                                                                               |

Key rule: the chip set is **per-model**, sourced from `supportedEfforts`, not a
global `low/medium/high/xhigh/max`. The app's UI `Effort` union stays the
super-set vocabulary; the picker intersects it with the model's allowed set and
maps to the provider's request param via `model.reasoning.request`.

---

## Flags: where the CURRENT implementation is wrong

1. **`packages/types/src/design-system/effort.ts` is stale AND dead.**
   `effortToProviderParams()` has **no callers** (grep-confirmed) but is exported
   from `design-system/index.ts`, so desktop/mobile/cli could pick it up. It is
   wrong in three ways: (a) emits Anthropic `thinking:{type:"enabled",
budget_tokens}` — **which now 400s on Opus 4.8**; (b) caps OpenAI at `xhigh`
   with no per-model set and no `minimal`/`max`; (c) returns `null` for every
   provider except anthropic/openai/google. The live web path does NOT use it —
   it uses `request-processor.ts` + `openai-reasoning-effort.ts`. Recommend
   deleting or rewriting `effort.ts` against this matrix in the follow-up wave.
   **(latent, not live — no web caller today).**

2. **`claude-haiku-4.5` `capabilities.thinking:false` is wrong.** Live probe:
   Haiku 4.5 returns `thinking_tokens` with `thinking:{type:"enabled",
budget_tokens}`. Because `modelSupportsEffort()` / `anthropicUsesAdaptive
Thinking()` in `request-processor.ts` key off this flag, Haiku thinking is
   currently **suppressed**. Set `thinking:true` and `control:thinking_budget`.

3. **Anthropic Opus 4.8 request path — verify, likely already correct.**
   `request-processor.ts:212 anthropicUsesAdaptiveThinking()` returns adaptive
   for any thinking-capable Anthropic model, so Opus 4.8 gets
   `thinking:{type:"adaptive"}` + `output_config.effort` (correct). But the
   guard keys off `getModelMetadataById(model)` — confirm the incoming `model`
   is the catalog id (`claude-opus-4.8`), not the apiModelId
   (`claude-opus-4-8`); if the lookup misses, it would fall through to
   `enabled`+`budget_tokens` and **400 live**. Add a test with the exact id the
   route receives.

4. **Gemini path sends legacy `thinkingBudget`.** `canonical-request.ts` /
   `effort.ts` map effort → `thinkingConfig.thinkingBudget` (token integer).
   Gemini 3.x's current control is `thinkingLevel` (minimal/low/medium/high).
   Budget still works (live 200) but is legacy; migrate to `thinkingLevel` for
   3.x models.

5. **Mistral adapter comment is outdated.** `packages/providers/mistral/src/
index.ts` says "does not send reasoning_effort (no OpenAI-style reasoning-
   effort knob)". Docs show `mistral-small`/`mistral-medium-3-5` support
   `reasoning_effort` ∈ `high|none`. Also `mistral-large-3`'s
   `modelType:"reasoning"` is doc-unverified (large not in the reasoning docs) —
   mark UNKNOWN pending a live key.

6. **`grok-4.3` is not in current xAI docs.** Docs reference grok-4.5 /
   grok-4.20-multi-agent. Combined with the stale xAI key, grok-4.3's effort set
   AND the model id itself need live re-verification (out of scope here; flagged
   for the model-catalog wave).

7. **GPT-5.6 family remains 404 on our key** (Sol/Terra/Luna/bare) — keep out of
   the selectable catalog. When provisioned, it introduces `max` effort and
   Ultra multi-agent mode (Responses API beta) per the schema above.

---

## Sources

- OpenAI reasoning guide — https://developers.openai.com/api/docs/guides/reasoning ; GPT-5.6 — https://openai.com/index/gpt-5-6/ ; live curl to api.openai.com/v1/chat/completions (2026-07-10).
- Anthropic extended thinking — https://platform.claude.com/docs/en/build-with-claude/extended-thinking ; live curl to api.anthropic.com/v1/messages (2026-07-10).
- Google Gemini thinking — https://ai.google.dev/gemini-api/docs/thinking ; live curl to generativelanguage.googleapis.com (2026-07-10).
- xAI reasoning — https://docs.x.ai/docs/guides/reasoning (key stale).
- DeepSeek reasoning — https://api-docs.deepseek.com/guides/reasoning_model ; live curl to api.deepseek.com (2026-07-10).
- Qwen / Model Studio deep thinking — https://www.alibabacloud.com/help/en/model-studio/deep-thinking (key stale).
- Zhipu GLM — https://docs.z.ai/guides/llm/glm-4.6 (key stale).
- Mistral reasoning — https://docs.mistral.ai/capabilities/reasoning/ (no key).
- Perplexity — https://docs.perplexity.ai/api-reference/chat-completions-post (quota-blocked).
- Moonshot — live curl to api.moonshot.ai/v1 (2026-07-10).
- App code: `packages/llm-normalize/src/openai-reasoning-effort.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts`, `apps/web/lib/ai-sdk/providers.ts`, `packages/providers/anthropic/src/translate.ts`, `packages/types/src/design-system/effort.ts`.

---

# Addendum A — "Coming soon" / grayed-out availability (founder req, 2026-07-10)

Requirement: announced-but-inaccessible models (our key 404s on them today) must
**appear in the picker as a grayed-out "Coming soon" row that is NOT selectable
and NEVER routable/callable**, and must auto-flip to live when the provider
provisions them. GPT-5.6 Sol/Terra/Luna are the first users.

## Why a NEW field, not `status`

The existing catalog filter in `packages/types/src/model-catalog.ts`
(`MANUAL_OVERRIDE_MODEL_IDS`, lines ~577-588) **removes** any model with
`deprecated:true`, `status:"deprecated"`, or `status:"experimental"` from the
picker entirely. Reusing `status` for coming-soon would therefore **hide** the
row — the opposite of what's wanted. So coming-soon needs a separate axis:
`availability`, which controls _selectability_, not _visibility_.

## Proposed field

```jsonc
// Per-model, additive. Absent ⇒ "live".
"availability": "live" | "coming_soon" | "unavailable",
"unavailableReason": "Announced 2026-07-09; not yet provisioned on our API key (404).",
"expectedLiveDate": "2026-07-15"   // optional, display-only ("Coming soon · ~Jul 15")
```

Semantics:

- **`live`** (default): normal — selectable, routable, tier-gated as usual.
- **`coming_soon`**: **shown** in the picker as a disabled row, **not
  selectable**, **excluded from every routable/tier set** (see invariants). This
  is the fake-availability-safe state: it is visibly "not yet here", and the
  request path can never send it to a provider.
- **`unavailable`**: shown but disabled with a hard reason (e.g. region-blocked);
  same non-routable guarantees. (Optional third state; `coming_soon` is the one
  needed now.)

Auto-flip to live: `availability` is the ONLY thing to change (drop the field or
set `"live"`) once a live probe returns 200 — no other edits. Recommend the
follow-up wave gate the flip behind the existing live-probe verification
(same discipline as the 2026-07-10 gpt-5.6 correction): **do not set `live`
until a real 200 is observed on our key.**

## Invariants the follow-up wave MUST enforce (guardrail)

A `coming_soon`/`unavailable` model id must NOT appear in any of:

- `tierAllowedModels.{economy,pro_additions,flagship_additions}`
- `modelPresets.<provider>` selectable lists (or if present, the picker must
  render them disabled — prefer simply omitting from presets and sourcing the
  disabled row from the catalog)
- `SLOT_REGISTRY` / `taskRouting` / any auto-routing pool
- provider `defaultModel`

Add a `pnpm check:*` invariant: `∀ model where availability≠"live" ⇒ id ∉
(tierAllowedModels ∪ SLOT_REGISTRY ∪ taskRouting ∪ defaultModel)`. This makes
"announced but non-routable" a checked property, not a convention.

## Catalog wiring change (design, not code)

Split the current single selectable list into two derived sets:

- `getDisplayModels()` = non-deprecated models **including** `coming_soon`
  (drives the picker list / ordering).
- `getSelectableModels()` = `getDisplayModels()` filtered to
  `availability === "live"` **and** environment-selectable
  (`isModelSelectableInEnvironment`). Drives what can actually be picked/sent.

The picker maps over `getDisplayModels()`; rows failing `getSelectableModels()`
render disabled.

## Model-picker UI treatment (exact)

| Aspect          | Treatment                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Row             | Rendered but **grayed** (reduced opacity, muted text token), below the live models of that provider group              |
| Badge           | Small **"Coming soon"** pill (use `expectedLiveDate` → "Coming soon · ~Jul 15" when present)                           |
| Interaction     | **Non-clickable / non-focusable for selection**; `aria-disabled="true"`, pointer-events none on the select affordance  |
| Tooltip / hover | Show `unavailableReason` (e.g. "Announced Jul 9; not yet available on your plan")                                      |
| Keyboard        | Skipped by arrow-key selection traversal (present for screen-reader listing with disabled state)                       |
| Effort flyout   | Not shown (model isn't selectable); when it flips live, effort UI derives from its `reasoning` block per Addendum-none |

## Proposed diff — add GPT-5.6 family as `coming_soon`

Add three model entries (full specs from the founder + the 2026-07-09 research),
each `availability:"coming_soon"`, each with the `reasoning` block (adds `max` +
`ultraMode`), and each **kept out of tierAllowedModels / modelPresets /
SLOT_REGISTRY**. Do NOT apply here.

```jsonc
"gpt-5.6-sol": {
  "id": "gpt-5.6-sol",
  "apiModelId": "gpt-5.6-sol",          // bare "gpt-5.6" also routes to Sol per the model page
  "name": "GPT-5.6 Sol",
  "provider": "openai",
  "modelType": "reasoning",
  "availability": "coming_soon",
  "unavailableReason": "GA announced 2026-07-09; live curl to api.openai.com returns 404 on our key (2026-07-10).",
  "contextWindow": 1050000,
  "maxOutputTokens": 128000,
  "inputCost": 5, "cached_input": 0.5, "outputCost": 30,
  "capabilities": { "streaming": true, "tools": true, "vision": true, "json": true,
    "thinking": true, "computerUse": true, "agentic": true, "imageGen": false,
    "videoGen": false, "search": false, "research": false, "codeExecution": true, "caching": true },
  "reasoning": {
    "capable": true, "control": "effort_levels",
    "supportedEfforts": ["none","low","medium","high","xhigh","max"],
    "defaultEffort": "medium", "canDisableThinking": true, "ultraMode": true,
    "request": { "api": "chat", "effortPath": "reasoning_effort", "togglePath": null, "budgetPath": null }
  },
  "released": "July 2026", "deprecation_date": null,
  "cachePolicy": { "writeMultiplier": 1.25, "readDiscount": 0.9, "minCacheLifeMin": 30, "explicitBreakpoints": true },
  "reasoningDots": 6                     // capability hint from the OpenAI compare page (Sol 6 / Terra 4 / Luna 3)
},
"gpt-5.6-terra": {
  "id": "gpt-5.6-terra", "apiModelId": "gpt-5.6-terra", "name": "GPT-5.6 Terra",
  "provider": "openai", "modelType": "reasoning",
  "availability": "coming_soon",
  "unavailableReason": "GA announced 2026-07-09; 404 on our key (2026-07-10).",
  "contextWindow": 1050000, "maxOutputTokens": 128000,
  "inputCost": 2.5, "cached_input": 0.25, "outputCost": 15,
  "capabilities": { "streaming": true, "tools": true, "vision": true, "json": true,
    "thinking": true, "computerUse": true, "agentic": true, "imageGen": false,
    "videoGen": false, "search": false, "research": false, "codeExecution": true, "caching": true },
  "reasoning": {
    "capable": true, "control": "effort_levels",
    "supportedEfforts": ["none","low","medium","high","xhigh","max"],
    "defaultEffort": "medium", "canDisableThinking": true, "ultraMode": true,
    "request": { "api": "chat", "effortPath": "reasoning_effort", "togglePath": null, "budgetPath": null }
  },
  "released": "July 2026", "deprecation_date": null, "reasoningDots": 4
},
"gpt-5.6-luna": {
  "id": "gpt-5.6-luna", "apiModelId": "gpt-5.6-luna", "name": "GPT-5.6 Luna",
  "provider": "openai", "modelType": "reasoning",
  "availability": "coming_soon",
  "unavailableReason": "GA announced 2026-07-09; 404 on our key (2026-07-10).",
  "contextWindow": 1050000, "maxOutputTokens": 128000,
  "inputCost": 1, "cached_input": 0.1, "outputCost": 6,
  "capabilities": { "streaming": true, "tools": true, "vision": true, "json": true,
    "thinking": true, "computerUse": true, "agentic": true, "imageGen": false,
    "videoGen": false, "search": false, "research": false, "codeExecution": true, "caching": true },
  "reasoning": {
    "capable": true, "control": "effort_levels",
    "supportedEfforts": ["none","low","medium","high","xhigh","max"],
    "defaultEffort": "medium", "canDisableThinking": true, "ultraMode": true,
    "request": { "api": "chat", "effortPath": "reasoning_effort", "togglePath": null, "budgetPath": null }
  },
  "released": "July 2026", "deprecation_date": null, "reasoningDots": 3
}
```

Notes: metadata (ctx 1,050,000; max output 128K; cutoff 2026-02-16; pricing;
cache write 1.25× / read −90% / 30-min min life / explicit breakpoints; endpoints
chat/completions + responses + batch; streaming, function calling, structured
outputs, image input) is carried from the 2026-07-09 research. **All three are
`coming_soon` because they 404 on our key today** — they must not be routable
until a real 200 is observed. Add `gpt-5.6-*` to the OpenAI `modelPrefixes`
already covered by `gpt-`; no provider-map change needed.

---

# Addendum C — GPT-5.6 exact API surfaces (from official docs, 2026-07-10)

Sourced by WebFetch of `developers.openai.com/api/docs/guides/latest-model`,
`.../guides/tools-multi-agent`, `.../guides/tools-programmatic-tool-calling`, and
the `gpt-5.6-sol` model page — exact param names, not OCR. These resolve the
UNKNOWNs previously flagged (Ultra mode, Pro mode, persistent reasoning,
programmatic tool calling). They are for the AT-GA implementation wave; today the
models still 404 on our key, so everything below is inert until `availability`
flips to `live`.

## Confirmed exact params

| Feature                       | Exact param                                                                     | Values / shape                                                                               | Endpoint               | Notes                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reasoning effort              | `reasoning.effort` (Responses) / `reasoning_effort` (chat)                      | `none, low, medium, high, xhigh, max` — **`max` is above `xhigh`** (highest, quality-first)  | **chat + responses**   | GPT-5.5 tops at `xhigh`; 5.6 adds `max`                                                                                                                                                                                                                                                                                                                  |
| **Ultra mode** (multi-agent)  | **`multi_agent.enabled`** (bool) + `multi_agent.max_concurrent_subagents` (int) | root agent spawns a subagent tree                                                            | **Responses API ONLY** | **Beta-gated: `betas:["responses_multi_agent=v1"]`** (HTTP/SDK `client.beta.responses`) or `OpenAI-Beta: responses_multi_agent=v1` (WS). Response items: `multi_agent_call`, `multi_agent_call_output`, `agent_message`. Guide says **all GPT-5.6 models** eligible (sol shown in examples) — NOT documented as sol-only                                 |
| **Pro mode**                  | **`reasoning.mode: "pro"`**                                                     | single value `pro`                                                                           | **Responses API ONLY** | deeper single-agent reasoning                                                                                                                                                                                                                                                                                                                            |
| **Persistent reasoning**      | **`reasoning.context`**                                                         | `auto, all_turns, current_turn`                                                              | **Responses API ONLY** | + `previous_response_id` for continuation; for ZDR/`store:false` add `include:["reasoning.encrypted_content"]`                                                                                                                                                                                                                                           |
| **Programmatic tool calling** | tool `{ "type": "programmatic_tool_calling" }` + per-tool **`allowed_callers`** | `allowed_callers`: `["programmatic"]` \| `["direct","programmatic"]` \| default `["direct"]` | **Responses API ONLY** | Model emits JS (isolated V8, top-level await, no Node/fs/network). Response items: `program` (JS, `call_id`+`fingerprint`), `function_call` (has `caller` linking to parent program), `program_output` (`status: completed\|incomplete`). Opt-in is `allowed_callers`, NOT `allowed_tools` (`allowed_tools` is the separate Responses tool-subset param) |
| Original image input          | `detail: "original"` (also `"auto"`)                                            | preserves original image dimensions                                                          | chat + responses       | image-input detail level                                                                                                                                                                                                                                                                                                                                 |

**Endpoint split** — Responses-API-ONLY: Ultra (`multi_agent`), Pro
(`reasoning.mode`), persistent reasoning (`reasoning.context`), programmatic tool
calling. Available on BOTH chat/completions and Responses: `reasoning_effort`,
function calling, structured outputs, image `detail`. Supported endpoints for the
models: `v1/chat/completions`, `v1/responses`, `v1/batch`.

**Still unpublished / not found:** no dated snapshot ids for 5.6 (do not invent);
the programmatic-tool-calling guide's full error-handling shape and multi-agent
per-subagent config schema are summarized on the guides but not exhaustively
specified — treat the item-type names above as authoritative and fetch the guide
again at implementation time for edge fields.

## Enriched schema fields for the coming-soon 5.6 entries

Extend each `gpt-5.6-*` entry's `reasoning`/capabilities blocks with the exact
paths below (shown for Sol; Terra/Luna are identical in capability — they differ
only in price and `reasoningDots`). Replaces the placeholder `ultraMode:true`
with a full, implementable surface.

```jsonc
"reasoning": {
  "capable": true,
  "control": "effort_levels",
  "supportedEfforts": ["none","low","medium","high","xhigh","max"], // max = highest, above xhigh
  "defaultEffort": "medium",
  "canDisableThinking": true,                 // effort "none"
  "request": { "api": "chat", "effortPath": "reasoning_effort",       // chat/completions
               "responsesEffortPath": "reasoning.effort" },           // Responses API
  "ultraMode": {                              // Responses API only, beta-gated
    "enabled": false,
    "param": "multi_agent.enabled",
    "concurrencyParam": "multi_agent.max_concurrent_subagents",
    "beta": "responses_multi_agent=v1",
    "endpoint": "responses",
    "responseItems": ["multi_agent_call","multi_agent_call_output","agent_message"]
  },
  "proMode": {                                // Responses API only
    "param": "reasoning.mode", "value": "pro", "endpoint": "responses"
  },
  "persistentReasoning": {                    // Responses API only
    "param": "reasoning.context",
    "values": ["auto","all_turns","current_turn"],
    "continuationParam": "previous_response_id",
    "zdrInclude": ["reasoning.encrypted_content"],
    "endpoint": "responses"
  }
},
"toolCalling": {
  "programmatic": {                           // Responses API only
    "toolType": "programmatic_tool_calling",
    "optInParam": "allowed_callers",          // NOT allowed_tools
    "optInValues": ["direct","programmatic"],
    "runtime": "javascript-v8-isolated",      // top-level await; no node/fs/network
    "responseItems": ["program","function_call(caller)","program_output"],
    "endpoint": "responses"
  }
},
"imageInput": { "detailValues": ["auto","original"] },  // "original" preserves dimensions
"endpoints": ["v1/chat/completions","v1/responses","v1/batch"]
```

**UI implication (extends Addendum A):** when 5.6 goes live, the effort chip row
gains `max`; Ultra/Pro/persistent-reasoning/programmatic-tool-calling are
**Responses-API-only** capabilities — surface Ultra and Pro as separate toggles
(not effort chips), and gate them on the request going through the Responses path
(our current web chat route uses chat/completions; using these four features
requires routing 5.6 through Responses + the multi-agent beta header). Flag this
as an implementation dependency for the AT-GA wave.

---

# Addendum B — Tier / roadmap policy (post-GA newest→Pro+, retained cheap→Free/Basic)

Requirement to encode (for the implementation wave; **do not apply the GA
transform now — pre-GA we keep all cheap/budget models available for testing**):

- Post-GA, newest-generation models serve **Pro+** tiers (Pro / Max /
  Enterprise).
- Each provider's retained **cheapest older** model serves **Free + Basic**.
- On GPT-5.6 GA, remove old 5.5/5.4-family models from the **Pro+ selectable
  set**, EXCEPT the single cheapest older model per provider, which stays to
  serve Free/Basic.

## How to express it in `tierAllowedModels`

The catalog already has the right shape: `tierAllowedModels.economy` (Free/Basic
floor), `.pro_additions` (adds at Pro), `.flagship_additions` (adds at
Max/Enterprise). Tier membership is **cumulative** (Pro = economy + pro_additions;
Max = + flagship_additions). Encode the policy as:

1. **Free/Basic keep the retained cheap model** → it lives in `economy` (already
   the case for the budget models). Mark the ONE retained-per-provider model with
   a per-model hint so the GA transform knows which to keep:
   ```jsonc
   "tierPolicy": {
     "budgetFloorFor": ["free","basic"],   // this is the retained cheap model
     "retainOnNextGenGA": true             // survives the GA prune
   }
   ```
2. **New-gen models are Pro+** → they go in `pro_additions` (and
   `flagship_additions` for the top model), and are **absent from `economy`**:
   ```jsonc
   "tierPolicy": { "minTier": "pro" }      // never offered to Free/Basic
   ```
3. **Old flagships pruned at GA** → mark them so the transform removes them from
   `pro_additions`/`flagship_additions` on the GA date, without deleting the
   catalog entry (kept for history/legacy sessions):
   ```jsonc
   "tierPolicy": { "retireFromSelectableOn": "gpt-5.6-ga", "keepForBudgetTier": false }
   ```

`tierPolicy.minTier` (`free|basic|pro|max|enterprise`) is the single declarative
knob; `tierAllowedModels` remains the compiled/derived result. Recommended: make
`tierAllowedModels` **derivable** from per-model `tierPolicy.minTier` so the two
can't drift — a build step emits the three buckets, and a check asserts every
selectable model has a `minTier`.

## Worked example — at GPT-5.6 GA (illustrative; NOT applied now)

| Provider       | Free/Basic (retained cheap)                                                         | Pro+ (new-gen)                                          | Pruned from Pro+ at GA                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI         | `gpt-4.1-nano` or `gpt-5-nano` (`budgetFloorFor:[free,basic]`, `retainOnNextGenGA`) | `gpt-5.6-luna/terra/sol` (`minTier:pro`)                | `gpt-5.5`, `gpt-5.4-mini` (`retireFromSelectableOn:"gpt-5.6-ga"`) — but keep ONE cheapest if it's the provider's Free/Basic floor |
| Anthropic      | `claude-haiku-4.5` (budget floor)                                                   | `claude-opus-4.8` (flagship), `claude-sonnet-4.6` (pro) | prior-gen opus/sonnet when superseded                                                                                             |
| Google         | `gemini-3.1-flash-lite` (budget floor)                                              | `gemini-3.5-flash`, `gemini-3.1-pro-preview`            | prior-gen when superseded                                                                                                         |
| (per provider) | one cheapest retained                                                               | newest generation                                       | superseded older non-floor models                                                                                                 |

## Sequencing with Addendum A

- **Now (pre-GA)**: GPT-5.6 entries are `availability:"coming_soon"` (Addendum A)
  → not selectable, not in any tier set regardless of `tierPolicy`. All existing
  cheap/budget models stay live and available for testing. `tierPolicy` can be
  authored now (inert until GA).
- **At GA (separate verified wave)**: live probe returns 200 → flip GPT-5.6 to
  `availability:"live"`; run the `tierPolicy` GA transform (new-gen → Pro+; prune
  old flagships from Pro+; retain each provider's cheapest for Free/Basic). The
  availability guardrail (Addendum A) and the `minTier` derivation (Addendum B)
  together guarantee nothing is offered or routed to the wrong tier or before
  it's real.
