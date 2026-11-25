---
id: "PLAN-chrome-078"
type: "test-plan"
title: "Chrome · 78. UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "78"
---
# Chrome · 78. UI gating and adaptation components

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S78.01 Feature-availability resolver.

- **Expected:** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/capabilityDocument.ts:15 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/capabilityDocument.ts:36 (quoted code not found in the file now); apps/extension/src/side_panel.ts:15241; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:781
- **Where to find it:** no screen of its own. The resolver itself is in apps/extension/src/features/cloud-bridge/capabilityDocument.ts (the quoted lines at :15 and :36 no longer match). The controls read it through applyCapabilityGates in src/side_panel.ts.
- **Needs:** A Free account and a paid account
- **Steps:**
  1. Sign in and open the + button in the composer. Note whether Upload from device is listed.
  2. Sign out, then sign in with an account that has a different plan or settings, and open + again.
  3. Compare: an option is hidden only when the account cannot use that feature.

## S78.02 Model-dependent composer controls.

- **Expected:** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:333; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112
- **Where to find it:** Composer > model button (shows the model name) > Effort and Extended thinking rows; composer + > Upload from device (path not confirmed in the code; trust the screen)
- **Needs:** A Free account and a paid account, to compare
- **Steps:**
  1. Sign in and click the model button in the composer.
  2. Pick a model that offers reasoning levels, then open the model button again and look for the Effort heading and the Extended thinking row.
  3. Pick a model without reasoning options, reopen the model button, and check that Effort and Extended thinking change or disappear.
  4. Click + and check whether Upload from device is listed for this account. Compare with Expected.

## S78.04 Model-dependent reasoning options.

- **Expected:** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:333; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer > model button > Effort heading (path not confirmed in the code; trust the screen)
- **Needs:** A paid account (some levels are gated)
- **Steps:**
  1. Pick a model that offers several reasoning levels, then click the model button.
  2. Under the Effort heading, read the list of levels and find the one marked Default.
  3. Choose a different level and send a message.
  4. Switch to a model with fewer levels, reopen the model button, and check the Effort list matches that model. Compare with Expected.

## S78.07 Tier-dependent entitlement checks.

- **Expected:** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13443; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:647
- **Where to find it:** Composer > model button > locked model row (plan name on the right) and Effort rows with a plan name (path not confirmed in the code; trust the screen)
- **Needs:** A Free account
- **Steps:**
  1. Sign in with a Free account and click the model button.
  2. Find a model row marked with a plan name on the right side. Hover it and read the tooltip or the row text.
  3. Click the locked row and see that a plans page opens in a new tab.
  4. Compare with Expected. The server-side check cannot be seen from the screen.

## S78.08 Tier-dependent remaining allowance.

- **Expected:** Each surface shows how much of the plan allowance remains, read from the server.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13443; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** More (the three-dot button at the top right of the side panel) > Usage (path not confirmed in the code; trust the screen)
- **Needs:** A signed-in account with some usage
- **Steps:**
  1. Sign in and click the More button at the top right of the side panel.
  2. Read the Usage row, including its meter.
  3. Click Usage. A web usage page opens in a new tab.
  4. Compare the meter and the page with Expected.

## S78.09 Workspace-policy restrictions.

- **Expected:** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6168 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:433; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3718
- **Where to find it:** not found in the code. Searched apps/extension/src and apps/extension/_locales for admin, organization, workspace, policy and retention text. Found no workspace policy screen. The only denial gate found is connectors coming soon in src/features/cloud-bridge/capabilityDocument.ts. The cited src/side_panel.ts:6168 quote is gone.
- **Needs:** A workspace member account and a workspace administrator policy

## S78.12 Age or account eligibility restrictions.

- **Expected:** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- **Code:** done. Evidence gone: apps/web/app/auth/device/page.tsx:127 (quoted code not found in the file now); apps/cli/src/oauth.rs:75; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:137 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/clerkAuth.ts:72; apps/web/features/auth/AuthSwitchLine.tsx:37 (file no longer exists)
- **Where to find it:** not found in the code. Searched apps/extension/src and _locales for age, 18, eligib and adult text. No age or eligibility check was found. The cited sign-in files are in apps/web or apps/extension-vscode, and apps/web/features/auth/AuthSwitchLine.tsx no longer exists.
- **Needs:** An account that is not eligible by age or account rules

## S78.14 Required-device detection.

- **Expected:** The surface detects whether a required device (paired desktop, phone) is available and says so before the user relies on it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:4246; apps/extension/src/features/background/page-capture.ts:53
- **Where to find it:** Side panel > notice above the composer: Desktop tools are optional and currently disconnected. (path not confirmed in the code; trust the screen)
- **Needs:** The AGI Desktop app installed on the Mac, and an account
- **Steps:**
  1. Make sure the AGI Desktop app is not running or not paired, then open the side panel.
  2. Read the notice above the composer. It appears only while Desktop is disconnected.
  3. Click Reconnect. Start the Desktop app and click Reconnect again.
  4. Compare: the notice should disappear once Desktop is connected.

## S78.17 Hidden irrelevant controls.

