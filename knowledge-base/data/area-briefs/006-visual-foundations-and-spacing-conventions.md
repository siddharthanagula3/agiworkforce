# Area 6. Visual foundations and spacing conventions

35 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S6.01 Semantic background colors.
- Should: The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:126; apps/web/app/globals.css:825; apps/mobile/src/ui/theme/tokens.ts:8; apps/mobile/src/ui/theme/ThemeVars.tsx:15; apps/cli/src/tui/terminal_palette.rs:109; apps/cli/src/tui/terminal_palette.rs:273; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:101; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:129

## S6.02 Surface and elevated-surface colors.
- Should: Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:126; packages/ui/design-tokens/src/chat.css:48; packages/ui/ui/src/primitives/Dialog.tsx:110; apps/mobile/src/ui/theme/tokens.ts:10; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:189; apps/cli/src/tui/terminal_palette.rs:272; apps/cli/src/tui/widgets/model_picker.rs:369; apps/cli/src/tui/widgets/approval_overlay.rs:205

## S6.03 Text and muted-text colors.
- Should: Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:130; apps/web/shared/components/__tests__/theme-contrast.test.ts:877; apps/web/app/globals.css:558; apps/mobile/components/ui/text.tsx:11; apps/web/shared/components/__tests__/theme-contrast.test.ts:1268; apps/cli/src/tui/terminal_palette.rs:222; apps/cli/src/tui/markdown_renderer.rs:81; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:107

## S6.04 Border and divider colors.
- Should: Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:136; apps/web/app/globals.css:814; apps/mobile/src/ui/theme/tokens.ts:16; apps/mobile/src/features/onboarding/components/FirstRunDisclosureModal.tsx:180; apps/cli/src/tui/terminal_palette.rs:222; apps/cli/src/tui/markdown_renderer.rs:298; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:109; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:151

## S6.05 Accent and selection colors.
- Should: Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:151; apps/web/app/globals.css:771; apps/web/shared/components/__tests__/theme-contrast.test.ts:344; apps/mobile/src/ui/theme/tokens.ts:229; apps/cli/src/tui/terminal_palette.rs:217; apps/cli/src/tui/markdown_renderer.rs:103; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:104; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:119

## S6.06 Success, warning, error, and information colors.
- Should: Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:156; apps/web/app/chat/projects/[id]/page.tsx:1021; apps/web/shared/components/__tests__/theme-contrast.test.ts:1107; apps/mobile/src/ui/theme/tokens.ts:23; apps/cli/src/tui/markdown_renderer.rs:51; apps/cli/src/tui/markdown_renderer.rs:418; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:112; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:513

## S6.07 Typography families.
- Should: The surface declares its UI (sans), editorial and monospace font families once and loads the faces it names.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/chat.css:28; apps/web/app/globals.css:109; apps/mobile/tailwind.config.js:31; apps/mobile/app/_layout.tsx:197; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:135; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1073; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73; apps/extension/src/side_panel.ts:1063

## S6.08 Heading scale.
- Should: Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/tailwind.css:7; packages/ui/ui/src/cn.ts:8; apps/mobile/src/ui/theme/tokens.ts:285; eslint.config.mjs:54; apps/cli/src/tui/markdown_renderer.rs:102; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1079; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73

## S6.09 Body-text scale.
- Should: Body text uses a defined base size (and small variant) applied consistently, respecting the user's text-size preference where offered.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/app/globals.css:978; apps/web/shared/components/AppearancePreferences.tsx:18; apps/web/app/globals.css:902; apps/mobile/src/ui/theme/tokens.ts:285; eslint.config.mjs:54; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:136; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73; apps/extension/src/side_panel.ts:1067

## S6.10 Caption and metadata scale.
- Should: Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/tailwind.css:2; packages/ui/ui/src/primitives/TrustBadge.tsx:33; apps/web/shared/components/__tests__/theme-contrast.test.ts:927; apps/mobile/src/ui/theme/tokens.ts:285; apps/mobile/__tests__/mobile-shell-chrome.test.ts:13; apps/cli/src/tui/terminal_palette.rs:222; apps/cli/src/tui/tui_app.rs:200; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:155

## S6.11 Monospace typography.
- Should: Code and technical text use a declared monospace family and size distinct from body text.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/chat.css:37; apps/web/app/globals.css:951; apps/mobile/tailwind.config.js:33; apps/mobile/components/ui/text.tsx:12; apps/cli/src/tui/markdown_renderer.rs:86; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:157; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1171

