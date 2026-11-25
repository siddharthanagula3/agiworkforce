---
id: "PLAN-mobile-078"
type: "test-plan"
title: "Mobile · 78. UI gating and adaptation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "78"
---
# Mobile · 78. UI gating and adaptation components

22 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S78.01 Feature-availability resolver.

- **Expected:** One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatExecutionStore.ts:3255; apps/mobile/src/features/billing/store.ts:176; apps/mobile/src/lib/capabilities.tsx:126
- **Where to find it:** no screen of its own. The resolver itself is code in apps/mobile/src/lib/capabilities.tsx (useCapability); there is no screen for it.
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Tap the model name beside the + button in a chat's composer.
  2. Pick a model that has reasoning effort levels, then close the picker.
  3. Pick a model that has none, then reopen the picker and look for the Effort section.
  4. Compare what appears and disappears with Expected.

## S78.02 Model-dependent composer controls.

- **Expected:** Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelRow.tsx:73; apps/mobile/src/features/chat/components/ComposerEffort.tsx:21; apps/mobile/services/streaming.ts:402
- **Where to find it:** Chat > model name beside the + button in the composer > model picker > Effort section and With thinking switch. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open a chat, then tap the model name beside the + button in the composer.
  2. Pick a model that has reasoning effort levels and check that an Effort slider appears in the picker.
  3. Close the picker and look at the right end of the composer toolbar for the effort button.
  4. Pick a model with no effort levels and check that the effort button is gone. Compare with Expected.

## S78.03 Model-dependent accepted-file types.

- **Expected:** Which files the composer accepts (or how it reacts to them) depends on what the selected model can read.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:880 (quoted code not found in the file now); apps/mobile/src/features/chat/utils/attachmentValidation.ts:95
- **Where to find it:** Chat > + (Add to chat) > File or Photos. (labels found in the code)
- **Needs:** a file the app should refuse, such as one with an unusual type
- **Steps:**
  1. Open a chat and tap the + button labelled Add to chat in the composer.
  2. Tap File and choose a file type the app does not accept.
  3. Look for the message that says the file isn’t an accepted file type and asks for a JPEG, PNG, GIF, or WebP image instead.
  4. Switch to another model and repeat. Compare with Expected.

## S78.04 Model-dependent reasoning options.

- **Expected:** The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/EffortSlider.tsx:38; apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** Chat > model name beside + > model picker > Effort slider; also Settings > Device > General > Default effort. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Tap the model name beside the + button in the composer.
  2. Pick a model with effort levels and read the Effort slider labels (for example Direct, Brief, Quick, Balanced, Deep, Extended, Maximum).
  3. Pick a different model and check that the slider now shows only the levels that model supports.
  4. Open Settings, then General, and find Default effort. Compare with Expected.

## S78.06 Model-dependent media settings.

- **Expected:** Media generation settings (duration, size, aspect) offered depend on the selected media model.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1104; apps/mobile/src/features/video/services/videogen.ts (text found, layout changed)
- **Where to find it:** Chat > + (Add to chat) > Create video (or Create image) > Aspect ratio and Quality rows. (labels found in the code)
- **Needs:** an account whose plan includes video generation
- **Steps:**
  1. Open a chat and tap the + button labelled Add to chat.
  2. Tap Create video. It appears only when the account plan and the video model allow it.
  3. Look for the Aspect ratio heading and the Quality heading with their options; quality rows may show hints such as a duration in seconds.
  4. Change the aspect ratio, or pick another media model if one is offered, and compare the options with Expected.

## S78.07 Tier-dependent entitlement checks.

