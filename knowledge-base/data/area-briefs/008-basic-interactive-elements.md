# Area 8. Basic interactive elements

50 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S8.01 Primary buttons.
- Should: The main action in a view uses a visually emphasised primary button style, applied in shipped UI, whose label meets contrast on its fill.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Button.tsx:13; apps/web/features/chat/components/messages/EditableMessage.tsx:139; apps/web/features/chat/components/messages/EditableMessage.tsx:141; apps/mobile/components/ui/button.tsx:35; apps/mobile/components/ui/button.tsx:91; apps/mobile/app/(auth)/reset-password.tsx:59; apps/mobile/app/(auth)/reset-password.tsx:64; apps/cli/src/tui/widgets/approval_overlay.rs:240

## S8.02 Secondary buttons.
- Should: A less prominent secondary (outline/ghost) button style exists and is used beside primary actions in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Button.tsx:15; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:322; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:324; apps/mobile/components/ui/button.tsx:72; apps/mobile/app/(auth)/reset-password.tsx:63; apps/mobile/app/(auth)/reset-password.tsx:64; apps/cli/src/tui/widgets/approval_overlay.rs:225; apps/cli/src/tui/widgets/approval_overlay.rs:248

## S8.03 Destructive buttons.
- Should: Irreversible actions use a distinct destructive button style (danger colour before hover) whose label meets contrast.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Button.tsx:14; apps/web/features/chat/components/share/ShareConversationDialog.tsx:264; apps/web/features/chat/components/share/ShareConversationDialog.tsx:265; apps/web/shared/components/__tests__/theme-contrast.test.ts:267; apps/mobile/components/ui/button.tsx:84; apps/cli/src/tui/widgets/approval_overlay.rs:243; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:827; apps/extension/src/side_panel.ts:3825

## S8.04 Icon-only buttons.
- Should: Icon-only buttons exist in shipped UI and each carries an accessible name (aria-label or equivalent).
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Button.tsx:25; apps/web/features/chat/components/messages/MessageBubble.tsx:2818; apps/web/features/chat/components/messages/MessageBubble.tsx:2820; apps/mobile/app/(app)/chat/[id].tsx:1317; apps/mobile/app/(app)/chat/[id].tsx:1320; apps/mobile/app/(app)/chat/[id].tsx:1307; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2193; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2196

## S8.05 Split buttons.
- Should: A split button (main action plus an attached menu of alternative actions) is used in shipped UI.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S8.06 Toggle buttons.
- Should: A toggle button (a button with an on/off pressed state announced to assistive tech) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4384; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/camera.tsx:332; apps/mobile/app/(app)/camera.tsx:329; apps/cli/src/tui/widgets/skills_toggle.rs:76; apps/cli/src/tui/widgets/skills_toggle.rs:90; apps/cli/src/tui/tui_app.rs:3945

## S8.07 Button groups.
- Should: Related buttons are grouped into a labelled button group in shipped UI.
- Status: web done, desktop done, mobile partial, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/Composer/DictationStrip.tsx:83; apps/web/features/chat/components/Composer/DictationStrip.tsx:94; apps/cli/src/tui/widgets/approval_overlay.rs:249; apps/cli/src/tui/widgets/approval_overlay.rs:256; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1022; apps/extension-vscode/src/core/chatSetup.ts:60
- Unfinished: mobile: The approve and deny row of the tool approval controls (CloudToolApprovalControls.tsx) is not exposed as a labelled button group.

## S8.08 Text links.
- Should: Links in text are visibly styled as links and open their destination when activated.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:470; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:133; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:23; apps/cli/src/tui/markdown_renderer.rs:203; apps/extension-vscode/src/webview/render.ts:7; apps/extension-vscode/src/webview/render.ts:79; apps/extension/src/side_panel.ts:1632