## S6.12 Line-height rules.
- Should: Line height is defined per text role (paired with size) rather than set ad hoc per element.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/app/globals.css:834; apps/web/app/globals.css:118; packages/ui/design-tokens/src/tailwind.css:3; apps/mobile/components/ui/text.tsx:18; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:150; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:103; apps/extension/src/side_panel.css:61

## S6.13 Paragraph spacing.
- Should: Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:1137; apps/web/features/chat/components/messages/MessageBubble.tsx:2030; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:214; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/markdown_renderer.rs:515; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:487; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73

## S6.14 List indentation.
- Should: Lists in rendered content use a defined indentation (and nesting step).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:1156; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:274; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/markdown_renderer.rs:157; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1082; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73

## S6.15 Code-block padding.
- Should: Code blocks have defined internal padding set in one shared rule.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:958; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:96; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/MessageBubble.tsx:714; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/markdown_renderer.rs:366; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1072

## S6.16 Table-cell padding.
- Should: Table cells (in rendered content and data tables) have defined, consistent padding.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:509; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:529; apps/web/features/docs/docs.css:729; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:360; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/markdown_renderer.rs:300; apps/cli/src/tui/tui_app.rs:917

## S6.17 Conversation-turn spacing.
- Should: Consecutive conversation turns are separated by one defined vertical spacing value.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:988; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/MessageList.tsx:145; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/tui_app.rs:1460; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:471; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73

## S6.18 Message-to-toolbar spacing.
- Should: The per-message action toolbar sits a defined distance below the message it belongs to.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2787; apps/web/features/chat/components/messages/messageActionRow.ts:13; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/MessageBubble.tsx:917; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:576; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3606; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3590

## S6.19 Composer internal padding.
- Should: The composer has defined internal padding around the input and its controls.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4123; apps/web/app/layout.tsx:5; apps/mobile/src/features/chat/components/ChatInput.tsx:943; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/tui_app.rs:1678; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:721; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73

## S6.20 Page-edge gutters.
- Should: Pages use defined page-edge gutters that step with viewport width.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:866; apps/web/features/chat/pages/WebChatPage.tsx:5822; apps/web/app/settings/voice/page.tsx:7; apps/mobile/src/shared/layout/contentColumn.ts:5; apps/mobile/src/features/chat/components/MessageBubble.tsx:142; apps/cli/src/tui/markdown_renderer.rs:80; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:468

## S6.21 Sidebar row height.
- Should: Sidebar/history list rows have one defined row height.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:185; packages/ui/ui/src/sidebar/Sidebar.tsx:441; apps/web/app/layout.tsx:5; apps/mobile/src/features/drawer/components/DrawerContent.tsx:224; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1884; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73; apps/extension/src/side_panel.ts:4193

## S6.22 Menu-item height.
- Should: Menu items share one defined item height/padding across menus.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/DropdownMenu.tsx:115; apps/web/app/layout.tsx:5; apps/mobile/src/features/settings/appearance/index.tsx:47; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:934; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73; apps/extension/src/side_panel.ts:2178; apps/extension/src/side_panel.ts:4298

## S6.23 Dialog padding.
- Should: Dialogs and sheets share one defined inner padding.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Dialog.tsx:110; packages/ui/ui/src/primitives/AlertDialog.tsx:93; apps/web/app/layout.tsx:5; apps/mobile/src/features/auth/components/StepUpModal.tsx:344; apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx:193; apps/cli/src/tui/widgets/theme_picker.rs:254; apps/cli/src/tui/tui_app.rs:917; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1063

## S6.24 Form-field spacing.
- Should: Form fields share a defined label-to-input and field-to-field spacing.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/app/layout.tsx:5; apps/mobile/components/ui/input.tsx:18; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:85; apps/extension/src/options.ts:95; apps/extension/src/side_panel.ts:4298

## S6.25 Icon sizes and stroke conventions.
- Should: Icons come from one family with a fixed grid and stroke width, sized from a small set.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/icons/src/grid.ts:1; packages/ui/icons/src/CreateIcon.tsx:17; apps/mobile/src/features/settings/appearance/index.tsx:37; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:96; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73; apps/extension/src/assets/icons.ts:2; apps/extension/src/side_panel.ts:139

