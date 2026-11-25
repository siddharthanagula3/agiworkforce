---
id: "PLAN-web-078"
type: "test-plan"
title: "Web · 78. UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "78"
---
# Web · 78. UI gating and adaptation components

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S78.01 Feature-availability resolver.

- **Expected:** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:243
- **Where to find it:** no screen of its own. The resolver itself is packages/contracts/types/src/capability-handshake/evaluator.ts and packages/ui/unified-chat/src/lib/Capabilities.tsx; whether Skills is blocked for Free was not verified.
- **Needs:** a Free account (if the plan blocks Skills)
- **Steps:**
  1. Open Settings and click Skills.
  2. If the account's plan does not include Skills, read the notice title and text.
  3. Compare with Expected: one decision drives the Skills and Plugins panes and the notice explains the denial.

## S78.02 Model-dependent composer controls.

- **Expected:** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:289; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer bottom bar: model name button > Models, then pick a different model (labels found in the code)
- **Steps:**
  1. Open a new chat.
  2. Look at the bottom bar of the composer and note whether a Reasoning effort button is there.
  3. Click the model name button and choose a different model from the Models list.
  4. Look at the bottom bar again: the Reasoning effort button should appear, change or disappear according to Expected.

## S78.03 Model-dependent accepted-file types.

- **Expected:** Which files the composer accepts (or how it reacts to them) depends on what the selected model can read.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5477; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108
- **Where to find it:** Composer: + button (Add attachments and tools) > Add photos & files, then the model name button > a model that cannot read the file (labels found in the code)
- **Needs:** a file to upload (PDF or image) and a model that cannot read it
- **Steps:**
  1. Click the + button (Add attachments and tools) and choose Add photos & files; add a PDF or a photo.
  2. Click the model name button and choose a model that cannot read that file type.
  3. Look above the composer for the alert.
  4. Compare with Expected: the alert names the file kind the selected model cannot read.

## S78.04 Model-dependent reasoning options.

- **Expected:** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1313; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer bottom bar: Reasoning effort button (labels found in the code)
- **Steps:**
  1. Choose a model and click the Reasoning effort button.
  2. Read the levels offered in the panel.
  3. Choose another model, open the panel again and check that only its levels are offered.
  4. On a model where Off is not supported, read the note under the panel.

## S78.06 Model-dependent media settings.

