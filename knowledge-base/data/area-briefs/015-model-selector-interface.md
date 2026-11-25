# Area 15. Model-selector interface

35 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S15.01 Current-model label.
- Should: The composer always shows the name of the model the next message will use.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1015; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4964; apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:39; apps/mobile/src/features/chat/components/ChatInput.tsx:1128; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:383; apps/cli/src/tui/tui_app.rs:3406; apps/cli/src/tui/tui_app.rs:1200

## S15.02 Provider label.
- Should: Each model in the selector shows which provider or developer makes it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:516; apps/web/features/chat/components/Composer/ComposerFooter.tsx:685; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043; apps/mobile/src/features/model-picker/components/ModelRow.tsx:80; apps/mobile/src/features/model-picker/components/ModelRow.tsx:195; apps/mobile/src/features/model-picker/components/ProviderMark.tsx:6; apps/cli/src/tui/widgets/model_picker.rs:478

## S15.03 Model-family grouping.
- Should: Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:81; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:737; packages/ai/routing/src/model-picker.ts:236; packages/ai/routing/src/__tests__/model-picker.test.ts:41; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:879; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:881; crates/agiworkforce-model-registry/src/lib.rs:544; apps/cli/src/tui/widgets/model_picker.rs:165

## S15.04 Searchable model list.
- Should: The user can type to filter the model list by name.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:346; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:283; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:533; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:273; apps/cli/src/tui/widgets/model_picker.rs:109; apps/cli/src/tui/widgets/model_picker.rs:427; apps/cli/src/tui/tui_app.rs:1200

## S15.05 Favorite models.
- Should: The user can mark models as favourites and see them together at the top.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:586; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1474; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1081; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:699; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:179

## S15.06 Recently used models.
- Should: The selector lists the models the user used most recently.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:321; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1016; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:680; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:383

## S15.07 Recommended models.
- Should: The selector highlights a short list of recommended models for the user.
- Status: web done, desktop done, cli missing, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1461; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1102; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4964; apps/extension/src/side_panel.ts:7924; apps/extension/src/side_panel.ts:7930; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:138

## S15.08 Automatic-selection option.
- Should: The user can choose Auto so the product picks a model per message.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1436; apps/web/features/chat/components/Composer/ComposerFooter.tsx:174; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:671; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:383; apps/cli/src/lib.rs:461; apps/cli/src/lib.rs:4317; apps/cli/src/lib.rs:4350

## S15.09 Default-profile option.
- Should: The user can set which model or profile new chats start with, as a lasting default.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1053; apps/web/features/settings/sections/GeneralSection.tsx:1087; apps/web/features/chat/lib/default-model-preference.ts:95; apps/web/features/chat/hooks/use-new-chat-default-model.ts:32; apps/cli/src/lib.rs:1194; apps/cli/src/lib.rs:2264; apps/extension-vscode/package.json:997; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1225

## S15.10 Explicit model selection.
- Should: The user can pick a specific model and the next message uses it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:676; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1015; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4964; apps/mobile/src/features/model-picker/components/ModelRow.tsx:150; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:356; apps/mobile/app/(app)/(tabs)/chat.tsx:942; apps/cli/src/tui/widgets/model_picker.rs:487

## S15.11 Model description.
- Should: Each model in the selector has a short description of what it is good for.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:660; apps/web/features/chat/components/Composer/ComposerFooter.tsx:403; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043; apps/cli/src/tui/widgets/model_picker.rs:409; apps/cli/src/tui/widgets/model_picker.rs:423; apps/cli/src/model_catalog.rs:1692; apps/extension-vscode/src/features/model-picker/modelConstants.ts:240; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3676

## S15.12 Input-modality badges.
- Should: Models show which inputs they accept (e.g. images, audio) as badges.
- Status: web done, desktop done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:64; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:202; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:283; apps/cli/src/tui/tui_app.rs:3458; apps/cli/src/tui/tui_app.rs:3454

## S15.13 Output-modality badges.
- Should: Models show which outputs they produce (e.g. image, video, audio) as badges.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:77; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:202; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:283

## S15.14 Tool-support badge.
- Should: Models show whether they can use tools.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:70; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:202; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:283; apps/cli/src/tui/tui_app.rs:3458; apps/cli/src/tui/tui_app.rs:3454

