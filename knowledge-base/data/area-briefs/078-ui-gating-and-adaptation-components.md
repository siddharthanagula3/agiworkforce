# Area 78. UI gating and adaptation components

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S78.01 Feature-availability resolver.
- Should: One resolver combines model, plan, surface and operator switches to say whether each feature is available here, and the surface's controls read it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:209; apps/mobile/stores/chat/chatExecutionStore.ts:1680; apps/mobile/src/features/billing/store.ts:160; apps/mobile/src/lib/capabilities.tsx:86; apps/cli/src/tier_cache.rs:245; apps/cli/src/voice.rs:958; apps/cli/src/skills.rs:141; apps/extension-vscode/src/utils/api.ts:825

## S78.02 Model-dependent composer controls.
- Should: Composer controls (effort, thinking, attachment options) appear, change or disappear according to the selected model.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:255; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4030; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1033; apps/mobile/src/features/model-picker/components/ModelRow.tsx:70; apps/mobile/src/features/chat/components/ComposerEffort.tsx:20; apps/mobile/services/streaming.ts:167; apps/cli/src/tui/widgets/model_picker.rs:280; apps/cli/src/models/streaming.rs:485

## S78.03 Model-dependent accepted-file types.
- Should: Which files the composer accepts (or how it reacts to them) depends on what the selected model can read.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4030; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4069; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3611; apps/mobile/src/features/chat/components/ChatInput.tsx:880; apps/mobile/src/features/chat/utils/attachmentValidation.ts:47; apps/cli/src/tui/tui_app.rs:587; apps/cli/src/tui/tui_app.rs:618

## S78.04 Model-dependent reasoning options.
- Should: The reasoning/effort options offered match the selected model, and unsupported levels are not sent.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1168; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1033; apps/mobile/src/features/model-picker/components/EffortSlider.tsx:33; apps/mobile/services/streaming.ts:167; apps/cli/src/models/streaming.rs:485; apps/cli/src/model_catalog.rs:1740; apps/extension-vscode/src/features/model-picker/modelConstants.ts:329; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3977

## S78.05 Model-dependent sampling options.
- Should: Sampling options offered or sent depend on the selected model.
- Status: cli done, api done
- Code: apps/cli/src/tui/tui_app.rs:4895; apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:128; packages/ai/providers/anthropic/src/translate.ts:308

## S78.06 Model-dependent media settings.
- Should: Media generation settings (duration, size, aspect) offered depend on the selected media model.
- Status: web done, desktop done, mobile done, cli done, vscode missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4921; apps/web/app/api/media/video/generate/route.ts:411; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:692; apps/mobile/src/features/video/services/videogen.ts:65; apps/cli/src/cloud/image.rs:100; apps/cli/src/lib.rs:2622

## S78.07 Tier-dependent entitlement checks.
- Should: Plan entitlements are checked for each gated feature and model, in the UI and again on the server, for every route that runs a model.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:161; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:152; apps/mobile/services/streaming.ts:167; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3631; apps/cli/src/errors.rs:352; apps/cli/src/models/provider_dispatch.rs:300; apps/extension-vscode/src/features/model-picker/modelConstants.ts:243; apps/extension-vscode/src/utils/api.ts:581

## S78.08 Tier-dependent remaining allowance.
- Should: Each surface shows how much of the plan allowance remains, read from the server.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/UsageSection.tsx:125; apps/web/lib/hooks/useManagedUsageSummary.ts:67; apps/mobile/src/features/settings/cloud-usage/index.tsx:96; apps/mobile/services/usage.ts:45; apps/cli/src/usage_summary.rs:295; apps/cli/src/usage_summary.rs:146; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:509; apps/extension-vscode/src/utils/api.ts:837

## S78.09 Workspace-policy restrictions.
- Should: Workspace administrators' policies (feature switches, model policy, retention) restrict what members can use on every surface.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/WorkspacePolicySection.tsx:622; apps/web/app/api/llm/v1/chat/completions/route.ts:393; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2431; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/services/streaming.ts:167; apps/cli/src/provider.rs:260; apps/cli/src/models/streaming.rs:234; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239

