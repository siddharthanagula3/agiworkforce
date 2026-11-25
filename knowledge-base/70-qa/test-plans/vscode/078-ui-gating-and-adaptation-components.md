---
id: "PLAN-vscode-078"
type: "test-plan"
title: "VS Code · 78. UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "78"
---
# VS Code · 78. UI gating and adaptation components

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S78.01 Feature-availability resolver.

- **Expected:** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- **Code:** done. Evidence present: apps/extension-vscode/src/utils/api.ts:1311; apps/extension-vscode/src/integrations/tierResolver.ts:138; apps/extension-vscode/src/integrations/tierResolver.ts:158; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2360; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5207; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2469; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4019; scripts/check-capability-consumption.mjs:95
- **Where to find it:** no screen of its own. The resolver itself has no screen. Its effect is seen only in the picker rows. Server-side checks are not visible in the UI.
- **Needs:** a Free account and a paid account, to compare
- **Steps:**
  1. Sign in to AGI Cloud in the VS Code extension
  2. Press Cmd+Shift+M, or run "Code: Select Model" from the Command Palette
  3. Look at which rows are usable and which show a lock icon, then compare with the plan on the account
  4. Expected: the list matches the plan and route the session resolved

## S78.02 Model-dependent composer controls.

- **Expected:** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:747 (quoted code not found in the file now); apps/extension-vscode/src/features/model-picker/modelConstants.ts:329 (quoted code not found in the file now)
- **Where to find it:** The composer button titled "Mode and reasoning effort" (its summary shows the mode and effort), then pick a model in Code: Select Model (Cmd+Shift+M) (labels found in the code)
- **Needs:** a signed-in account with at least two models that differ in effort support
- **Steps:**
  1. Open the chat composer
  2. Note the "Mode and reasoning effort" button and its label
  3. Press Cmd+Shift+M, or run "Code: Select Model", and choose a different model
  4. Look at the model pill and the "Mode and reasoning effort" button: effort should appear, change or show "effort unavailable for this model" to match Expected

## S78.04 Model-dependent reasoning options.

- **Expected:** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:329 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5235
- **Where to find it:** The "Mode and reasoning effort" composer button, then the effort list after choosing a model (labels found in the code)
- **Needs:** a signed-in account with one model that takes effort and one that does not
- **Steps:**
  1. Pick a model that supports effort in Code: Select Model (Cmd+Shift+M)
  2. Open the "Mode and reasoning effort" button and note the levels offered
  3. Pick a model that does not take effort
  4. Open the same button: it should read "This model does not take a reasoning effort." and no unsupported level should be sent, as Expected says

## S78.07 Tier-dependent entitlement checks.

- **Expected:** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:297; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5333
- **Where to find it:** no screen of its own. The server-side check is not visible to a tester. Only the UI gate can be seen.
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account
  2. Press Cmd+Shift+M, or run "Code: Select Model"
  3. Choose a row with a lock icon
  4. Expected: the message "is not in the plan this session resolved. Upgrade your AGI plan to use it." appears and no turn starts

## S78.08 Tier-dependent remaining allowance.