## S8.09 Text inputs.
- Should: Single-line text inputs with a visible label or accessible name are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:160; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:172; apps/mobile/app/(app)/(tabs)/projects.tsx:452; apps/mobile/app/(app)/(tabs)/projects.tsx:451; apps/cli/src/tui/tui_app.rs:1678; apps/cli/src/tui/tui_app.rs:1182; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2254; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.10 Multiline inputs.
- Should: A multi-line text area that accepts newlines is used in shipped UI (e.g. the composer).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2020; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:358; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:361; apps/mobile/src/features/chat/components/ChatInput.tsx:1064; apps/mobile/src/features/chat/components/ChatInput.tsx:1059; apps/cli/src/tui/tui_app.rs:2492; apps/cli/src/tui/widgets/screen_renderers.rs:889; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2492

## S8.11 Search fields.
- Should: A search field (search semantics, placeholder or label, filters as typed or on submit) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:349; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:204; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:206; apps/mobile/src/features/chat/ChatsListScreen.tsx:512; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:554; apps/mobile/src/features/chat/ChatsListScreen.tsx:511; apps/cli/src/tui/widgets/model_picker.rs:423; apps/cli/src/tui/widgets/model_picker.rs:110

## S8.12 Password fields.
- Should: Secret entry (passwords, API keys, tokens) uses a masked field in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:209; apps/web/features/connectors/components/ConnectorApiKeyForm.tsx:213; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:191; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:185; apps/cli/src/tui/widgets/elicitation_overlay.rs:62; apps/cli/src/tui/tui_app.rs:945; apps/extension-vscode/src/core/commandSetup.ts:1064; apps/extension-vscode/src/core/commandSetup.ts:1055

## S8.13 One-time-code fields.
- Should: A one-time-code field (short numeric code, one-time-code autofill or paste) is used where the product asks for a code.
- Status: web done, desktop done, mobile unverified, chrome done
- Code: apps/web/features/auth/AuthCodeStep.tsx:91; apps/web/features/auth/AuthCodeStep.tsx:66; apps/extension/src/side_panel.ts:7189; apps/extension/src/side_panel.ts:7205

## S8.14 Checkboxes.
- Should: Checkboxes (independent on/off choices in a list, with checked state exposed) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:250; apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:252; apps/mobile/src/features/settings/notifications/index.tsx:637; apps/mobile/src/features/settings/notifications/index.tsx:636; apps/cli/src/tui/widgets/skills_toggle.rs:76; apps/cli/src/tui/widgets/skills_toggle.rs:90; apps/extension/src/options.ts:1033; apps/extension/src/features/side-panel/computerUsePanel.ts:112

## S8.15 Radio groups.
- Should: A radio group (mutually exclusive options, all visible, with checked state exposed) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/onboarding/components/OnboardingWizard.tsx:203; apps/web/features/onboarding/components/OnboardingWizard.tsx:196; apps/mobile/src/features/chat/components/StyleSelector.tsx:157; apps/mobile/src/features/chat/components/StyleSelector.tsx:144; apps/cli/src/tui/widgets/effort_picker.rs:172; apps/cli/src/tui/widgets/effort_picker.rs:135

## S8.16 Switches.
- Should: Switches (immediate on/off settings with switch semantics) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1654; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1656; apps/mobile/app/(app)/settings/integrations.tsx:229; apps/mobile/app/(app)/settings/integrations.tsx:231; apps/mobile/components/ui/switch.tsx:13; apps/cli/src/tui/widgets/elicitation_overlay.rs:52; apps/cli/src/tui/widgets/elicitation_overlay.rs:247; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1164

## S8.17 Segmented controls.
- Should: A segmented control (a small set of mutually exclusive options shown as joined segments) is used in shipped UI.
- Status: web done, desktop done, mobile done, vscode done, chrome unverified
- Code: apps/web/features/code/CloudCodePage.module.css:58; apps/web/features/code/components/CodeRail.tsx:190; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ModeToggle.tsx:78; apps/mobile/src/features/chat/components/ModeToggle.tsx:83; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2249; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1856; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.18 Single-select menus.
- Should: A single-select menu (choose one value from a list) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:433; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:435; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:554; apps/mobile/app/(app)/models.tsx:210; apps/mobile/app/(app)/models.tsx:204; apps/cli/src/tui/widgets/model_picker.rs:488; apps/cli/src/tui/tui_app.rs:1201; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1126

