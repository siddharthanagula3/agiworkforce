---
id: "PLAN-cli-079"
type: "test-plan"
title: "CLI · 79. Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "79"
---
# CLI · 79. Routing and model-neutral orchestration

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S79.01 Automatic model selection.

- **Expected:** Auto picks a model per request from the registry for the task, plan and constraints.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:458 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:552 (quoted code not found in the file now); crates/agiworkforce-model-registry/src/lib.rs:1056
- **Where to find it:** agi, then /route (then /route auto) (labels found in the code)
- **Needs:** a signed-in managed cloud account and session saving on (not the default for --no-session-persistence)
- **Steps:**
  1. Start the CLI with agi and sign in to a managed cloud account.
  2. Type /model and pick a managed cloud model, so the session runs in Managed mode.
  3. Type /route with no argument and read the Routing and Profiles lines.
  4. Type /route auto, then send a normal prompt and look for the model named in the Auto route notice or the Routing set to message, to compare with Expected.

## S79.02 User-selected model.

- **Expected:** The user can pick a specific model and the request runs on it.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:190; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now)
- **Where to find it:** /model (picker), or agi --model <name> (labels found in the code)
- **Steps:**
  1. Type /model in the chat to open the model picker.
  2. Pick a model row and press Enter.
  3. Type a message and check the reply and the model shown in the status or banner.
  4. Compare with Expected: the request should run on the chosen model.

## S79.04 Task-specific model profile.

- **Expected:** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:458 (quoted code not found in the file now); apps/cli/src/routing/classify.rs:1; crates/agiworkforce-model-registry/src/lib.rs:1056
- **Where to find it:** /route quality (labels found in the code)
- **Needs:** a signed-in managed cloud account and session saving on
- **Steps:**
  1. Start with a managed cloud account and session saving on, as in S79.01.
  2. Type /route quality.
  3. Read the line Routing set to ... for the quality profile; the label comes from the server catalog.
  4. Send a coding or reasoning prompt and check the model named in the reply or notice.

## S79.05 Speed-first profile.

- **Expected:** A speed-first routing profile can be applied that prefers the fastest eligible route.
- **Code:** done. Evidence present: apps/cli/src/agent/mod.rs:2268; apps/cli/src/routing/profile.rs:27; apps/cli/src/claude_parity.rs:191
- **Where to find it:** /route speed (labels found in the code)
- **Needs:** a signed-in managed cloud account and session saving on
- **Steps:**
  1. Start with a managed cloud account and session saving on.
  2. Type /route speed.
  3. Read the Routing set to message, which shows the speed profile label from the server.
  4. Send a prompt and compare the response speed and model with Expected.

## S79.06 Quality-first profile.

- **Expected:** A quality-first routing profile can be applied that prefers the most capable eligible route.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:2268; apps/cli/src/agent/mod.rs:1866 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:2233
- **Where to find it:** /route quality (labels found in the code)
- **Needs:** a signed-in managed cloud account and session saving on
- **Steps:**
  1. Start with a managed cloud account and session saving on.
  2. Type /route quality.
  3. Read the Routing set to message.
  4. Send a prompt and compare the chosen model with Expected.

## S79.07 Cost-first profile.

- **Expected:** A cost-first routing profile can be applied that prefers the cheapest eligible route.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:458 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:552 (quoted code not found in the file now)
- **Where to find it:** /route cost (labels found in the code)
- **Needs:** a signed-in managed cloud account and session saving on
- **Steps:**
  1. Start with a managed cloud account and session saving on.
  2. Type /route cost.
  3. Read the Routing set to message.
  4. Send a prompt and compare the chosen model with Expected.

## S79.08 Privacy-first profile.

- **Expected:** A privacy-first profile keeps requests on local models or zero-retention routes.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2617; apps/cli/src/lib.rs:1638 (quoted code not found in the file now)
- **Where to find it:** /privacy-mode local (or /privacy-settings to view) (labels found in the code)
- **Steps:**
  1. Type /privacy-settings and read the current mode and its description.
  2. Type /privacy-mode local.
  3. Type /privacy-settings again and confirm the mode is local.
  4. Send a prompt and check that no cloud model name appears as the route, to compare with Expected.