- **Expected:** Each surface shows how much of the plan allowance remains, read from the server.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:885; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** The "Usage" pill in the chat panel (expand it to see "Per-limit usage breakdown") (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to an AGI Cloud account
  2. Find the "Usage" pill in the chat panel
  3. Click it to show usage details
  4. Compare the remaining allowance and per-limit list with the server's numbers on the account's usage page

## S78.09 Workspace-policy restrictions.

- **Expected:** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:286; apps/extension-vscode/src/utils/api.ts:1115; apps/web/app/api/llm/v1/chat/completions/route.ts:433; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3718
- **Where to find it:** not found in the code. Found only "A workspace administrator can turn it off for every member." at apps/extension-vscode/src/features/settings/settingsWebviewContent.ts (line 1979). The setting it belongs to was not traced. Searched the extension's features, integrations and core folders for policy or admin wording.
- **Needs:** a workspace administrator policy and a member account

## S78.12 Age or account eligibility restrictions.

- **Expected:** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- **Code:** done. Evidence gone: apps/web/app/auth/device/page.tsx:127 (quoted code not found in the file now); apps/cli/src/oauth.rs:75; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:137 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/clerkAuth.ts:72; apps/web/features/auth/AuthSwitchLine.tsx:37 (file no longer exists)
- **Where to find it:** not found in the code. The code lines named in the plan are gone or changed: deviceAuth.ts has no age or eligibility check, and AuthSwitchLine.tsx no longer exists. Searched deviceAuth.ts and webviewContent.ts for age and eligibility wording with no match. The web app device page was not searched.
- **Needs:** an account and a sign-in

## S78.15 Required-runtime detection.

- **Expected:** The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.
- **Code:** done. Evidence present: apps/extension-vscode/src/integrations/localRuntimeClient.ts:109; apps/extension-vscode/src/integrations/localRuntimeClient.ts:143
- **Where to find it:** Command Palette > "Code: Check the CLI in This Environment" (or "Code: Install AGI CLI") (labels found in the code)
- **Steps:**
  1. Open the Command Palette
  2. Run "Code: Check the CLI in This Environment"
  3. Read the result message
  4. Optional: set the agiWorkforce.cliPath setting to a path that does not exist, run the check again, and read the message "The AGI CLI could not be started." to compare with Expected

## S78.17 Hidden irrelevant controls.

- **Expected:** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:318 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1371; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1365
- **Where to find it:** no screen of its own. The hidden-control rule is inside the webview. The visible part is the wording on the pill.
- **Needs:** a signed-in account with a model that takes no effort
- **Steps:**
  1. Choose a model without reasoning effort in Code: Select Model (Cmd+Shift+M)
  2. Hover the model pill
  3. Expected: the effort part of the pill and its tooltip are absent or say "effort unavailable" instead of a broken control

## S78.18 Disabled but discoverable restricted controls.

- **Expected:** Restricted controls stay visible but disabled, with the reason, so users can discover them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:232; apps/extension-vscode/src/features/model-picker/modelConstants.ts:182
- **Where to find it:** Code: Select Model (Cmd+Shift+M) > a locked row, shown with a lock icon and disabled (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account
  2. Press Cmd+Shift+M, or run "Code: Select Model"
  3. Look for rows with a lock icon: they stay in the list but are disabled
  4. Choose a locked row and read the reason that appears, as Expected says

## S78.19 Upgrade explanation.

- **Expected:** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:270; apps/extension-vscode/src/utils/api.ts:106
- **Where to find it:** Code: Select Model (Cmd+Shift+M) > a locked row, or the "Upgrade" button in the chat panel, or Command Palette > "Code: Upgrade Your Plan" (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account
  2. Press Cmd+Shift+M, choose a locked row, and read which plan it names (for example "Max plan")
  3. Close the picker and click the "Upgrade" button in the chat panel, or run "Code: Upgrade Your Plan"
  4. Expected: the plan that unlocks the feature and the way to upgrade are shown

## S78.21 Grant-permission explanation.

- **Expected:** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/permissions/agentModeConsent.ts:133; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:193
- **Where to find it:** Command Palette > "Code: Set Agent Mode", then choose Bypass (labels found in the code)
- **Needs:** a folder open in VS Code
- **Steps:**
  1. Open a folder in VS Code
  2. Run "Code: Set Agent Mode" from the Command Palette
  3. Choose the Bypass option
  4. Read the warning "Turn on Bypass Permissions?" and its detail text, then press Cancel to compare with Expected

## S78.22 Use-another-model explanation.

- **Expected:** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:467; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:479
- **Where to find it:** A chat turn that fails with provider unavailable, rate limit, spent free allowance, stream interrupted or safety refusal shows a "Switch model" action (labels found in the code)
- **Needs:** a condition that makes a turn fail, such as a Free account whose allowance is spent
- **Steps:**
  1. Choose a model and send a message that fails (for example, a model at its rate limit)
  2. Read the failure message in the chat
  3. Click the "Switch model" action
  4. Expected: the model picker opens so another model can be chosen

## S78.23 Continue-on-another-device action.

- **Expected:** When work fits another device or app better, the surface offers an action that continues it there.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:562; apps/extension-vscode/src/features/context-handoff/index.ts:22 (quoted code not found in the file now)
- **Where to find it:** Command Palette > "Code: Continue in the Cloud" (labels found in the code)
- **Needs:** an AGI Cloud account and a cloud task
- **Steps:**
  1. Sign in to AGI Cloud and have a cloud task on a repository
  2. Open the Command Palette and run "Code: Continue in the Cloud"
  3. Read the result: the branch should be handed to a cloud session
  4. Expected: the work continues in the other app or device

## S78.24 Explicit processing-path selection.

- **Expected:** The user can explicitly choose where a request is processed (local model, own key, managed cloud).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/reachability.ts:6; apps/extension-vscode/src/features/model-picker/modelConstants.ts:286
- **Where to find it:** not found in the code. No explicit chooser for local model, own key or managed cloud was found. The picker shows the route through the "Sign in to AGI Cloud" and "Add another provider key" lock wording in modelConstants.ts, and a command agi-workforce.manageProviderKeys exists in package.json, but its title was not confirmed. Reachability.ts was only partly read.
- **Needs:** a signed-in account and a provider key

## S78.26 Unsupported-parameter removal or correction.

- **Expected:** Parameters the chosen model cannot take are removed or corrected before the request is sent.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:370; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2873 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The correction happens in supportedEffort in modelConstants.ts. The request itself is not visible in the UI, so only the button label can be compared.
- **Needs:** a signed-in account with two models that have different effort ladders
- **Steps:**
  1. Choose a model with fewer effort levels in Code: Select Model (Cmd+Shift+M)
  2. Set the effort to the highest level in the "Mode and reasoning effort" button
  3. Send a short message
  4. Expected: the effort sent is moved to the nearest level the model accepts, and the button shows that level

## S78.28 Live updates after a plan, policy, connection, or device change.

- **Expected:** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- **Code:** done. Evidence present: apps/extension-vscode/src/integrations/tierRevalidation.ts:18; apps/extension-vscode/src/features/model-picker/modelConstants.ts:286
- **Where to find it:** no screen of its own. The revalidation listener is in tierRevalidation.ts. What triggers the revalidation was not traced.
- **Needs:** a second account or plan change to test with
- **Steps:**
  1. Open Code: Select Model (Cmd+Shift+M) and note the lock icons
  2. Change the plan on the account (outside VS Code)
  3. Return to VS Code and open Code: Select Model again without restarting
  4. Expected: the locked rows update to match the new plan
