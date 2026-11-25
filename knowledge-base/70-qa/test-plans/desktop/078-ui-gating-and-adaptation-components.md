---
id: "PLAN-desktop-078"
type: "test-plan"
title: "Desktop · 78. UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "78"
---
# Desktop · 78. UI gating and adaptation components

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S78.01 Feature-availability resolver.

- **Expected:** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:243
- **Where to find it:** no screen of its own. The code cited at WebSettingsModal.tsx:243 is a per-feature capability-decision hook (useCapabilityDecision), not one resolver found by name.
- **Steps:**
  1. Sign in and open a new chat.
  2. Open the model button at the bottom of the composer and switch between two models.
  3. Compare which controls appear (for example the Reasoning effort button) with what Expected says.

## S78.02 Model-dependent composer controls.

- **Expected:** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:289; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer > model button > choose a model with reasoning > Reasoning effort button beside the composer (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Open the model picker from the model name button at the bottom of the composer and pick a reasoning-capable model.
  3. Look for the Reasoning effort button in the composer footer.
  4. Pick a model with no reasoning support and check that the Reasoning effort button is gone or changed, as Expected says.

## S78.03 Model-dependent accepted-file types.

- **Expected:** Which files the composer accepts (or how it reacts to them) depends on what the selected model can read.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5477; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108
- **Where to find it:** Composer > plus menu > Add photos & files, then the model picker (labels found in the code)
- **Needs:** a file to upload; a model on your plan that cannot read the file
- **Steps:**
  1. Open the plus menu in the composer and click Add photos & files.
  2. Choose an image or a PDF from your computer.
  3. Open the model picker and select a model that cannot read that file type.
  4. Look for the warning that says the selected model can't read the attached file, and the Use Auto button, and compare with Expected.

## S78.04 Model-dependent reasoning options.

- **Expected:** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1313; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer > Reasoning effort button > slider popover (labels found in the code)
- **Steps:**
  1. Open a reasoning-capable model.
  2. Click the Reasoning effort button in the composer footer.
  3. Read the marks on the slider and the note under it.
  4. Switch to another model, open the button again, and compare the marks with Expected.

## S78.06 Model-dependent media settings.

- **Expected:** Media generation settings (duration, size, aspect) offered depend on the selected media model.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6645; apps/web/app/api/media/video/generate/route.ts:454
- **Where to find it:** Composer > plus menu > Create video, then the video controls in the composer (labels found in the code)
- **Needs:** a paid account (video generation is gated by plan)
- **Steps:**
  1. Open the plus menu and click Create video.
  2. Open the Video model button.
  3. Look at the Video aspect ratio, Video quality and Video length buttons in the composer.
  4. Change the video model and check that the offered settings change, as Expected says.

## S78.07 Tier-dependent entitlement checks.

- **Expected:** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- **Code:** done. Evidence present: apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:164
- **Where to find it:** Sidebar > Code (the Code page) (labels found in the code)
- **Needs:** a Free account and a paid account
- **Steps:**
  1. Sign in with a Free account and click Code in the sidebar.
  2. Look for the notice Code is on paid plans and the Upgrade button.
  3. Sign in with a paid account and check the Code page changes.
  4. Compare with Expected; the server-side check cannot be seen from the screen.

## S78.08 Tier-dependent remaining allowance.

- **Expected:** Each surface shows how much of the plan allowance remains, read from the server.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings window > Usage (labels found in the code)
- **Needs:** a paid account with some usage (or a Free account)
- **Steps:**
  1. Open the Settings window and click Usage.
  2. Read the percent used bars and the note about the UTC calendar month.
  3. Check the limit message, for example Limit reached, when a limit is used up.
  4. Compare what is shown with the allowance shown elsewhere in Settings, as Expected says.

## S78.09 Workspace-policy restrictions.

- **Expected:** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:668; apps/web/app/api/llm/v1/chat/completions/route.ts:433; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3718
- **Where to find it:** Settings > Workspace > Workspace administration > Policy (labels found in the code)
- **Needs:** an admin account in a workspace and a second account in the same workspace
- **Steps:**
  1. Sign in as a workspace owner or admin and open Settings, then Workspace.
  2. Click Workspace administration, then Policy.
  3. Change a setting such as Zero data retention only and save.
  4. Sign in as a member of the same workspace and check the restricted choice is limited, as Expected says.

## S78.10 Role restrictions.

- **Expected:** Controls restricted to workspace roles (owner/admin) are withheld from other members and refused server-side.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:428; apps/web/app/api/settings/team/route.ts:162
- **Where to find it:** Settings > Workspace (labels found in the code)
- **Needs:** an admin account and a member account in the same workspace
- **Steps:**
  1. Sign in as an owner or admin and open Settings, then Workspace; note the Transfer ownership button.
  2. Sign in as a plain member of the same workspace and open Settings, then Workspace.
  3. Check that owner and admin controls (such as Transfer ownership) are not shown.
  4. Compare with Expected; the server refusal cannot be seen from the screen.

## S78.11 Regional restrictions.

- **Expected:** Features or routes restricted by region are enforced and the restriction is visible to the user.
- **Code:** done. Evidence present: apps/web/features/settings/sections/PrivacySection.tsx:589; apps/web/features/settings/components/UsOnlyRoutingPanel.tsx:173
- **Where to find it:** Settings > Privacy > Only use AI providers based in the US (some labels not found in the code; trust the screen)
- **Steps:**
  1. Open Settings and click Privacy.
  2. Turn on Only use AI providers based in the US.
  3. Open the model picker and look for models that are marked unavailable.
  4. Compare with Expected; the note says models without a US-based provider are unavailable.

## S78.12 Age or account eligibility restrictions.

- **Expected:** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- **Code:** done. Evidence moved: apps/web/app/signup/complete/RecordTermsAcceptance.tsx:84 (quoted code not found in the file now); apps/web/app/signup/complete/RecordTermsAcceptance.tsx:106 (quoted code not found in the file now); apps/web/lib/identity/client.ts:81 (quoted code not found in the file now)
- **Where to find it:** Sign-up > Confirm your age step (labels found in the code)
- **Needs:** a new account to sign up
- **Steps:**
  1. Start a new account on the sign-up page and reach the Confirm your age step.
  2. Read the notice that says this service is for adults.
  3. Complete the step with an age under 18 if the step offers that choice.
  4. Check the screen that tells you that you must be at least 18 to continue, and compare with Expected.

## S78.13 Required-connection detection.

- **Expected:** The product detects when a feature needs an account connection that is missing and says which one.
- **Code:** done. Evidence moved: apps/web/app/plugins/[id]/page.tsx:346; apps/web/app/plugins/[id]/ConnectorChecklist.tsx:75; apps/web/features/connectors/hooks/use-connectors.ts:93 (quoted code not found in the file now)
- **Where to find it:** Plugins (composer plus menu) > a plugin page (/plugins/<id>) > Required connectors (labels found in the code)
- **Needs:** an account where some connectors are not connected yet
- **Steps:**
  1. Open a plugin that needs connectors from the Plugins item in the composer plus menu.
  2. Scroll to Required connectors.
  3. Look at each connector row: Checking, then Connected or a Connect link.
  4. Compare with Expected.

## S78.14 Required-device detection.

- **Expected:** The surface detects whether a required device (paired desktop, phone) is available and says so before the user relies on it.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:30; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:315
- **Where to find it:** Code page > the Code more menu > Work with local code (Desktop app) (labels found in the code)
- **Needs:** a Desktop app signed in to the same account (to see online or offline status)
- **Steps:**
  1. Sign in on the web app and click Code in the sidebar.
  2. Open the Code menu that holds Work with local code.
  3. Hover or read the Desktop app row: the status says the paired desktop is online, asleep or offline.
  4. Compare with Expected; with no paired desktop the row links to the download page.

## S78.15 Required-runtime detection.

- **Expected:** The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:687; apps/web/app/api/code/sessions/route.ts:61
- **Where to find it:** Sidebar > Code (labels found in the code)
- **Needs:** a Free account (to see the plan notice)
- **Steps:**
  1. Sign in and click Code in the sidebar.
  2. If the deployment has managed environments off, read Managed environments are not enabled on this deployment.
  3. If the plan does not include them, read Your plan does not include managed environments.
  4. Compare with Expected; when the environment is being prepared the page says it is still being prepared.

## S78.16 Unsupported versus temporarily unavailable distinction.

- **Expected:** The surface tells apart a feature that is unsupported here from one that is only temporarily unavailable.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:41; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:319; apps/web/app/api/llm/v1/models/route.ts:157
- **Where to find it:** Composer > model button > Models picker (labels found in the code)
- **Needs:** none (a provider outage must be present for the Temporarily unavailable row)
- **Steps:**
  1. Open the model picker from the model name button in the composer.
  2. Look for rows with Coming soon or Beta labels and rows marked Not available in this app.
  3. Look for a row marked Temporarily unavailable.
  4. Compare the wording: Temporarily unavailable means a temporary provider problem; Not available in this app means not offered here.

## S78.17 Hidden irrelevant controls.

- **Expected:** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1077; apps/web/features/chat/components/Composer/ComposerFooter.tsx:289; apps/web/features/chat/components/Composer/ComposerFooter.tsx:289
- **Where to find it:** Composer > plus menu > Use the browser (Desktop app only) (labels found in the code)
- **Needs:** the Desktop app on a Mac, and the web app in a browser
- **Steps:**
  1. In the web app, open the composer plus menu and note that Use the browser, Run a local command and Use this computer are not listed.
  2. Open the same plus menu in the Desktop app.
  3. Check that Use the browser appears there.
  4. Compare with Expected.

## S78.18 Disabled but discoverable restricted controls.

- **Expected:** Restricted controls stay visible but disabled, with the reason, so users can discover them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:214; apps/web/features/chat/components/Composer/ComposerFooter.tsx:654; apps/web/features/chat/components/Composer/ComposerFooter.tsx:323 (quoted code not found in the file now)
- **Where to find it:** Composer > model button > Models picker > a locked row (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and open the model picker.
  2. Find a row with a lock label such as an upgrade-plan label, or Coming soon.
  3. Hover or click the locked row and read the reason.
  4. Check the row stays visible and shows why it is locked, as Expected says.

## S78.19 Upgrade explanation.

- **Expected:** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2631; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3657 (quoted code not found in the file now)
- **Where to find it:** Composer > model button > Models picker > locked row > Upgrade to use, and the link What each plan includes (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and open the model picker.
  2. Find a row marked Upgrade to use with a plan name.
  3. Click the row or the link What each plan includes.
  4. Check that the plan that unlocks it is named and the upgrade path is reachable, as Expected says.

## S78.20 Connect-account explanation.

- **Expected:** When a feature needs an account connection, the user is told which account to connect and given a way to connect it.
- **Code:** done. Evidence moved: apps/web/app/plugins/[id]/ConnectorChecklist.tsx:92; apps/web/app/plugins/[id]/ConnectorChecklist.tsx:75; apps/web/features/connectors/hooks/use-connectors.ts:93 (quoted code not found in the file now)
- **Where to find it:** Plugins page for a plugin (/plugins/<id>) > Required connectors > Connect (labels found in the code)
- **Needs:** an outside account (such as Google or GitHub) to finish connecting
- **Steps:**
  1. Open a plugin that needs connectors.
  2. Find a connector row that shows Connect.
  3. Click Connect and confirm it opens the connectors page.
  4. Compare with Expected: the connector to connect is named in the row and the link gives the way to connect.

## S78.21 Grant-permission explanation.

- **Expected:** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- **Code:** done. Evidence moved: apps/web/features/chat/hooks/use-dictation.ts:78 (quoted code not found in the file now)
- **Where to find it:** Composer > plus menu > Use the browser (Desktop app) (labels found in the code)
- **Needs:** the Desktop app; a Chrome extension paired for the browser text; a microphone for the Voice settings
- **Steps:**
  1. In the Desktop app, open the composer plus menu and click Use the browser.
  2. Read the dialog text that says every action asks you first.
  3. Open Settings > Voice and look at the Microphone choice.
  4. Compare with Expected; no microphone permission explanation was found before the system prompt.

## S78.22 Use-another-model explanation.

- **Expected:** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5477; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108
- **Where to find it:** Composer > plus menu > Add photos & files, then the model picker (labels found in the code)
- **Needs:** an image file; a model on your plan that cannot read images
- **Steps:**
  1. Attach an image from Add photos & files.
  2. Open the model picker and choose a model that cannot read images.
  3. Read the warning that says the selected model can't read the attached image.
  4. Check the Use Auto button and the Choose a compatible model button, and compare with Expected.

## S78.23 Continue-on-another-device action.

- **Expected:** When work fits another device or app better, the surface offers an action that continues it there.
- **Code:** done. Evidence present: apps/web/features/desktop-host/lib/deep-links.ts:45; packages/contracts/local-runtime/src/host-bridge.ts:10
- **Where to find it:** Code page > Work with local code (Desktop app) (labels found in the code)
- **Needs:** a Desktop app signed in to the same account
- **Steps:**
  1. Sign in on the web app and open Code.
  2. Open the Code menu that holds Work with local code, and choose the Desktop app row.
  3. If the Desktop app is paired and online, check that the link opens the same work in Desktop.
  4. Compare with Expected; there is no equivalent action in the chat composer.

## S78.24 Explicit processing-path selection.

- **Expected:** The user can explicitly choose where a request is processed (local model, own key, managed cloud).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:195; apps/web/features/desktop-host/lib/runtime-client.ts:638; apps/desktop/electron/runtime/dispatcher.ts:799 (quoted code not found in the file now); apps/desktop/electron/preload.ts:145 (quoted code not found in the file now)
- **Where to find it:** Composer > model button > On this device (local models); workspace owners set Your own keys and Cloud in Workspace administration > Policy (labels found in the code)
- **Needs:** a local model runtime (Ollama or LM Studio) for the On this device section; a workspace admin account for the Policy modes
- **Steps:**
  1. Open the model picker and look for the section On this device.
  2. Choose a local model there and send a message.
  3. As a workspace admin, open Workspace administration > Policy and read the Local, Your own keys and Cloud modes.
  4. Compare with Expected; a per-message choice between own key and managed cloud was not found.

## S78.25 Attachment-preservation choice after model change.

- **Expected:** After switching to a model that cannot use the current attachments, the user chooses to keep them (by switching model) or remove them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1511
- **Where to find it:** Composer > attach a file > switch model > attachment warning with Remove attachments and Choose a compatible model (labels found in the code)
- **Needs:** a file to upload; a model on your plan that cannot read it
- **Steps:**
  1. Attach an image or PDF.
  2. Switch to a model that cannot read it.
  3. Read the warning, then click Choose a compatible model or Use Auto.
  4. Click Remove attachments on another try and check the file is removed, as Expected says.

## S78.26 Unsupported-parameter removal or correction.

- **Expected:** Parameters the chosen model cannot take are removed or corrected before the request is sent.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1313; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer > Reasoning effort button > Fast mode switch (labels found in the code)
- **Needs:** a paid account (Fast mode is plan-dependent; not verified)
- **Steps:**
  1. Choose a model and open the Reasoning effort button.
  2. Turn on the Fast mode switch.
  3. Choose a model that does not offer Fast mode, and send a message.
  4. Look for the message Fast mode is not available for that model, and check whether the option was removed before sending, as Expected says.

## S78.28 Live updates after a plan, policy, connection, or device change.

- **Expected:** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1067; apps/web/features/billing/hooks/use-billing-queries.ts:108
- **Where to find it:** no screen of its own. The Code line cites ChatComposerNew.tsx:1067 and use-billing-queries.ts:108; the effect is inner behaviour (billing data is refetched with staleTime 0 and refetchOnWindowFocus true), so the tester only sees it through the controls above. The Desktop shell is Electron showing the hosted web app, so these are the same web screens. I did not confirm the plus button's visible label or the Desktop-only path for plan changes.
- **Needs:** a Free account and a paid plan change it can make (Stripe checkout), in the same workspace
- **Steps:**
  1. Sign in with a Free account, open a chat, and open the composer's plus menu. Note whether the "Create image" and "Create video" rows appear, and whether the "Chat" / "Work" mode choice appears.
  2. Open Settings > Billing and start a plan change (this opens a Stripe page; complete it or use a test plan change).
  3. Return to the app window and bring it back into focus, without reloading or reinstalling.
  4. Open the composer's plus menu again and check whether "Create image" and "Create video" now show, and whether "Work" is now selectable, matching the new plan.