## S79.09 Classification of task intent.

- **Expected:** Each request's task intent is classified and used for routing.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:184; apps/cli/src/routing/classify.rs:1
- **Where to find it:** no screen of its own. The intent classification itself has no control; the notice appears only when the chosen model changes.
- **Needs:** a signed-in managed cloud account with /route auto set
- **Steps:**
  1. Use a managed cloud Auto session (/route auto) and send a coding question, then a plain chat question.
  2. Look for an Auto route: notice in the chat when the model changes between the two messages.

## S79.10 Classification of required tools.

- **Expected:** Which tools a request needs (research, agentic work, code execution) changes the routing task.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:896; apps/cli/src/agent/chat.rs:902; apps/cli/src/agent/chat.rs:2725; apps/cli/src/models/streaming.rs:541; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2705
- **Where to find it:** no screen of its own. No separate control exists; the tool classification is applied to the request without a visible setting.
- **Needs:** a signed-in managed cloud account with /route auto set
- **Steps:**
  1. In a managed Auto session, ask for a task that needs tools (for example a file or search action).
  2. Look for an Auto route: notice in the chat, and compare the model with a plain chat question.

## S79.11 Classification of required modalities.

- **Expected:** Attached images/video route the request to a multimodal-capable model.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:184; apps/cli/src/routing/classify.rs:713
- **Where to find it:** no screen of its own. The routing rule is in the classifier; no screen names image routing directly.
- **Needs:** a signed-in managed cloud account with /route auto set, and an image file to attach
- **Steps:**
  1. In a managed Auto session, attach an image and ask a question about it.
  2. Look for an Auto route: notice showing a different model than for a text-only question.

## S79.12 Complexity/effort classification.

- **Expected:** Requests are classified by complexity so routing can set a quality floor or effort.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:921; apps/cli/src/agent/chat.rs:2236; apps/cli/src/models/streaming.rs:916; crates/agiworkforce-llm/src/stream.rs:844; packages/ai/routing/src/task-family.ts:173; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4769
- **Where to find it:** no screen of its own. Effort classification is not shown as its own control.
- **Needs:** a signed-in managed cloud account with /route auto set
- **Steps:**
  1. In a managed Auto session, send a simple greeting, then a long multi-step analysis request.
  2. Compare the model named by any Auto route notice with Expected: the harder request should not drop to a weaker model.

## S79.13 Source-freshness classification.

- **Expected:** Requests needing current information are detected and routed to search-capable handling.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:981
- **Where to find it:** no screen of its own. No separate freshness control was found; the search step itself is not confirmed on screen.
- **Needs:** a signed-in managed cloud account with /route auto set
- **Steps:**
  1. In a managed Auto session, ask for today's news or a current price.
  2. Look for an Auto route: notice or a search-related reply, and compare with Expected.

## S79.14 Model eligibility filtering.

- **Expected:** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:184; crates/agiworkforce-model-registry/src/lib.rs:1056
- **Where to find it:** no screen of its own. The lock annotation text was not found as a visible string; only a code comment describes it.
- **Needs:** a Free account (so some models are locked)
- **Steps:**
  1. Type /model to open the picker.
  2. Look for model rows marked as locked or unavailable for the current plan, and compare with Expected: they are listed but cannot be used.

## S79.15 Provider-route selection.

- **Expected:** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); packages/ai/routing/src/auto.ts:1425
- **Where to find it:** no screen of its own. The route ranking lives in the server-side auto routing; the visible output shows only provider and model.
- **Needs:** a signed-in managed cloud account with /route auto set
- **Steps:**
  1. Run an Auto session and send a prompt.
  2. Look for the Auto route notice, which names the provider and model used.

## S79.16 Exact-model lock.

- **Expected:** An explicitly chosen model is never silently swapped for another model.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:190; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Fallback chains from -m a,b,c can still move a request to another model when the primary fails (see S79.20).
- **Steps:**
  1. Type /model and pick one specific model, then type a message.
  2. Look for the Switched to line and check that no Auto route notice names a different model.

## S79.17 Provider lock.