## S78.10 Role restrictions.
- Should: Controls restricted to workspace roles (owner/admin) are withheld from other members and refused server-side.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/TeamSection.tsx:247; apps/web/app/api/settings/team/route.ts:131; apps/mobile/app/(app)/settings/workspace.tsx:268

## S78.11 Regional restrictions.
- Should: Features or routes restricted by region are enforced and the restriction is visible to the user.
- Status: web done, desktop done, mobile done, api done
- Code: apps/web/features/settings/sections/PrivacySection.tsx:606; apps/web/features/settings/components/UsOnlyRoutingPanel.tsx:61; apps/mobile/src/features/settings/cloud-privacy/UsOnlyRoutingGroup.tsx:30; apps/mobile/src/features/settings/cloud-privacy/index.tsx:161; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1904; packages/ai/routing/src/auto.ts:1024

## S78.12 Age or account eligibility restrictions.
- Should: Age or account-eligibility rules gate access, with a check at sign-up or first run and restricted behaviour for ineligible users.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/signup/complete/RecordTermsAcceptance.tsx:84; apps/web/app/signup/complete/RecordTermsAcceptance.tsx:106; apps/web/lib/identity/client.ts:81; apps/mobile/src/features/auth/services/rootRouting.ts:28; apps/mobile/src/features/auth/services/ageGate.ts:128; apps/web/app/auth/device/page.tsx:127; apps/cli/src/oauth.rs:363; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:137

## S78.13 Required-connection detection.
- Should: The product detects when a feature needs an account connection that is missing and says which one.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/plugins/[id]/page.tsx:343; apps/web/app/plugins/[id]/ConnectorChecklist.tsx:29; apps/web/features/connectors/hooks/use-connectors.ts:93

## S78.14 Required-device detection.
- Should: The surface detects whether a required device (paired desktop, phone) is available and says so before the user relies on it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/desktop-host/hooks/use-paired-desktop.ts:55; apps/web/features/desktop-host/hooks/use-paired-desktop.ts:62; apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:48; apps/web/features/code/components/CodeRail.tsx:268; apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:30; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:253; apps/mobile/src/features/companion/components/PairingStatus.tsx:75; apps/mobile/src/features/companion/components/ConnectionStateViews.tsx:69

## S78.15 Required-runtime detection.
- Should: The surface detects whether the runtime a feature needs (sandbox, local model runtime, CLI) is available and gates the feature on it.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/CloudCodePage.tsx:309; apps/web/app/api/code/sessions/route.ts:113; apps/mobile/src/features/model-picker/components/ModelRow.tsx:169; apps/mobile/src/features/model-picker/service.ts:194; apps/cli/src/provider.rs:299; apps/cli/src/provider.rs:260; apps/extension-vscode/src/integrations/localRuntimeClient.ts:79; apps/extension-vscode/src/integrations/localRuntimeClient.ts:89

## S78.16 Unsupported versus temporarily unavailable distinction.
- Should: The surface tells apart a feature that is unsupported here from one that is only temporarily unavailable.
- Status: web done, desktop done, mobile done, cli done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:30; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:223; apps/web/app/api/llm/v1/models/route.ts:105; apps/mobile/src/lib/capabilities.tsx:92; apps/mobile/src/lib/capabilities.tsx:86; apps/cli/src/provider.rs:341; apps/cli/src/provider.rs:373; apps/cli/src/lib.rs:3291

## S78.17 Hidden irrelevant controls.
- Should: Controls that cannot apply in the current context (model, host, platform) are hidden instead of shown broken.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:886; apps/web/features/chat/components/Composer/ComposerFooter.tsx:255; apps/mobile/src/lib/capabilities.tsx:86; apps/mobile/src/features/model-picker/components/ModelRow.tsx:51; apps/mobile/src/features/chat/components/ChatInput.tsx:142; apps/cli/src/tui/tui_app.rs:777; apps/cli/src/tui/tui_app.rs:785; apps/cli/src/tui/tui_app.rs:2306