- **Expected:** Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:336; apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5333
- **Where to find it:** Chat > model name beside + > model picker, rows marked Not included in plan or Sign in required. (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account, or with an account on a lower plan.
  2. Tap the model name beside the + button in the composer.
  3. Look for model rows that show Not included in plan (or Sign in required when signed out).
  4. Compare with Expected.

## S78.08 Tier-dependent remaining allowance.

- **Expected:** Each surface shows how much of the plan allowance remains, read from the server.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:167; apps/mobile/services/usage.ts:89
- **Where to find it:** Drawer > Settings > Cloud > Usage. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in, open the drawer and tap Settings.
  2. Find the Cloud group and tap Usage.
  3. Read the Credit balances and Resets sections and the This month section, including the used or remaining figures.
  4. Compare the remaining allowance shown with Expected.

## S78.09 Workspace-policy restrictions.

- **Expected:** Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/services/streaming.ts:402; apps/web/app/api/llm/v1/chat/completions/route.ts:433; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3718
- **Where to find it:** no screen of its own. No mobile screen to set workspace policy was found; the policy is applied by the server.
- **Needs:** a member account in a workspace, and an administrator who can switch a feature off
- **Steps:**
  1. Sign in as a member of a workspace where an administrator has turned a feature off.
  2. Try to use that feature from the chat composer or its menu.
  3. Look for the title Turned off by your organization on the blocked screen and compare with Expected.

## S78.10 Role restrictions.

- **Expected:** Controls restricted to workspace roles (owner/admin) are withheld from other members and refused server-side.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/workspace.tsx:342
- **Where to find it:** Drawer > Settings > Account > Workspace. (labels found in the code)
- **Needs:** two accounts in the same workspace: one member, and one owner or admin
- **Steps:**
  1. Sign in, open the drawer, tap Settings, then tap Workspace under the Account group.
  2. As a plain member, look at the member list: no Change role button should be shown.
  3. Sign in as a workspace owner or admin, reopen Workspace, and look for Change role on another member.
  4. Open the role dialog as an owner and check for Transfer ownership. Compare with Expected.

## S78.11 Regional restrictions.

- **Expected:** Features or routes restricted by region are enforced and the restriction is visible to the user.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-privacy/UsOnlyRoutingGroup.tsx:73; apps/mobile/src/features/settings/cloud-privacy/index.tsx:161 (quoted code not found in the file now)
- **Where to find it:** Drawer > Settings > Assistant > Privacy > Only use AI providers based in the US. (labels found in the code)
- **Needs:** a Cloud-mode account on a plan that includes the US-only setting
- **Steps:**
  1. Sign in to Cloud mode, open the drawer and tap Settings.
  2. Under Assistant, tap Privacy.
  3. Look for the switch Only use AI providers based in the US. It appears only in Cloud mode for eligible plans.
  4. Turn the switch on, leave the screen, come back and check that it stays on. Compare with Expected.

## S78.12 Age or account eligibility restrictions.

- **Expected:** Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- **Code:** done. Evidence moved: apps/mobile/src/features/auth/services/rootRouting.ts:28 (quoted code not found in the file now); apps/mobile/src/features/auth/services/ageGate.ts:128 (quoted code not found in the file now)
- **Where to find it:** First launch, on the age screen titled Your age (before sign-in). Refusal shows the Age requirement screen. (labels found in the code)
- **Needs:** a fresh install or cleared app data, so the age check runs again
- **Steps:**
  1. Use a fresh install or clear the app data so no age was recorded.
  2. On the Your age screen, type an age below the minimum shown in the subtitle in the Enter your age field.
  3. Tap Continue.
  4. Look for the Age requirement screen and its refusal message. Compare with Expected.

## S78.14 Required-device detection.

- **Expected:** The surface detects whether a required device (paired desktop, phone) is available and says so before the user relies on it.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/PairingStatus.tsx:75 (quoted code not found in the file now); apps/mobile/src/features/companion/components/ConnectionStateViews.tsx:69 (quoted code not found in the file now); apps/mobile/app/(app)/companion/index.tsx:95; apps/mobile/app/(app)/companion/index.tsx:241
- **Where to find it:** Drawer > AGI Code > Add device (opens the Remote pairing screen). (labels found in the code)
- **Needs:** a desktop app with AGI installed, paired or not, and optionally a second device
- **Steps:**
  1. Sign in, open the drawer and tap AGI Code.
  2. If no computer is paired, tap Add device in the devices section.
  3. Read the connection status line: Not connected when nothing is paired, or the desktop name with offline when it is not reachable.
  4. Tap Scan QR Code if shown. Compare the status with Expected while the desktop app is closed and then open.

## S78.15 Required-runtime detection.

- **Expected:** The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelRow.tsx:253; apps/mobile/src/features/model-picker/service.ts:168
- **Where to find it:** Chat > model name beside + > model picker > On device group. (labels found in the code)
- **Needs:** none for viewing; a phone with enough free storage to download
- **Steps:**
  1. Tap the model name beside the + button in the composer.
  2. Look for the On device group heading.
  3. Read the badge on each on-device model: Download (not installed), Ready (installed), Retry (download failed), or Device (this device cannot run it).
  4. Tap a Download model and compare the result with Expected.

## S78.16 Unsupported versus temporarily unavailable distinction.

- **Expected:** The surface tells apart a feature that is unsupported here from one that is only temporarily unavailable.
- **Code:** done. Evidence moved: apps/mobile/src/lib/capabilities.tsx:156; apps/mobile/src/lib/capabilities.tsx:86 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The tester cannot switch an operator flag, so the temporary case may not be reproducible from the app alone.
- **Needs:** an operator who can switch a feature off on the server
- **Steps:**
  1. Only an operator can switch a feature off on the server, so this step needs that switch.
  2. Open the gated feature while the switch is on and read the title and body.
  3. Look for the body It’s paused while we fix an issue and will come back without an update. That is the temporary case.
  4. Compare with the plan case, which says Not included in your plan, and with Expected.

## S78.17 Hidden irrelevant controls.

- **Expected:** Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- **Code:** done. Evidence present: apps/mobile/src/lib/capabilities.tsx:126; apps/mobile/src/features/model-picker/components/ModelRow.tsx:73; apps/mobile/src/features/chat/components/ChatInput.tsx:460
- **Where to find it:** Chat > composer toolbar: the effort button appears only for models that have effort levels; the voice button appears only when voice is allowed. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account; a second account on a plan without voice to see the voice button hidden
- **Steps:**
  1. Open a chat with a signed-in Cloud account and look at the right end of the composer toolbar.
  2. Pick a model with effort levels and check that the effort button (showing a level such as Balanced) appears.
  3. Pick a model without effort levels and check that the button is gone, not greyed out.
  4. Compare with Expected.

## S78.18 Disabled but discoverable restricted controls.

- **Expected:** Restricted controls stay visible but disabled, with the reason, so users can discover them.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/service.ts:188; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now); apps/mobile/src/features/model-picker/service.ts:185
- **Where to find it:** Chat > model name beside + > model picker > rows that are greyed out with the reason Not included in plan. (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in on a Free account, then tap the model name beside the + button.
  2. Look for model rows that are greyed out and show Not included in plan under the name.
  3. Tap a greyed row and compare what happens with Expected.

## S78.19 Upgrade explanation.

- **Expected:** When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:141; apps/mobile/app/(app)/chat/[id].tsx:699
- **Where to find it:** Chat > model name beside + > choose a model from another provider mid-chat > alert Start a new chat for this model. Also Not included in your plan on the paywall sheet. (labels found in the code)
- **Needs:** a Free account and a chat that already uses one provider
- **Steps:**
  1. Sign in on a Free account and open a chat that already uses one provider.
  2. Tap the model name beside the + button and choose a model from a different provider.
  3. Read the alert Start a new chat for this model and its message.
  4. Check whether a plan name or an upgrade button is shown. Compare with Expected.

## S78.21 Grant-permission explanation.

- **Expected:** When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/permissions/registry.ts:166; apps/mobile/src/features/settings/permissions/registry.ts:42
- **Where to find it:** Settings > Device > Permissions. (labels found in the code)
- **Steps:**
  1. Open Settings from the drawer and tap Permissions under the Device group.
  2. Read the rows Microphone, Speech Recognition, Camera and Photos & Files with their one-line descriptions.
  3. Tap Microphone and read what it is used for before any system prompt.
  4. Compare with Expected.

## S78.22 Use-another-model explanation.

- **Expected:** When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:221; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:214
- **Where to find it:** Chat > + (Add to chat) > Create image > attach a photo as a reference, then choose an image model that cannot edit. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with image generation
- **Steps:**
  1. Open a chat, tap the + button labelled Add to chat and tap Create image.
  2. Attach a photo with Photos.
  3. Switch the image model to one that cannot edit attached images.
  4. Send a prompt and read the message that says the model cannot edit the attached image and asks you to pick another image model or remove the attachment. Compare with Expected.

## S78.24 Explicit processing-path selection.

- **Expected:** The user can explicitly choose where a request is processed (local model, own key, managed cloud).
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/service.ts:37; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166 (quoted code not found in the file now)
- **Where to find it:** Chat > model name beside + > model picker > On device group versus AGI Cloud models. (labels found in the code)
- **Needs:** a signed-in account; an on-device model installed for the on-device path
- **Steps:**
  1. Tap the model name beside the + button in the composer.
  2. Look at the On device group and pick a model there; its badge shows its install state.
  3. Pick a cloud model and read its detail line, which names the provider.
  4. If a provider is turned off for the account, look for the note Turned off for your account. You can turn it on when you send. Compare with Expected.

## S78.26 Unsupported-parameter removal or correction.

- **Expected:** Parameters the chosen model cannot take are removed or corrected before the request is sent.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:50 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826
- **Where to find it:** no screen of its own. The request filter lives in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts and cannot be seen from the app.
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Pick a model that has no effort levels, then look at the composer toolbar.
  2. Check that no effort button is shown, which means no effort value is offered for that model.
  3. Compare with Expected.

## S78.28 Live updates after a plan, policy, connection, or device change.

- **Expected:** After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- **Code:** done. Evidence present: apps/mobile/src/lib/capabilities.tsx:118; apps/mobile/src/lib/capabilities.tsx:126
- **Where to find it:** no screen of its own. The refresh is in apps/mobile/src/lib/capabilities.tsx (AppState change to active); the change itself must be made outside the app.
- **Needs:** a second device or the web to change the plan or setting
- **Steps:**
  1. Sign in and note which gated controls are on, such as the effort button or the Remote entry.
  2. Change the plan or a setting for that account on the web, then send the app to the background and bring it back.
  3. Reopen the model picker and the composer and check whether the controls changed without restarting. Compare with Expected.