## S8.19 Searchable comboboxes.
- Should: A searchable combobox (type to filter a list, then pick one, with listbox semantics or keyboard navigation) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/shared/components/CommandPalette/CommandPalette.tsx:387; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:349; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:546; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:554; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/widgets/model_picker.rs:423; apps/cli/src/tui/widgets/model_picker.rs:153; apps/extension-vscode/src/core/commandSetup.ts:666

## S8.20 Multiselect controls.
- Should: A multiselect control (pick several values from one list, each selection shown and removable) is used in shipped UI.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/code/components/CodeChangesPanel.tsx:213; apps/web/features/code/components/CodeChangesPanel.tsx:215; apps/cli/src/tui/widgets/elicitation_overlay.rs:46; apps/cli/src/tui/tui_app.rs:945

## S8.21 Token/chip inputs.
- Should: A token/chip input (typed entries become removable chips inside or beside the field) is used in shipped UI.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/primitives/ChipInput.tsx:33; apps/web/features/settings/sections/WorkspacePolicySection.tsx:661; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:271

## S8.22 Numeric steppers.
- Should: A numeric stepper (number field with increment/decrement) is used in shipped UI.
- Status: web done, desktop done, mobile missing, vscode done, chrome done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:262; apps/web/features/schedules/components/ScheduleForm.tsx:268; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1208; apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension/src/options.ts:1491; apps/extension/src/side_panel.ts:4298

## S8.23 Sliders.
- Should: A slider (drag or arrow keys to set one value on a scale) is used in shipped UI.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1690; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1695; apps/mobile/src/features/settings/personalization/index.tsx:123; apps/mobile/src/features/settings/personalization/index.tsx:128

## S8.24 Range sliders.
- Should: A range slider (two thumbs selecting a minimum and maximum) is used in shipped UI.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S8.25 Date pickers.
- Should: A date picker (calendar or native date control) is used where a date is entered in shipped UI.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:468; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:464; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx:116

## S8.26 Time pickers.
- Should: A time picker (native or custom time control) is used where a time is entered in shipped UI.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:307; apps/web/features/schedules/components/ScheduleForm.tsx:310; apps/mobile/src/features/schedules/components/ScheduleDateTimeField.tsx:116

## S8.27 Timezone pickers.
- Should: A time zone picker (searchable list of zones, defaulting to the device zone) is used where schedules take a zone.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/schedules/components/ScheduleForm.tsx:53; apps/web/features/schedules/components/ScheduleForm.tsx:110; apps/web/features/schedules/components/ScheduleForm.tsx:472; apps/web/features/schedules/components/ScheduleForm.tsx:481; apps/web/features/schedules/lib/schedule-form.ts:67; apps/mobile/src/features/schedules/components/TimezonePickerField.tsx:33; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:282

## S8.28 Color pickers.
- Should: A colour picker (swatches or a colour input) is used where the user chooses a colour.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/app/chat/projects/[id]/page.tsx:856; apps/web/app/chat/projects/[id]/page.tsx:858; apps/mobile/src/features/settings/accent-color/index.tsx:45; apps/mobile/src/features/settings/accent-color/index.tsx:47; apps/mobile/src/features/settings/index.tsx:474

## S8.29 File inputs.
- Should: A file input (choose files from the device) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5230; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5235; apps/mobile/app/(app)/chat/[id].tsx:851; apps/mobile/app/(app)/chat/[id].tsx:849; apps/cli/src/tui/widgets/mention_popup.rs:1; apps/cli/src/tui/tui_app.rs:2830; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1243; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.30 Upload dropzones.
- Should: An upload drop zone accepts files dragged onto it and shows a drag-over state.
- Status: web done, desktop done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1818; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4982; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2095; apps/extension/src/side_panel.ts:10163; apps/extension/src/side_panel.ts:2067