## S6.26 Button sizes and density variants.
- Should: Buttons come in a defined set of sizes/densities from one component.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Button.tsx:20; apps/web/app/layout.tsx:5; apps/mobile/components/ui/button.tsx:21; apps/mobile/app/_layout.tsx:719; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:138; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:82; apps/extension/src/side_panel.css:36; apps/extension/src/features/side-panel/schedulesSection.ts:168

## S6.27 Border-radius scale.
- Should: Corner radii come from one named radius ladder.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:176; apps/web/shared/components/__tests__/theme-contrast.test.ts:1002; packages/ui/ui/src/primitives/Button.tsx:22; apps/mobile/src/ui/theme/tokens.ts:257; apps/mobile/src/features/chat/components/ChatInput.tsx:749; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:127; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:78; apps/extension/src/features/side-panel/computerUsePanel.ts:126

## S6.28 Shadow and elevation scale.
- Should: Shadows come from a small named elevation scale per theme.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/tailwind.css:65; packages/ui/ui/src/primitives/Dialog.tsx:110; packages/ui/ui/src/primitives/AlertDialog.tsx:93; apps/mobile/src/ui/theme/tokens.ts:309; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:131; apps/extension/src/side_panel.ts:3929

## S6.29 Layering and z-index rules.
- Should: Stacking order uses one named z-index ladder; components never invent numeric layers.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:222; packages/ui/ui/src/primitives/Dialog.tsx:28; apps/mobile/src/features/edge-cases/components/CloudSyncErrorBanner.tsx:48; apps/mobile/src/features/library/index.tsx:1062; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:133; apps/extension/src/side_panel.css:28; apps/extension/src/side_panel.ts:3929; apps/extension/src/side_panel.ts:4968

## S6.30 Motion durations and easing.
- Should: Animations and transitions use named durations and easing curves.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/design-tokens/src/foundation.css:248; packages/ui/ui/src/primitives/Sheet.tsx:36; apps/mobile/src/ui/theme/tokens.ts:300; apps/mobile/src/features/voice/components/VoiceOrb.tsx:64; apps/cli/src/tui/motion.rs:4; apps/cli/src/tui/shimmer.rs:32; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:128; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:294

## S6.31 Reduced-motion alternatives.
- Should: When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:1935; apps/web/shared/components/AppearancePreferences.tsx:45; apps/web/features/settings/sections/GeneralSection.tsx:1091; apps/mobile/src/ui/theme/useReduceMotion.ts:22; apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:19; apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts:78; apps/cli/src/lib.rs:4887; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2055

## S6.32 Light, dark, and system themes.
- Should: The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:47; apps/web/features/settings/sections/GeneralSection.tsx:831; apps/desktop/electron/main.ts:548; apps/mobile/src/features/settings/appearance/index.tsx:42; apps/mobile/src/ui/theme/tokens.ts:235; apps/cli/src/tui/widgets/theme_picker.rs:125; apps/cli/src/tui/terminal_palette.rs:519; apps/cli/src/config.rs:703

## S6.33 High-contrast treatment.
- Should: A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:1344; apps/web/app/globals.css:1368; apps/web/shared/components/AppearancePreferences.tsx:35; apps/mobile/src/ui/theme/tokens.ts:149; apps/mobile/src/ui/theme/useSystemHighContrast.ts:40; apps/mobile/src/ui/theme/useTheme.ts:42; apps/cli/src/tui/terminal_palette.rs:141; apps/cli/src/tui/terminal_palette.rs:154

## S6.34 Selected, focused, hovered, pressed, and disabled states.
- Should: Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/Button.tsx:13; packages/ui/ui/src/primitives/Button.tsx:17; packages/ui/ui/src/primitives/Button.tsx:20; apps/mobile/src/features/settings/appearance/index.tsx:44; apps/mobile/components/ui/pressable-box.tsx:42; apps/mobile/app/_layout.tsx:719; apps/cli/src/tui/widgets/theme_picker.rs:297; apps/cli/src/tui/tui_app.rs:917

## S6.35 Brand assets and application icons.
- Should: The surface ships its brand mark and application icons at the sizes the platform needs.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/manifest.ts:15; apps/web/shared/components/layout/SidebarBrandRow.tsx:6; apps/web/app/layout.tsx:5; apps/desktop/electron-builder.yml:18; apps/mobile/app.config.js:61; apps/mobile/app.config.js:159; apps/mobile/components/ui/AgiMark.tsx:36; apps/mobile/app/_layout.tsx:719