- **Expected:** The user can lock requests to one provider for the chosen model.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:194; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now)
- **Where to find it:** agi --provider <name> (labels found in the code)
- **Needs:** credentials for the chosen provider, or a local Ollama install for ollama
- **Steps:**
  1. Start the CLI with agi --provider anthropic (or openai, google, ollama) plus --model for a model on that provider.
  2. Type a prompt.
  3. Check the banner line showing the model and provider, and compare with Expected.

## S79.19 Quota-aware selection.

- **Expected:** Routing takes the user's remaining budget into account when choosing a route.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4634
- **Where to find it:** no screen of its own. The budget-aware route choice is applied on the server; the code path was not confirmed from the CLI side.
- **Needs:** a signed-in account with some usage
- **Steps:**
  1. Check your remaining usage with /usage or agi usage.
  2. Send a prompt in an Auto session and compare the model with Expected.

## S79.20 Health-aware fallback.

- **Expected:** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:329; apps/cli/src/routing/fallback.rs:1
- **Where to find it:** agi --fallback-model <model>, then /fallback (labels found in the code)
- **Steps:**
  1. Start the CLI with agi --fallback-model <model> (or -m primary,backup).
  2. Type /fallback and read the Fallback chain line.
  3. Compare with Expected: when the primary fails, the reply names the backup model.

## S79.21 Explicit model-switch offer.

- **Expected:** When another model would work better, the user is offered an explicit one-click switch.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:646; apps/cli/src/errors.rs:675
- **Where to find it:** Shown in the error text when a model is unavailable, for example: Switch to ... with /model <name> (labels found in the code)
- **Needs:** a Free account (a model outside the plan)
- **Steps:**
  1. Choose a model your plan does not include, such as one the error names as unavailable.
  2. Read the error text that appears in the chat.
  3. Compare with Expected: the text suggests a switch command, which you type yourself.

## S79.23 Specialist worker selection.

- **Expected:** Work is delegated to specialist workers that can use their own models.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:30; apps/cli/src/agents.rs:99
- **Where to find it:** /agents (labels found in the code)
- **Steps:**
  1. Type /agents and read the list of agents.
  2. Open an agent definition that has a model field, or run a task that uses that agent.
  3. Compare the model shown for that agent with Expected: the worker should use its own model.

## S79.26 User-visible routing explanation.

- **Expected:** The user can see why Auto chose (or moved to) a model.
- **Code:** done. Evidence moved: apps/cli/src/agent/chat.rs:726; apps/cli/src/agent/chat.rs:552 (quoted code not found in the file now)
- **Where to find it:** /route auto, then send a prompt and read the Auto route notice (labels found in the code)
- **Needs:** a signed-in managed cloud account and session saving on
- **Steps:**
  1. Start with a managed cloud account and session saving on.
  2. Type /route auto.
  3. Send prompts of different kinds (a coding question, then a plain chat question).
  4. Look for the Auto route: notice that names the route when the model changes, and compare with Expected.

## S79.27 Actual-model attribution.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence moved: apps/cli/src/agent/chat.rs:726; apps/cli/src/agent/chat.rs:552 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The banner at startup shows the model and provider (apps/cli/src/output.rs), and the Auto route notice names the model on change; no per-answer model label was found.

## S79.28 Routing-policy versioning.

- **Expected:** Routing policies are versioned and each decision can be traced to the policy version that made it.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/session.rs:405
- **Where to find it:** not found in the code. The routing policy version is stored with the saved session (apps/cli/src/platform/runtime/session.rs), but no screen or command that displays it was found in apps/cli.

## S79.30 Classification failure fallback.

- **Expected:** When classification fails or is ambiguous, routing falls back to a safe default.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:184; apps/cli/src/routing/classify.rs:1
- **Where to find it:** no screen of its own. Behaviour is in code (apps/cli/src/agent/chat.rs re_resolve_auto_route_for_turn); the failure itself is hard to trigger on demand.
- **Needs:** a signed-in managed cloud account with /route auto set
- **Steps:**
  1. In a managed Auto session, send a prompt that is hard to classify (for example one short ambiguous word).
  2. Check the reply still arrives and no Auto route notice appears.