## S15.15 Context-capacity information.
- Should: The selector shows how much context each model can hold.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:114; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; apps/cli/src/tui/widgets/model_picker.rs:573; apps/cli/src/tui/widgets/model_picker.rs:487; apps/cli/src/tui/tui_app.rs:3454; apps/web/app/api/llm/v1/models/route.ts:65

## S15.16 Relative speed information.
- Should: The selector tells the user which models are faster or slower.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/lib/modelPicker.ts:164; apps/web/features/chat/components/Composer/ComposerFooter.tsx:333; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:516; apps/mobile/src/features/model-picker/modelFilters.ts:16; apps/mobile/src/features/model-picker/components/ModelFilterChips.tsx:21; apps/cli/src/design_system.rs:365; apps/cli/src/tui/widgets/model_picker.rs:487; apps/cli/src/tui/widgets/model_picker.rs:690

## S15.17 Relative usage or cost information.
- Should: The selector shows how much each model costs or how fast it uses up the allowance.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:702; apps/web/features/chat/components/Composer/ComposerFooter.tsx:363; apps/web/features/chat/components/Composer/ComposerFooter.tsx:640; apps/cli/src/tui/tui_app.rs:3454; apps/cli/src/tui/tui_app.rs:3465; apps/extension-vscode/src/features/model-picker/modelConstants.ts:94; apps/extension-vscode/src/features/model-picker/modelConstants.ts:240

## S15.18 Plan-eligibility information.
- Should: Models the user's plan cannot use are marked with the plan that unlocks them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:719; apps/web/features/chat/components/Composer/ComposerFooter.tsx:618; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:222; apps/mobile/src/features/model-picker/components/ModelRow.tsx:188; apps/mobile/src/features/model-picker/service.ts:212; apps/cli/src/tui/widgets/model_picker.rs:612; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:770; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:128

## S15.19 Preview or experimental badge.
- Should: Preview or experimental models carry a visible badge in the selector.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/lib/modelPicker.ts:198; apps/web/features/chat/components/Composer/ComposerFooter.tsx:670; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:532; apps/cli/src/tui/widgets/model_picker.rs:423

## S15.20 Deprecated-model notice.
- Should: A model scheduled for retirement shows a notice with its leaving date before it disappears.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:404; apps/web/features/chat/components/Composer/ComposerFooter.tsx:380; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1043; apps/cli/src/tui/widgets/model_picker.rs:423; apps/cli/src/provider.rs:296

## S15.21 Temporary-unavailability state.
- Should: A model that is temporarily unavailable is marked as such in the selector and cannot be picked by mistake.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:554; apps/web/features/chat/components/Composer/ComposerFooter.tsx:404; apps/web/features/chat/components/Composer/ComposerFooter.tsx:192; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1379; apps/mobile/src/features/model-picker/components/ModelRow.tsx:79; apps/mobile/src/features/model-picker/components/ModelRow.tsx:244; apps/mobile/src/features/model-picker/components/ModelRow.tsx:280; apps/mobile/src/features/model-picker/providerAvailabilityStore.ts:20

## S15.22 Reasoning-effort selector.
- Should: For reasoning models the user can choose how hard the model thinks (effort level).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1691; apps/web/features/chat/components/Composer/ComposerFooter.tsx:912; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4964; apps/mobile/src/features/chat/components/ComposerEffort.tsx:58; apps/mobile/src/features/model-picker/components/EffortSlider.tsx:57; apps/mobile/src/features/chat/components/ChatInput.tsx:250; apps/cli/src/tui/widgets/model_picker.rs:540; apps/cli/src/tui/tui_app.rs:3871

## S15.23 Fast-serving option where supported.
- Should: Where a model offers a faster serving tier, the user can turn it on.
- Status: web done, desktop done, mobile missing, cli partial, vscode missing, api missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1323; apps/web/features/chat/components/Composer/ComposerFooter.tsx:2014; apps/web/features/chat/hooks/use-fast-mode-availability.ts:18; apps/cli/src/tui/tui_app.rs:3431; apps/cli/src/agent/mod.rs:1779; apps/cli/src/tui/tui_app.rs:3433
- Unfinished: cli: Waits on the c-platform fast tier (per-model fast tier and price in the registry, speed or service_tier in the gateway, provider payloads and billing); then /fast switches to that tier of the same model.

