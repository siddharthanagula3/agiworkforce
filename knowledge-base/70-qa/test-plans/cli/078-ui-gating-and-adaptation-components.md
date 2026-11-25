---
id: "PLAN-cli-078"
type: "test-plan"
title: "CLI · 78. UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "78"
---
# CLI · 78. UI gating and adaptation components

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S78.01 Feature-availability resolver.

- **Expected:** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- **Code:** done. Evidence present: apps/cli/src/tier_cache.rs:376; apps/cli/src/voice.rs:990; apps/cli/src/skills.rs:145
- **Where to find it:** no screen of its own. The resolver is the capability_refusal function used by /voice and /skills. It is not a single screen.
- **Needs:** an account where voice input is switched off or not on its plan
- **Steps:**
  1. Sign in to an account where voice input is switched off or not on its plan.
  2. Type /voice and press Enter.
  3. Read the reply. Expected: a line saying Voice input is not available, which names the reason.

## S78.02 Model-dependent composer controls.

- **Expected:** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/model_picker.rs:295; apps/cli/src/models/streaming.rs:485 (quoted code not found in the file now)
- **Where to find it:** /model, then move the highlight between models that do and do not support reasoning. (labels found in the code)
- **Needs:** a signed-in account with a model list that includes reasoning and non-reasoning models
- **Steps:**
  1. Type /model and press Enter.
  2. Highlight a model that supports reasoning (marked R in agi models list). Look for the Effort: row under the list.
  3. Highlight a model that does not support reasoning.
  4. Compare with Expected: the Effort: row should appear or disappear with the model. The status bar effort: label also disappears for non-reasoning models.

## S78.03 Model-dependent accepted-file types.

- **Expected:** Which files the composer accepts (or how it reacts to them) depends on what the selected model can read.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:856; apps/cli/src/tui/tui_app.rs:856
- **Where to find it:** /model to pick a model that cannot read images, then /attach with an image file path. (labels found in the code)
- **Needs:** an image file, and a non-vision model in the model list
- **Steps:**
  1. Type /model, pick a model with no vision support (no V in agi models list).
  2. Type /attach followed by the path to a PNG or JPG file, and press Enter.
  3. Read the reply. Expected: a message that the model does not accept images and asks you to switch to a vision model with /model first.
  4. Switch to a vision model and attach the same file. Expected: the file is accepted.

## S78.04 Model-dependent reasoning options.

- **Expected:** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:485 (quoted code not found in the file now); apps/cli/src/model_catalog.rs:1443
- **Where to find it:** /model to pick a reasoning model, then /effort. (labels found in the code)
- **Needs:** a signed-in account with reasoning and non-reasoning models
- **Steps:**
  1. Type /model and pick a model that supports reasoning.
  2. Type /effort and press Enter. The effort picker opens.
  3. Choose a level with the arrow keys and Enter. Expected: Effort set to <level>.
  4. Switch to a model that takes no effort setting and type /effort. Expected: the effort row and the /effort command are no longer offered.

## S78.05 Model-dependent sampling options.

- **Expected:** Sampling options offered or sent depend on the selected model.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7093
- **Where to find it:** agi --temperature <number>, then start a chat with a model that rejects sampling settings. (labels found in the code)
- **Needs:** a model that rejects temperature; none was listed in the code for this check
- **Steps:**
  1. Run agi --temperature 0.5 (or set temperature under [default] in the config file).
  2. Choose a model that rejects temperature (see the catalog). Start the chat.
  3. Read the first system line in the chat. Expected: it says the model does not accept a temperature, so the configured value is not sent to it.

## S78.06 Model-dependent media settings.

- **Expected:** Media generation settings (duration, size, aspect) offered depend on the selected media model.
- **Code:** done. Evidence moved: apps/cli/src/cloud/image.rs:101; apps/cli/src/lib.rs:2622 (quoted code not found in the file now)
- **Where to find it:** /image with a flag, such as /image --aspect 16:9 <prompt>, in Managed Cloud mode. (labels found in the code)
- **Needs:** a signed-in account in Managed Cloud mode
- **Steps:**
  1. Make sure the session is in Managed mode (/privacy-mode managed). /image is only listed in Managed mode.
  2. Type /image --aspect 16:9 a red bicycle and press Enter.
  3. Choose a model that does not offer that ratio, if you know one. Read the reply. Expected: a message that the model does not make that ratio and lists the ratios it supports.
  4. Type /image with no text to see the help line that lists the settings.

## S78.07 Tier-dependent entitlement checks.