## S8.31 Tabs.
- Should: Tabs (a tablist switching between panels, with the selected tab exposed) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/research/ResearchPanel.tsx:342; apps/web/features/chat/components/research/ResearchPanel.tsx:347; apps/mobile/app/(app)/projects/[id].tsx:131; apps/mobile/app/(app)/projects/[id].tsx:123; apps/cli/src/tui/widgets/screen_renderers.rs:624; apps/cli/src/tui/tui_app.rs:4856; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2249; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.32 Accordions.
- Should: An accordion (a stack of sections that expand and collapse, each with a labelled header) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/cards/StepsCard.tsx:326; apps/web/features/chat/components/cards/StepsCard.tsx:331; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:462; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:455

## S8.33 Disclosure controls.
- Should: A disclosure control (a toggle that shows or hides one block of detail, exposing its expanded state) is used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2556; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:90; apps/mobile/src/features/chat/components/MessageBubble.tsx:1017; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/tui_app.rs:2605; apps/cli/src/tui/tui_app.rs:278; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3381

## S8.34 Dropdown menus.
- Should: Dropdown menus (a button that opens a list of actions with menu keyboard behaviour) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:141; apps/web/features/chat/components/ConversationTitleMenu.tsx:142; apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:83; apps/mobile/src/features/voice/components/AudioRoutePicker.tsx:82; apps/cli/src/tui/widgets/command_popup.rs:193; apps/cli/src/tui/tui_app.rs:2830; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2210; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.35 Context menus.
- Should: A context menu (right-click or long-press opens actions for the item under the pointer) is used in shipped UI.
- Status: web missing, desktop missing, mobile done, vscode done, chrome done
- Code: apps/mobile/app/(app)/(tabs)/projects.tsx:415; apps/mobile/app/(app)/(tabs)/projects.tsx:414; apps/extension-vscode/package.json:813; apps/extension-vscode/src/core/commandSetup.ts:965; apps/extension-vscode/package.json:119; apps/extension/src/background.ts:4526; apps/extension/src/background.ts:4655

## S8.36 Nested menus.
- Should: A nested menu (a menu item that opens a submenu) is used in shipped UI.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:148; apps/web/app/chat/page.tsx:13

## S8.37 Tooltips.
- Should: Tooltips (short labels shown on hover or focus for controls) are used in shipped UI.
- Status: web done, desktop done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2826; apps/web/features/chat/components/messages/MessageBubble.tsx:2820; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2193; apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension/src/side_panel.ts:5330; apps/extension/src/features/content/in-page-panel/launcher.ts:54; apps/extension/src/side_panel.ts:4298

## S8.38 Popovers.
- Should: Popovers (anchored floating panels that open from a trigger and dismiss on Escape or outside click) are used in shipped UI.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:189; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:183; apps/cli/src/tui/widgets/effort_picker.rs:150; apps/cli/src/tui/tui_app.rs:1191; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2444; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:913; apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension/src/side_panel.ts:3836

## S8.39 Hover cards.
- Should: Hover cards (a rich preview that appears when hovering a link, mention or citation) are used in shipped UI.
- Status: web done, desktop done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:135; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:173; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:276

## S8.40 Badges.
- Should: Badges (small status or count markers attached to an item) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/InlinePaywallCard.tsx:208; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/(tabs)/projects.tsx:312; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/tui_app.rs:2059; apps/cli/src/tui/tui_app.rs:91; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:156; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.41 Tags.
- Should: Tags (small labels that categorise or describe an item, distinct from status badges) are used in shipped UI.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/cards/CalculationCard.tsx:296; apps/web/features/chat/components/cards/CalculationCard.tsx:304; apps/mobile/src/features/artifacts/index.tsx:327; apps/mobile/src/features/artifacts/index.tsx:26