## S15.24 Response-length preference.
- Should: The user can set a preferred response length (shorter or longer answers).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:249; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3447; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1276; apps/mobile/src/features/chat/components/StyleSelector.tsx:17; apps/mobile/stores/chat/chatExecutionStore.ts:1355; apps/cli/src/tui/tui_app.rs:3334; apps/cli/src/output_styles.rs:36; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:343

## S15.25 Advanced sampling controls where exposed.
- Should: Where sampling settings are exposed, the user can set them (temperature, top-p).
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing, api done
- Code: apps/cli/src/lib.rs:261; apps/cli/src/lib.rs:4303; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:338

## S15.26 Provider-route selection where exposed.
- Should: Where a model is offered by several providers, the user can choose which provider serves it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing, api missing
- Code: apps/cli/src/lib.rs:203; apps/cli/src/tui/widgets/model_picker.rs:690

## S15.27 Local-model selection.
- Should: The user can pick a model that runs on their own device.
- Status: desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/desktop/electron/runtime/dispatcher.ts:799; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1487; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1005; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:67; apps/mobile/src/features/model-picker/components/ModelRow.tsx:150; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:383; apps/cli/src/tui/widgets/model_picker.rs:468; apps/cli/src/tui/widgets/model_picker.rs:690

## S15.28 BYOK route selection.
- Should: The user can choose to send turns through their own provider key, supplied in the product.
- Status: cli done, vscode done, chrome missing
- Code: apps/cli/src/tui/widgets/model_picker.rs:468; apps/cli/src/auth.rs:209; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1106; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1479

## S15.29 Sticky model preference.
- Should: The chosen model is remembered for the next session.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1015; apps/web/shared/stores/model-store.ts:385; apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:39; apps/mobile/src/features/model-picker/store.ts:189; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:383; apps/cli/src/lib.rs:1194; apps/cli/src/lib.rs:2264

## S15.30 Conversation-specific override.
- Should: A conversation can keep its own model, separate from the default used elsewhere.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1019; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1015; apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:39; apps/mobile/app/(app)/chat/[id].tsx:736; apps/cli/src/tui/widgets/model_picker.rs:690; apps/cli/src/tui/tui_app.rs:1200; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:744

## S15.31 Per-turn model override.
- Should: The user can run a single turn with a different model without changing the conversation's model.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3205; apps/web/features/chat/pages/WebChatPage.tsx:4869; apps/web/features/chat/pages/WebChatPage.tsx:4711; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:297

## S15.32 Actual-serving-model disclosure.
- Should: Each answer shows which model actually produced it.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3144; apps/web/features/chat/components/messages/MessageBubble.tsx:1640; apps/mobile/src/features/chat/components/MessageBubble.tsx:288; apps/mobile/src/features/chat/components/MessageBubble.tsx:189; apps/cli/src/tui/tui_app.rs:1586; apps/cli/src/tui/tui_app.rs:6527; apps/cli/src/agent/chat.rs:761; apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:250

## S15.33 Fallback disclosure.
- Should: When a different model answered because the chosen one failed or was unavailable, the answer says so and why.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2667; apps/web/lib/chat-fallback-reason.ts:79; apps/cli/src/tui/tui_app.rs:1847; apps/cli/src/tui/tui_app.rs:572; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:792; apps/web/lib/chat-fallback-reason.ts:1

## S15.34 Model-switch incompatibility dialog.
- Should: Switching to a model that cannot handle the current conversation (images, tools, context) asks for confirmation and explains what will be lost.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1341; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1051; apps/extension-vscode/src/features/model-picker/modelConstants.ts:303; apps/extension-vscode/src/core/commandSetup.ts:1206

## S15.35 Preserve-or-remove incompatible attachments choice.
- Should: When the chosen model cannot read attached files, the user can choose to keep them (switching to a model that can) or remove them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4059; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4017; apps/web/features/chat/pages/WebChatPage.tsx:5668