- **Expected:** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:414; apps/cli/src/models/provider_dispatch.rs:318
- **Where to find it:** agi models list (CLI command), and /model to pick a locked model. (labels found in the code)
- **Needs:** a Free account (or a lower plan than a locked model)
- **Steps:**
  1. Sign in with a plan that does not include some models.
  2. Run agi models list in a terminal. Look for the Locked on your ... plan section.
  3. Type /model, pick a locked model, and send a message. Expected: a reply that the model is unavailable on your plan right now.
  4. Compare the server's refusal with the locked list. The check on the server was not run from the UI.

## S78.08 Tier-dependent remaining allowance.

- **Expected:** Each surface shows how much of the plan allowance remains, read from the server.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:673; apps/cli/src/usage_summary.rs:358
- **Where to find it:** /usage (or agi usage in a terminal). (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and send a message or two.
  2. Type /usage and press Enter.
  3. Read the account lines at the bottom of the reply. Expected: the plan allowance that remains, from the server.

## S78.09 Workspace-policy restrictions.

- **Expected:** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- **Code:** done. Evidence moved: apps/cli/src/provider.rs:184; apps/cli/src/models/streaming.rs:234 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:433; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3718
- **Where to find it:** /connectors, which shows the workspace connector policy. (labels found in the code)
- **Needs:** a member account in a workspace with a policy
- **Steps:**
  1. Sign in to a workspace account whose admin has set a connector policy.
  2. Type /connectors and press Enter.
  3. Read the reply. Expected: the policy is shown and restricted items are blocked.

## S78.12 Age or account eligibility restrictions.

- **Expected:** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- **Code:** done. Evidence gone: apps/web/app/auth/device/page.tsx:127 (quoted code not found in the file now); apps/cli/src/oauth.rs:75; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:137 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/clerkAuth.ts:72; apps/web/features/auth/AuthSwitchLine.tsx:37 (file no longer exists)
- **Where to find it:** not found in the code. Searched apps/cli/src for age, adult, eligibility and policy wording. No age check or eligibility text was found in the CLI sign-in code (oauth.rs). The web device page cited in the plan no longer has the matching text.
- **Needs:** a Free account and an account outside the age rule

## S78.15 Required-runtime detection.

- **Expected:** The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:239; apps/cli/src/provider.rs:184
- **Where to find it:** agi models list (CLI command), and /doctor. (labels found in the code)
- **Needs:** a machine with and without a local model runtime
- **Steps:**
  1. Make sure no local model runtime is installed.
  2. Run agi models list in a terminal. Expected: no INSTALLED LOCAL MODELS section appears.
  3. Type /doctor and press Enter. Read the checks listed.
  4. Install or start a local runtime, run agi models list again, and compare. Expected: the local models section appears.

## S78.16 Unsupported versus temporarily unavailable distinction.

- **Expected:** The surface tells apart a feature that is unsupported here from one that is only temporarily unavailable.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:270; apps/cli/src/provider.rs:302; apps/cli/src/lib.rs:4889; apps/cli/src/models/gateway_models.rs:54
- **Where to find it:** agi models list (CLI command). (labels found in the code)
- **Needs:** a signed-in account; a model the server reports as temporarily unavailable is needed to see that group
- **Steps:**
  1. Sign in and run agi models list.
  2. Look for the three groups: Temporarily unavailable, Locked on your ... plan, and On your plan but not offered by this deployment right now.
  3. Compare the wording. Expected: each group has its own line that says why the model is not available.

## S78.17 Hidden irrelevant controls.

- **Expected:** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:1086; apps/cli/src/tui/tui_app.rs:1094; apps/cli/src/tui/tui_app.rs:3566; apps/cli/src/tui/tui_app.rs:4535
- **Where to find it:** Type / in the composer to open the command list, after /privacy-mode managed and /privacy-mode local. (labels found in the code)
- **Needs:** a signed-in account that can switch between Managed and Local modes
- **Steps:**
  1. Type /privacy-mode managed, then type / to open the command popup. Note /image is listed.
  2. Type /privacy-mode local, then type / again. Expected: /image is no longer listed.
  3. Pick a model without reasoning and type / again. Expected: /effort is not listed.

## S78.18 Disabled but discoverable restricted controls.

- **Expected:** Restricted controls stay visible but disabled, with the reason, so users can discover them.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:291; apps/cli/src/model_catalog.rs:894; apps/cli/src/lib.rs:4905
- **Where to find it:** agi models list (CLI command): models your plan does not include are listed with the plan they need. (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a plan that does not include some models.
  2. Run agi models list.
  3. Look for the Locked on your ... plan section, which lists each model with the plan it needs.
  4. Compare with Expected: restricted models stay listed and show the reason and the plan to upgrade to.

## S78.19 Upgrade explanation.

- **Expected:** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- **Code:** done. Evidence moved: apps/cli/src/errors.rs:414; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3657 (quoted code not found in the file now)
- **Where to find it:** /upgrade (opens the plans page), and agi plans in a terminal. (labels found in the code)
- **Needs:** a Free account, to see a plan-locked feature
- **Steps:**
  1. Type /upgrade and press Enter.
  2. Read the reply. Expected: Plans and upgrades: with the plans link.
  3. Run agi plans in a terminal. Expected: the plans and what each includes are listed.
  4. Try to use a plan-locked feature to see the Cloud chat requires message and its link.

## S78.21 Grant-permission explanation.

- **Expected:** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/mod.rs:1461; apps/cli/src/features/exec/tools/mod.rs:1448
- **Where to find it:** Ask the agent to read or click in the active Chrome tab. The approval prompt appears before the action. (labels found in the code)
- **Needs:** Chrome with the AGI browser bridge connected
- **Steps:**
  1. Connect the AGI browser bridge to your signed-in Chrome (the way to connect it was not traced).
  2. Ask the agent to read the page open in Chrome.
  3. Read the approval prompt. Expected: it says the agent wants to read the page open in your signed-in Chrome, and gives the target.
  4. Deny or allow, and check that nothing happens without approval.

## S78.22 Use-another-model explanation.

- **Expected:** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- **Code:** done. Evidence present: apps/cli/src/errors.rs:543; apps/cli/src/errors.rs:530
- **Where to find it:** /model, then /attach with an image while a non-vision model is selected. (labels found in the code)
- **Needs:** an image file, and a non-vision model
- **Steps:**
  1. Type /model and pick a model with no V in agi models list.
  2. Type /attach with an image path and press Enter.
  3. Read the reply. Expected: it tells you to switch to a vision model with /model first.
  4. Read the reply for a model-unavailable case: it names the alternative to use with /model.

## S78.23 Continue-on-another-device action.

- **Expected:** When work fits another device or app better, the surface offers an action that continues it there.
- **Code:** done. Evidence moved: apps/cli/src/cloud/mod.rs:241; apps/cli/src/claude_parity.rs:141 (quoted code not found in the file now)
- **Where to find it:** /continue-elsewhere (add open to open the browser). (labels found in the code)
- **Needs:** a signed-in account with a saved conversation
- **Steps:**
  1. Sign in and have a saved conversation in your account.
  2. Type /continue-elsewhere and press Enter.
  3. Read the reply. Expected: it says the conversation is in your account and gives a web link to continue it on the web, or in the desktop or mobile app.
  4. Type /continue-elsewhere open to open the link in your browser.

## S78.24 Explicit processing-path selection.

- **Expected:** The user can explicitly choose where a request is processed (local model, own key, managed cloud).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2617; apps/cli/src/lib.rs:1638 (quoted code not found in the file now)
- **Where to find it:** /privacy-mode (no argument shows the settings), then /privacy-mode byok or /privacy-mode managed. (labels found in the code)
- **Needs:** a signed-in account; a BYOK provider key for the BYOK step
- **Steps:**
  1. Type /privacy-mode and press Enter. Read the Privacy settings screen and its Active mode line.
  2. Type /privacy-mode byok while in Local mode. Expected: Local -> BYOK requires an explicit reviewable handoff.
  3. Use /byok to create a reviewed draft and send it. Expected: the handoff is shown before the send.
  4. Type /privacy-mode with a wrong word to see the usage line.

## S78.26 Unsupported-parameter removal or correction.

- **Expected:** Parameters the chosen model cannot take are removed or corrected before the request is sent.
- **Code:** done. Evidence present: apps/cli/src/config.rs:190; apps/cli/src/models/streaming.rs:688
- **Where to find it:** no screen of its own. Same effect as S78.05. The request-side removal is in streaming.rs effective_temperature and was not run.
- **Needs:** a model that rejects temperature
- **Steps:**
  1. Set a temperature with agi --temperature 0.5 or in the config file.
  2. Start a chat with a model that rejects temperature.
  3. Read the first system line. Expected: it says the configured temperature is not sent to the model.

## S78.28 Live updates after a plan, policy, connection, or device change.

- **Expected:** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- **Code:** done. Evidence present: apps/cli/src/tier_cache.rs:43; apps/cli/src/provider.rs:184
- **Where to find it:** no screen of its own. The 5-minute TTL is in tier_cache.rs. Whether /status forces a refresh was not confirmed.
- **Needs:** a plan change you can make on another device
- **Steps:**
  1. Note the plan shown in /status (Account: signed in, <plan> plan).
  2. Change the plan on the web or another device.
  3. Wait up to 5 minutes, then type /status again and compare the plan name.