- **Expected:** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:333; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:308
- **Where to find it:** Composer > model button (Extended thinking row) and composer + (Upload from device) (path not confirmed in the code; trust the screen)
- **Needs:** A Free account and a paid account, to compare
- **Steps:**
  1. Click the model button and pick a model that does not offer extended thinking. Look for the Extended thinking row.
  2. Compare with a model that does offer it, where the row is listed.
  3. Click + and check whether Upload from device is listed for this account.
  4. Compare with Expected: a control that cannot apply is hidden, not shown disabled.

## S78.18 Disabled but discoverable restricted controls.

- **Expected:** Restricted controls stay visible but disabled, with the reason, so users can discover them.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:130
- **Where to find it:** Composer > model button > locked model row (plan name on the right) and Effort row with a plan name (path not confirmed in the code; trust the screen)
- **Needs:** A Free account
- **Steps:**
  1. Sign in with a Free account and click the model button.
  2. Find a model row that shows a plan name on the right. It stays listed but cannot be picked.
  3. Hover the row, or open the Effort list of a model, and read the gated level with its plan name and tooltip.
  4. Compare with Expected: the restricted control is visible, disabled, and says which plan unlocks it.

## S78.19 Upgrade explanation.

- **Expected:** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8360 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:647
- **Where to find it:** Composer > + > Create a video · Upgrade (shown when the plan does not include video) (path not confirmed in the code; trust the screen)
- **Needs:** A Free account
- **Steps:**
  1. Sign in with an account whose plan does not include video and click +.
  2. Read the row Create a video · Upgrade.
  3. Click the model button and read a locked model row or an Effort row with a plan name.
  4. Compare with Expected: the surface names the plan that unlocks the feature and how to upgrade.

## S78.21 Grant-permission explanation.

- **Expected:** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7645 (quoted code not found in the file now); apps/extension/src/features/options/site-allowlist.ts:86
- **Where to find it:** Side panel > an AGI task that needs to read or act on a site you have not approved yet (card titled AGI needs access to the site) (path not confirmed in the code; trust the screen)
- **Needs:** A website not yet on your approved sites
- **Steps:**
  1. Open a website that is not on your approved sites.
  2. In the side panel, ask AGI to read or act on that page.
  3. When the card AGI needs access to the site appears, read its explanation text.
  4. Look at the buttons Allow for this task, Always allow on this site and Decline. Compare with Expected.

## S78.22 Use-another-model explanation.

- **Expected:** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13416; apps/extension/src/features/side-panel/bubbles.ts:319
- **Where to find it:** Side panel > a failed reply > Switch model button (path not confirmed in the code; trust the screen)
- **Needs:** An account and a model that returns a plan or quota error
- **Steps:**
  1. Send a message with a model whose request fails with a plan, quota or account error.
  2. Read the failed reply and its error text.
  3. Click Switch model. The model menu opens.
  4. Compare with Expected: the user is told to use another model, and ideally which one.

## S78.23 Continue-on-another-device action.

- **Expected:** When work fits another device or app better, the surface offers an action that continues it there.
- **Code:** done. Evidence present: apps/extension/src/background.ts:5188; apps/extension/src/features/context-handoff/index.ts:25
- **Where to find it:** Right-click selected text on a web page > Send selected text to a local app… (dialog Send selected context?). Second path: side panel history item More > Continue on phone (cloud chats only). (path not confirmed in the code; trust the screen)
- **Needs:** A web page with text, and optionally a cloud chat for the phone path
- **Steps:**
  1. Select a sentence on a normal web page, then right-click it.
  2. Click Send selected text to a local app….
  3. Read the dialog Send selected context? and its list of destinations. Do not click Send redacted context unless you want to send.
  4. Compare with Expected: the surface offers an action that continues the work on another device or app.

## S78.26 Unsupported-parameter removal or correction.

- **Expected:** Parameters the chosen model cannot take are removed or corrected before the request is sent.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:275; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:333
- **Where to find it:** no screen of its own. Whether unsupported parameters are removed from the request before sending was not checked in the UI. The code is in src/features/cloud-bridge/managedModelPicker.ts.
- **Needs:** A paid account, to see several models
- **Steps:**
  1. Click the model button and pick a model that offers several Effort levels. Note the levels listed.
  2. Pick a different model and reopen the model button.
  3. Compare: the Effort levels and the Extended thinking row change to match the model. Unsupported levels are not offered.

## S78.28 Live updates after a plan, policy, connection, or device change.

- **Expected:** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:16387 (quoted code not found in the file now); apps/extension/src/side_panel.ts:13275
- **Where to find it:** no screen of its own. The refresh code is in src/side_panel.ts around lines 13275 and 16387. Whether the side panel refreshes on its own without a reload was not run.
- **Needs:** A paid account that can change plan, and a second browser tab
- **Steps:**
  1. Sign in to the side panel with an account whose plan you can change, keeping the side panel open.
  2. In a separate tab, change the plan on the AGI web app.
  3. Return to the side panel without reloading the extension. Click + and then the model button.
  4. Compare with Expected: gated controls reflect the new plan without reinstalling or restarting.