- **Expected:** Media generation settings (duration, size, aspect) offered depend on the selected media model.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6645; apps/web/app/api/media/video/generate/route.ts:454
- **Where to find it:** Composer: + button (Add attachments and tools) > Create video, then the video setting buttons in the composer (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Use a paid account (Free has no video row).
  2. Click the + button (Add attachments and tools) and choose Create video.
  3. Click the length, quality (Select video quality) and aspect ratio buttons and note the options.
  4. Switch to another video model and compare which buttons and options appear, per Expected.

## S78.07 Tier-dependent entitlement checks.

- **Expected:** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- **Code:** done. Evidence present: apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:164
- **Where to find it:** Composer bottom bar: model name button > Models list, locked rows (labels found in the code)
- **Needs:** a Free account (a paid plan sees fewer locks)
- **Steps:**
  1. Sign in with a Free account and open the model picker.
  2. Look for rows with a lock badge: a plan name followed by and above, or Upgrade to use.
  3. Click a locked row and check that it does not switch to that model.
  4. Compare with Expected: plan checks apply to the model here and again on the server.

## S78.08 Tier-dependent remaining allowance.

- **Expected:** Each surface shows how much of the plan allowance remains, read from the server.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Usage (labels found in the code)
- **Needs:** a paid or Free account (Free shows only the upgrade card)
- **Steps:**
  1. Open Settings and click Usage.
  2. Read the This month card and the Plan usage limits card (on Free it reads Upgrade for higher capacity).
  3. Read the remaining figures, which show as a percentage left or None left.
  4. Send a chat message, click Refresh usage data (if shown), and check that the figure moved.

## S78.09 Workspace-policy restrictions.

- **Expected:** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:668; apps/web/app/api/llm/v1/chat/completions/route.ts:433; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3718
- **Where to find it:** Settings > Workspace > Workspace administration > Policy (labels found in the code)
- **Needs:** a member of a workspace (an owner or admin account to edit)
- **Steps:**
  1. Open Settings and click Workspace.
  2. Click Workspace administration.
  3. Click Policy in the console menu.
  4. Read the Workspace policy card. An owner or admin sees editable controls; a member reads Only an owner or admin can change these. You are a (role).
  5. Compare with Expected: the rules (for example Zero data retention only) apply to member chats.

## S78.10 Role restrictions.

- **Expected:** Controls restricted to workspace roles (owner/admin) are withheld from other members and refused server-side.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:428; apps/web/app/api/settings/team/route.ts:162
- **Where to find it:** Settings > Workspace (labels found in the code)
- **Needs:** two accounts in the same workspace: an owner or admin, and a plain member
- **Steps:**
  1. Sign in as an owner or admin of a workspace and open Settings > Workspace; note the Invite teammate card and the Change role and Remove member actions.
  2. Sign out and sign in as a plain member of the same workspace.
  3. Open Settings > Workspace again.
  4. Compare with Expected: those admin controls are missing for the member, and the server refuses such requests.

## S78.11 Regional restrictions.

- **Expected:** Features or routes restricted by region are enforced and the restriction is visible to the user.
- **Code:** done. Evidence present: apps/web/features/settings/sections/PrivacySection.tsx:589; apps/web/features/settings/components/UsOnlyRoutingPanel.tsx:173
- **Where to find it:** Settings > Privacy > Only use AI providers based in the US (labels found in the code)
- **Needs:** an account for which the switch is enabled (eligibility was not verified)
- **Steps:**
  1. Open Settings and click Privacy.
  2. Find the switch Only use AI providers based in the US and turn it on.
  3. Read the line Only US-based providers serve your chats. Models without one are unavailable.
  4. Open the model picker in a new chat and check which models are unavailable, then compare with Expected.

## S78.12 Age or account eligibility restrictions.

- **Expected:** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- **Code:** done. Evidence moved: apps/web/app/signup/complete/RecordTermsAcceptance.tsx:84 (quoted code not found in the file now); apps/web/app/signup/complete/RecordTermsAcceptance.tsx:106 (quoted code not found in the file now); apps/web/lib/identity/client.ts:81 (quoted code not found in the file now)
- **Where to find it:** Sign-up (new account) or sign-in to an account with no age decision > Confirm your age step (labels found in the code)
- **Needs:** a new account or one without an age decision; a test age under 18
- **Steps:**
  1. Create a new account, or sign in to an account that has no age decision yet.
  2. On Confirm your age, type an age under 18 in Your age and press Continue.
  3. Read the screen This account can't be used with the text You must be at least 18 years old to continue.
  4. Type 18 or more on another try and compare with Expected: adults continue.

## S78.13 Required-connection detection.

- **Expected:** The product detects when a feature needs an account connection that is missing and says which one.
- **Code:** done. Evidence moved: apps/web/app/plugins/[id]/page.tsx:346; apps/web/app/plugins/[id]/ConnectorChecklist.tsx:75; apps/web/features/connectors/hooks/use-connectors.ts:93 (quoted code not found in the file now)
- **Where to find it:** Plugins catalogue (/plugins) > open a plugin > Required connectors (labels found in the code)
- **Needs:** a signed-in account with at least one required connector not connected
- **Steps:**
  1. Sign in and open /plugins.
  2. Open a plugin that lists required connectors.
  3. Read the Required connectors list: connected rows show Connected, others show Connect.
  4. Compare with Expected: a missing connection is named and marked with Connect.

## S78.14 Required-device detection.

- **Expected:** The surface detects whether a required device (paired desktop, phone) is available and says so before the user relies on it.
- **Code:** done. Evidence present: apps/web/features/desktop-host/hooks/use-paired-desktop.ts:55; apps/web/features/desktop-host/hooks/use-paired-desktop.ts:62; apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:48; apps/web/features/code/components/CodeRail.tsx:169
- **Where to find it:** Code (sidebar) > More > Work with local code; a cloud session row menu > Open in > Desktop app (labels found in the code)
- **Needs:** none to see the no-desktop case; a paired desktop app to see its status
- **Steps:**
  1. Click Code in the app and click More in the rail.
  2. Read Work with local code: with a paired desktop it names the desktop; without one it links to the download page.
  3. Hover the item to read the status (for example is online, is asleep, is offline).
  4. Compare with Expected: the status shows before you rely on the desktop.

## S78.15 Required-runtime detection.

- **Expected:** The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:687; apps/web/app/api/code/sessions/route.ts:61
- **Where to find it:** Code (sidebar) > the cloud session area: notice above the composer (labels found in the code)
- **Needs:** a Free account (to see the plan notice)
- **Steps:**
  1. Click Code in the app.
  2. With a Free plan, read the notice Your plan does not include managed environments. and the Upgrade button.
  3. If the deployment has managed environments off, the notice reads Managed environments are not enabled on this deployment.
  4. Compare with Expected: the feature is gated and the create action is not offered.

## S78.16 Unsupported versus temporarily unavailable distinction.

- **Expected:** The surface tells apart a feature that is unsupported here from one that is only temporarily unavailable.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:41; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:319; apps/web/app/api/llm/v1/models/route.ts:157
- **Where to find it:** Composer bottom bar: model name button > Models > All models (labels found in the code)
- **Needs:** none (to see the unavailable state, a model that is temporarily down is needed)
- **Steps:**
  1. Open the model picker and click All models.
  2. Look for rows marked Temporarily unavailable.
  3. Look for rows marked Not available in this app.
  4. Compare with Expected: the two states read differently; a row can only show one.

## S78.17 Hidden irrelevant controls.

- **Expected:** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1077; apps/web/features/chat/components/Composer/ComposerFooter.tsx:289; apps/web/features/chat/components/Composer/ComposerFooter.tsx:289
- **Where to find it:** Composer bottom bar: model name button, then compare two models (labels found in the code)
- **Needs:** none (to see a model without the effort control, try a few models)
- **Steps:**
  1. Choose a model and look at the bottom bar for a Reasoning effort button.
  2. Choose a model without that control and check the button is gone, not greyed out.
  3. Open the + menu (Add attachments and tools) and check Create image appears only if your plan allows it.
  4. Compare with Expected: irrelevant controls are hidden.

## S78.18 Disabled but discoverable restricted controls.

- **Expected:** Restricted controls stay visible but disabled, with the reason, so users can discover them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:214; apps/web/features/chat/components/Composer/ComposerFooter.tsx:654; apps/web/features/chat/components/Composer/ComposerFooter.tsx:323 (quoted code not found in the file now)
- **Where to find it:** Composer: + button (Add attachments and tools) > Deep Research (dimmed); model picker rows with badges (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. With a Free account, click the + button (Add attachments and tools).
  2. Check that the Deep Research row is dimmed.
  3. Hover the Deep Research row and read the reason.
  4. Open the model picker and compare the dimmed rows and badges (Coming soon, Beta) with Expected.

## S78.19 Upgrade explanation.

- **Expected:** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2631; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3657 (quoted code not found in the file now)
- **Where to find it:** Composer: + button (Add attachments and tools) > Deep Research, and the model picker's locked rows (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. With a Free account, click the + button (Add attachments and tools).
  2. Hover Deep Research and read Upgrade to use Deep Research.
  3. Open the model picker and read the locked row badge, which names the plan (and above).
  4. Compare with Expected: the text names which plan unlocks it and how to upgrade.

## S78.20 Connect-account explanation.

- **Expected:** When a feature needs an account connection, the user is told which account to connect and given a way to connect it.
- **Code:** done. Evidence moved: apps/web/app/plugins/[id]/ConnectorChecklist.tsx:92; apps/web/app/plugins/[id]/ConnectorChecklist.tsx:75; apps/web/features/connectors/hooks/use-connectors.ts:93 (quoted code not found in the file now)
- **Where to find it:** Plugins catalogue (/plugins) > open a plugin > Required connectors > Connect (labels found in the code)
- **Needs:** a signed-in account and an outside account for that connector (the connector's own sign-in)
- **Steps:**
  1. Open a plugin that lists required connectors while signed in.
  2. Find a connector that shows Connect.
  3. Click Connect (it links to the connectors page) and connect it.
  4. Return to the plugin page and check the row now shows Connected.

## S78.21 Grant-permission explanation.

- **Expected:** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- **Code:** done. Evidence moved: apps/web/features/chat/hooks/use-dictation.ts:78 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/web for microphone and permission copy (use-dictation.ts, VoiceSection.tsx, rg across features, lib and app); found only The microphone could not be started. Try again. and Settings > Voice > Dictation text Speak into the composer with the microphone button. No explanation before the browser prompt was found; the Tool approvals menu in ComposerPlusMenu.tsx was not read for it.
- **Needs:** a microphone

## S78.22 Use-another-model explanation.

- **Expected:** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5477; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5108
- **Where to find it:** Composer: add a file, then model name button > a model that cannot read it; alert above the composer (labels found in the code)
- **Needs:** a file to upload and a model that cannot read it
- **Steps:**
  1. Add a PDF or photo with + (Add photos & files).
  2. Choose a model that cannot read that file from the model name button.
  3. Read the alert: it names the file kind and says to switch to Auto or choose a model that can read it.
  4. Click Choose a compatible model to see the models that can read it, then compare with Expected.

## S78.23 Continue-on-another-device action.

- **Expected:** When work fits another device or app better, the surface offers an action that continues it there.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:19; apps/web/features/code/components/CodeRail.tsx:169; apps/web/features/code/components/CodeSessionMenu.tsx:95; packages/contracts/local-runtime/src/host-bridge.ts:10
- **Where to find it:** Code (sidebar) > More > Work with local code; a cloud session row menu > Open in > Desktop app (labels found in the code)
- **Needs:** a paired desktop app to see the continue action (without one, the download page)
- **Steps:**
  1. Click Code in the app and click More.
  2. Click Work with local code: with a paired desktop it opens the desktop; without one it goes to the download page.
  3. Open a cloud session's menu, go to Open in, and click Desktop app.
  4. Compare with Expected: the work continues on the other device or app.

## S78.25 Attachment-preservation choice after model change.

- **Expected:** After switching to a model that cannot use the current attachments, the user chooses to keep them (by switching model) or remove them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5445; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1511
- **Where to find it:** Composer: add a file, then model name button > a model that cannot read it; alert offers Remove attachments and Choose a compatible model (labels found in the code)
- **Needs:** a file to upload and a model that cannot read it
- **Steps:**
  1. Add a file with + (Add photos & files).
  2. Switch to a model that cannot read it.
  3. In the alert, click Choose a compatible model and pick a model that can read the file (this keeps the file).
  4. Or click Remove attachments (this removes it). Compare with Expected: the user chooses to keep or remove.

## S78.26 Unsupported-parameter removal or correction.

- **Expected:** Parameters the chosen model cannot take are removed or corrected before the request is sent.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1313; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Composer bottom bar: Reasoning effort button > panel (labels found in the code)
- **Needs:** none (a model where Off is unsupported is needed)
- **Steps:**
  1. Choose a model with a reasoning control and click Reasoning effort.
  2. Try to turn thinking off on a model that does not support Off.
  3. Read the note Off is not supported by this model. Using (the level it will use).
  4. Send a message and check that the chat still works, then compare with Expected.

## S78.28 Live updates after a plan, policy, connection, or device change.

- **Expected:** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1067; apps/web/features/billing/hooks/use-billing-queries.ts:108
- **Where to find it:** no screen of its own. Billing data refetches on window focus (apps/web/features/billing/hooks/use-billing-queries.ts); the refresh path for the capability decisions was not traced.
- **Needs:** a test account that can change plan
- **Steps:**
  1. Note the locked model rows and the Deep Research row in the composer.
  2. Change the plan in Settings > Billing (Checkout or the billing portal).
  3. Return to the app tab without reloading or restarting.
  4. Reopen the model picker and the + menu and compare the locks and Deep Research row with Expected.