## S8.42 Avatars.
- Should: Message authors are distinguished visually and for assistive technology (R-n: avatar or equivalent marker plus an accessible label).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1906; packages/ui/unified-chat/src/components/MessageBubble.tsx:708; packages/ui/unified-chat/src/components/MessageBubble.tsx:767; apps/mobile/src/features/chat/components/MessageBubble.tsx:676; apps/mobile/src/features/chat/components/MessageBubble.tsx:290; apps/cli/src/tui/tui_app.rs:1500; apps/cli/src/tui/tui_app.rs:1507; apps/cli/src/tui/tui_app.rs:989

## S8.43 Progress indicators.
- Should: Progress indicators (determinate bars or indeterminate spinners with an accessible name) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/cards/StepsCard.tsx:297; apps/web/features/chat/components/cards/StepsCard.tsx:310; apps/web/features/chat/components/ChatLoadingSkeleton.tsx:15; apps/mobile/app/(app)/companion/agent/[id].tsx:235; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1102; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/tui_app.rs:1581; apps/cli/src/tui/tui_app.rs:1267

## S8.44 Skeleton loaders.
- Should: Skeleton placeholders stand in for content while it loads.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubbleSkeleton.tsx:35; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/schedules/index.tsx:184; apps/mobile/app/(app)/chat/[id].tsx:1285

## S8.45 Toasts.
- Should: Toasts (transient, non-blocking notifications that dismiss themselves) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1028; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1016; apps/mobile/src/shared/components/Toast.tsx:11; apps/cli/src/tui/tui_app.rs:2219; apps/cli/src/tui/tui_app.rs:1186; apps/extension-vscode/src/core/commandSetup.ts:354; apps/extension-vscode/src/core/commandSetup.ts:358

## S8.46 Inline alerts.
- Should: Inline alerts (a message block inside the content, with alert or status semantics, for warnings or errors) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1733; apps/web/features/chat/pages/WebChatPage.tsx:5077; apps/web/app/chat/page.tsx:13; apps/mobile/app/(public)/onboarding.tsx:737; apps/mobile/app/(public)/onboarding.tsx:745; apps/cli/src/tui/tui_app.rs:1517; apps/cli/src/tui/tui_app.rs:1442; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3379

## S8.47 Banners.
- Should: Banners (a full-width strip at the top or bottom of a view for system or account messages) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5615; apps/web/features/chat/pages/WebChatPage.tsx:5626; apps/mobile/app/(app)/chat/[id].tsx:1467; apps/mobile/app/(app)/chat/[id].tsx:1473; apps/cli/src/tui/tui_app.rs:1847; apps/cli/src/tui/tui_app.rs:1184; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2338; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.48 Pagination controls.
- Should: Pagination controls (next/previous, page numbers or an explicit "Load more") let the user move through a long list.
- Status: web done, desktop done, mobile done, vscode missing, chrome unverified
- Code: apps/web/app/chat/projects/page.tsx:504; apps/web/app/chat/projects/page.tsx:68; apps/mobile/app/(app)/settings/archived-chats.tsx:401; apps/mobile/src/features/library/index.tsx:294

## S8.49 Empty states.
- Should: Empty states (a message and next step shown when a list or view has no content) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:111; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:123; apps/mobile/app/(app)/schedules/index.tsx:284; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/tui_app.rs:1461; apps/cli/src/tui/tui_app.rs:4020; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2367; apps/extension-vscode/src/core/chatSetup.ts:60

## S8.50 Error states.
- Should: Error states (a view-level message with a recovery action when content fails to load or a request fails) are used in shipped UI.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5569; apps/web/features/chat/pages/WebChatPage.tsx:5581; apps/mobile/src/features/chat/ChatsListScreen.tsx:575; apps/cli/src/tui/tui_app.rs:1517; apps/cli/src/tui/tui_app.rs:1442; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3379; apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension/src/features/side-panel/bubbles.ts:154