## S78.18 Disabled but discoverable restricted controls.
- Should: Restricted controls stay visible but disabled, with the reason, so users can discover them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:183; apps/web/features/chat/components/Composer/ComposerFooter.tsx:606; apps/web/features/chat/components/Composer/ComposerFooter.tsx:323; apps/mobile/src/features/model-picker/service.ts:215; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/mobile/src/features/model-picker/service.ts:212; apps/cli/src/provider.rs:362; apps/cli/src/model_catalog.rs:809

## S78.19 Upgrade explanation.
- Should: When a plan blocks something, the user is told which plan unlocks it and how to upgrade.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2111; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3657; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:83; apps/mobile/app/(app)/chat/[id].tsx:401; apps/cli/src/errors.rs:352; apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:72; apps/extension-vscode/src/utils/api.ts:78; apps/extension/src/side_panel.ts:8360

## S78.20 Connect-account explanation.
- Should: When a feature needs an account connection, the user is told which account to connect and given a way to connect it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/app/plugins/[id]/ConnectorChecklist.tsx:51; apps/web/app/plugins/[id]/ConnectorChecklist.tsx:29; apps/web/features/connectors/hooks/use-connectors.ts:93

## S78.21 Grant-permission explanation.
- Should: When a feature needs a permission (microphone, site access, agent autonomy), the surface explains what it is for before or when asking.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/hooks/use-dictation.ts:78; apps/mobile/src/features/settings/permissions/registry.ts:105; apps/mobile/src/features/settings/permissions/registry.ts:30; apps/cli/src/features/exec/tools/mod.rs:686; apps/cli/src/features/exec/tools/mod.rs:675; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:130; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:190; apps/extension/src/side_panel.ts:7645

## S78.22 Use-another-model explanation.
- Should: When the selected model cannot do what was asked, the user is told to use another model (ideally which one).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4030; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4069; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3611; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:183; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:177; apps/cli/src/errors.rs:475; apps/cli/src/errors.rs:468; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:354

## S78.23 Continue-on-another-device action.
- Should: When work fits another device or app better, the surface offers an action that continues it there.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:19; apps/web/features/code/components/CodeRail.tsx:268; apps/web/features/code/components/CodeSessionMenu.tsx:91; packages/contracts/local-runtime/src/host-bridge.ts:10; apps/web/features/desktop-host/lib/deep-links.ts:45; apps/cli/src/cloud/mod.rs:178; apps/cli/src/claude_parity.rs:141; apps/extension-vscode/package.json:482

## S78.24 Explicit processing-path selection.
- Should: The user can explicitly choose where a request is processed (local model, own key, managed cloud).
- Status: desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:167; apps/web/features/desktop-host/lib/runtime-client.ts:386; apps/desktop/electron/runtime/dispatcher.ts:799; apps/desktop/electron/preload.ts:145; apps/mobile/src/features/model-picker/service.ts:30; apps/mobile/src/features/model-picker/components/ModelRow.tsx:166; apps/cli/src/lib.rs:1632; apps/cli/src/lib.rs:1638

## S78.25 Attachment-preservation choice after model change.
- Should: After switching to a model that cannot use the current attachments, the user chooses to keep them (by switching model) or remove them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4030; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3955; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1202

## S78.26 Unsupported-parameter removal or correction.
- Should: Parameters the chosen model cannot take are removed or corrected before the request is sent.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1168; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1033; apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:50; apps/cli/src/config.rs:89; apps/cli/src/models/streaming.rs:301; apps/extension-vscode/src/features/model-picker/modelConstants.ts:338; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2873; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:94

## S78.27 Effective-capability inspector.
- Should: A view shows what is effectively available to this user on this surface and why anything is not.
- Status: not applicable anywhere

## S78.28 Live updates after a plan, policy, connection, or device change.
- Should: After a plan, policy, connection or device change, gated controls update without reinstalling or restarting.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:879; apps/web/features/billing/hooks/use-billing-queries.ts:153; apps/mobile/src/lib/capabilities.tsx:75; apps/mobile/src/lib/capabilities.tsx:86; apps/cli/src/tier_cache.rs:42; apps/cli/src/provider.rs:260; apps/extension-vscode/src/integrations/tierRevalidation.ts:18; apps/extension-vscode/src/features/model-picker/modelConstants.ts:239
