# Area 21. Code blocks and executable code presentation

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S21.01 Language label.
- Should: Each code block shows its language name in a header.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:80; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:41; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:494; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:80

## S21.02 Syntax highlighting.
- Should: Code is syntax-highlighted according to its language.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:98; packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:1; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:496; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:346

## S21.03 Copy code.
- Should: Each code block has a copy control that copies exactly its code.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:86; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:48; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:531; apps/mobile/src/features/chat/components/CodeBlockCopyButton.tsx:36; apps/cli/src/tui/tui_app.rs:3492; apps/cli/src/tui/tui_app.rs:3506; apps/extension-vscode/src/webview/render.ts:17; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3884

## S21.04 Download source file.
- Should: A code block can be downloaded as a source file with a sensible extension.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:75; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:77; packages/ui/unified-chat/src/components/markdown/codeFileName.ts:112; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:790; apps/mobile/src/features/chat/utils/artifactExport.ts:67

## S21.05 Line numbers.
- Should: Code blocks can show line numbers.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S21.06 Line wrapping.
- Should: The reader can toggle long code lines between wrapping and horizontal scroll.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S21.07 Expand/collapse.
- Should: Long code blocks are collapsed with a control to expand/collapse them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S21.08 Full-screen code view.
- Should: A code block can be opened in a full-screen/expanded view.
- Status: web done, desktop done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:152; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:166; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:178

## S21.09 Highlighted changed lines.
- Should: Changed lines in a code suggestion are visually highlighted (added/removed).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1702; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:27; packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:91; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:748; apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:72; apps/cli/src/tui/tui_app.rs:3974; apps/cli/src/tui/widgets/diff_review.rs:246; apps/extension-vscode/src/webview/render.ts:18

## S21.10 Diff formatting.
- Should: Diffs render with diff formatting (+/- lines coloured, hunks readable).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:98; packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:11; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:731; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:760; apps/cli/src/tui/tui_app.rs:3974; apps/cli/src/tui/widgets/diff_review.rs:246; apps/extension-vscode/src/webview/render.ts:14

## S21.11 Error-line highlighting.
- Should: A line referenced by an execution error or diagnostic is highlighted in the code.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S21.12 Run-code action.
- Should: The user can have code run (sandbox or local) from the chat and see it execute.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3626; apps/web/features/chat/components/messages/MessageBubble.tsx:1996; apps/mobile/src/features/chat/components/ChatInput.tsx:203; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:109; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:880; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5786; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2884

## S21.13 Runtime/language selection where offered.
- Should: Where multiple runtimes exist, the user can choose the runtime/language for execution.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/code/components/CodeComposer.tsx:258; apps/web/lib/e2b/runtime.ts:141

## S21.14 Input parameters or stdin panel.
- Should: Before running, the user can supply input parameters or stdin.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S21.15 Output panel.
- Should: Execution stdout is shown in a dedicated output panel under the code.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:84; apps/web/features/chat/components/messages/MessageBubble.tsx:1996; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:415; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:119; apps/cli/src/tui/tui_app.rs:2605; apps/cli/src/tui/tui_app.rs:278; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5788; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5781

## S21.16 Standard-error panel.
- Should: Standard error is shown separately (and visibly distinguished) from stdout.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:99; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:108; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:469; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:118; apps/cli/src/tui/tui_app.rs:320; apps/cli/src/tui/tui_app.rs:6050

## S21.17 Execution-duration display.
- Should: Each execution shows how long it took.
- Status: web missing, desktop missing, mobile done, cli missing, vscode done, chrome missing
- Code: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:125; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:140; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5120; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5818

## S21.18 Exit-status display.
- Should: Each execution shows its outcome/exit status (success, failure with code).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:127; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:46; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:488; apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:120; apps/cli/src/tui/tui_app.rs:290; apps/cli/src/tui/tui_app.rs:6050; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5796; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5787

## S21.19 Generated-file output.
- Should: Files produced by execution are listed and can be opened or downloaded.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1145; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:818; apps/mobile/src/features/chat/components/MessageBubble.tsx:364; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:792; apps/cli/src/tui/tui_app.rs:169; apps/cli/src/tui/tui_app.rs:180; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5769; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5750

## S21.20 Plot output.
- Should: Plots/images produced by execution render inline.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:115; apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:28

## S21.21 Retry execution.
- Should: A failed or finished execution can be re-run in place.
- Status: web partial, desktop partial, mobile partial, cli missing, vscode done, chrome missing
- Code: apps/web/lib/e2b/gate.ts:16; apps/mobile/src/features/chat/components/CodeRunAgain.tsx:30; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:279; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3722
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S21.22 Stop execution.
- Should: A running execution can be stopped by the user.
- Status: web partial, desktop partial, cli done, vscode done, chrome missing
- Code: apps/web/lib/e2b/gate.ts:16; apps/cli/src/tui/tui_app.rs:1249; apps/cli/src/tui/tui_app.rs:5245; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2510; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4600
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S21.23 Reset runtime.
- Should: The user can reset the execution runtime/state.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode done, chrome missing

## S21.24 Explain code.
- Should: A code block offers an Explain action that asks for an explanation of that code.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/extension-vscode/src/webview/render.ts:36; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4235

## S21.25 Edit in Canvas.
- Should: A code block can be opened in an editable canvas/editor next to the chat.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:150; apps/web/features/chat/components/messages/MessageBubble.tsx:1216; apps/web/features/chat/components/messages/MessageBubble.tsx:2342; apps/web/features/chat/utils/artifact-detector.ts:56

## S21.26 Open in coding workspace.
- Should: A code block can be sent to/opened in the coding workspace (IDE, AGI Code).
- Status: web missing, desktop missing, mobile missing, vscode done, chrome missing
- Code: apps/extension-vscode/src/webview/render.ts:18; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1324

## S21.27 Apply to repository.
- Should: Suggested code can be applied to files in the user's repository after review.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:3974; apps/cli/src/tui/tui_app.rs:880; apps/extension-vscode/src/webview/render.ts:18; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1350

## S21.28 Dependency-installation status.
- Should: When execution installs dependencies, their installation status is shown.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S21.29 Execution-permission explanation.
- Should: Before or when code runs, the user is told what permission it needs/what it can touch and why.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/settings/sections/CapabilitiesSection.tsx:78; apps/cli/src/tui/widgets/approval_overlay.rs:5; apps/cli/src/tui/tui_app.rs:880; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4614; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4619

## S21.30 Unsupported-runtime state.
- Should: If the requested runtime/execution is unavailable, the UI states that clearly instead of failing silently.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4511; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1300
