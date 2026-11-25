# Area 26. Artifact container and panel

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S26.01 Artifact launch card inside chat.
- Should: An assistant reply that produces an artifact shows a card in the transcript; activating it opens that artifact.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2330; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:364; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:235; apps/mobile/src/features/chat/components/MessageBubble.tsx:1022; apps/mobile/src/features/chat/components/MessageBubble.tsx:385; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154

## S26.02 Artifact title.
- Should: The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1243; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:297; apps/web/features/chat/stores/artifacts-store.ts:119; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:153; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:310; apps/mobile/src/features/chat/components/MessageBubble.tsx:341; apps/cli/src/cloud/artifacts.rs:518; apps/cli/src/lib.rs:1899

## S26.03 Artifact type.
- Should: The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:37; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:306; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1247; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:192; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:123; apps/cli/src/cloud/artifacts.rs:518; apps/cli/src/lib.rs:1899; apps/extension-vscode/src/features/artifacts/artifactsTree.ts:42

## S26.04 Artifact status.
- Should: The artifact shows its lifecycle state: being written, finished, stopped before it finished, or failed.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: apps/web/features/chat/components/artifacts/StreamingArtifactView.tsx:39; apps/web/features/chat/hooks/use-streaming-artifact.ts:68; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1640; apps/mobile/src/features/chat/components/StreamingArtifactCard.tsx:55

## S26.05 Open artifact.
- Should: User can open an artifact from the chat or from an artifact list into a view that shows its content.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:235; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:364; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:641; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154; apps/mobile/src/features/chat/components/MessageBubble.tsx:385; apps/mobile/src/features/artifacts/index.tsx:128; apps/mobile/src/features/artifacts/index.tsx:312; apps/cli/src/lib.rs:1034

## S26.06 Close artifact without deleting it.
- Should: Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.
- Status: web done, desktop done, mobile done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1621; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:640; apps/web/features/chat/stores/artifacts-store.ts:548; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:504; apps/mobile/src/features/chat/components/MessageBubble.tsx:392; apps/extension-vscode/src/features/artifacts/artifactActions.ts:99

## S26.07 Reopen artifact.
- Should: After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:661; apps/web/features/chat/pages/WebChatPage.tsx:4609; apps/web/features/chat/stores/artifacts-store.ts:373; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154; apps/mobile/src/features/chat/components/MessageBubble.tsx:385; apps/mobile/src/features/artifacts/store.ts:96; apps/cli/src/lib.rs:1914; apps/cli/src/cloud/artifacts.rs:461

## S26.08 Docked side panel.
- Should: The artifact opens in a panel docked beside the conversation, so both are visible at once.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5834; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:456; apps/web/features/chat/pages/WebChatPage.tsx:928; apps/cli/src/cloud/artifacts.rs:450; apps/extension-vscode/src/features/artifacts/artifactActions.ts:99

## S26.09 Resizable panel.
- Should: The user can change the width of the docked artifact panel (pointer drag or keyboard), and the width is kept.
- Status: web done, desktop done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:468; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:407; packages/ui/unified-chat/src/stores/uiStore.ts:9; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:313; apps/cli/src/cloud/artifacts.rs:450; apps/extension-vscode/src/features/artifacts/artifactActions.ts:99

## S26.10 Full-screen artifact.
- Should: The user can expand any open artifact to fill the screen and return from it.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1878; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2348; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:313; apps/mobile/src/features/chat/components/MessageBubble.tsx:385; apps/cli/src/cloud/artifacts.rs:450; apps/extension-vscode/src/features/artifacts/artifactActions.ts:99

## S26.11 Detached artifact window where supported.
- Should: Where the platform allows it, the artifact can be popped out into its own window or tab that shows the rendered artifact.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:306; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1142; apps/desktop/electron/windowPolicy.ts:98; apps/desktop/electron/windowPolicy.ts:132; apps/desktop/electron/windowPolicy.ts:108; apps/cli/src/cloud/artifacts.rs:450; apps/extension-vscode/src/features/artifacts/artifactActions.ts:99

## S26.12 Multiple-artifact switching.
- Should: When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:572; apps/web/features/chat/stores/artifacts-store.ts:540; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:359; apps/mobile/src/features/chat/components/MessageBubble.tsx:1687; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:745; apps/cli/src/lib.rs:1914; apps/cli/src/cloud/artifacts.rs:518; apps/extension-vscode/src/features/surfaces/index.ts:280

## S26.13 Artifact tabs.
- Should: The open artifacts of a conversation are shown as tabs in the viewer, one per artifact, including one being written.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:55; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:573; apps/web/features/chat/stores/artifacts-store.ts:597; apps/cli/src/cloud/artifacts.rs:450; apps/extension-vscode/src/features/artifacts/artifactActions.ts:102

## S26.14 Source/preview toggle.
- Should: For a renderable artifact the user can switch between the rendered preview and its source.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1202; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1162; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2112; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:353; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:638; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:20

## S26.15 Direct-edit mode.
- Should: The user can edit an artifact's content directly in the viewer and save it as a new version.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1341; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:488; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1863

## S26.16 Read-only mode.
- Should: An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:484; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1873; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:791; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:152; apps/cli/src/lib.rs:1914; apps/cli/src/lib.rs:1034; apps/extension-vscode/src/features/artifacts/artifactActions.ts:48; apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:126

## S26.17 Selection-based edit request.
- Should: The user selects part of an artifact and asks the assistant to change just that part, and the artifact is revised.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S26.18 Inline comments.
- Should: The user can attach comments to specific places in an artifact and see them inline.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S26.19 Pending edit-request collection.
- Should: Several requested changes to an artifact can be collected (e.g. from comments or selections) and sent to the assistant together.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S26.20 Version selector.
- Should: The viewer shows which version of the artifact is displayed and lets the user pick any other version directly.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:61; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1922; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:661; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1000

## S26.21 Previous/next version.
- Should: The user can step to the previous and next version of an artifact and see which version is shown.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1258; apps/web/features/chat/stores/artifacts-store.ts:603; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:643; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:667; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:704; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:392

## S26.22 Compare versions.
- Should: The user can compare two versions of an artifact and see what changed between them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S26.23 Restore version.
- Should: The user can restore an earlier version so it becomes the current one, without losing the versions in between.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1294; apps/web/features/chat/stores/artifacts-store.ts:680; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:355; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:735

## S26.24 Duplicate artifact.
- Should: The user can duplicate an artifact into an independent copy that can change without touching the original.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1475; apps/web/features/chat/stores/artifacts-store.ts:654

## S26.25 Rename artifact.
- Should: The user can rename an artifact, and the new title shows wherever the artifact is listed.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S26.26 Save to Library.
- Should: The user can save an artifact into their Library so it lives with their other files outside the chat.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1012; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1815; apps/web/app/api/library/route.ts:167; apps/web/app/api/library/route.ts:210

## S26.27 Associate with Project.
- Should: From the artifact viewer the user can attach the artifact to a chosen project, and it then shows up in that project.
- Status: web done, desktop done, mobile missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1528; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:802; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:293; apps/web/features/projects/services/project-knowledge-upload.ts:33

## S26.28 Continue from another chat.
- Should: The user can take an existing artifact into a different (e.g. new) chat and keep working on it there.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1012; apps/web/features/library/lib/library-chat-handoff.ts:29

## S26.29 Export menu.
- Should: The artifact viewer offers a menu of export formats and each choice saves a file in that format.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1430; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:562; apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx:84; apps/mobile/src/features/chat/utils/artifactExport.ts:92

## S26.30 Copy content.
- Should: A copy control puts the artifact's own content on the clipboard and confirms it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1386; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:659; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:478; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:186; apps/cli/src/lib.rs:2318; apps/extension-vscode/src/features/artifacts/artifactActions.ts:106

## S26.31 Share controls.
- Should: The user can publish an artifact to a link, copy/share the link, choose who can open it, and take it down.
- Status: web done, desktop done, cli done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1563; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1704; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:78; apps/web/app/api/artifacts/publish/route.ts:182; apps/cli/src/lib.rs:1053; apps/cli/src/lib.rs:1976; apps/cli/src/cloud/artifacts.rs:391

## S26.32 Public/private state.
- Should: Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/publishArtifactClient.ts:125; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:367; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:375; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1950; apps/web/app/api/artifacts/publish/route.ts:450; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:195; apps/mobile/src/features/artifacts/index.tsx:338; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:772

## S26.33 Connected-data status.
- Should: An artifact that reads connected data shows which sources it uses and whether they are connected/healthy.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S26.34 Refresh connected data.
- Should: An artifact bound to connected data offers a refresh that re-pulls that data without regenerating the artifact.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S26.35 Runtime error panel.
- Should: When an artifact fails while rendering or running, the viewer replaces it with an error panel that explains the failure and offers source/retry.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: infrastructure/sandbox/index.html:494; infrastructure/sandbox/index.html:500; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:69; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:81; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:92; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:819

## S26.36 Dependency-loading state.
- Should: While an artifact's runtime or libraries load, the viewer shows a loading state, and a failed load is reported.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: infrastructure/sandbox/index.html:366; infrastructure/sandbox/index.html:494

## S26.37 Artifact-specific usage information.
- Should: The user can see usage attributable to a specific artifact (e.g. model calls, credits or views it consumed).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S26.38 Open originating session.
- Should: From an artifact seen outside its chat (gallery, list, library), the user can jump to the conversation that produced it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome done
- Code: apps/web/app/gallery/GalleryClient.tsx:747; apps/web/app/gallery/GalleryClient.tsx:844; apps/cli/src/lib.rs:2365; apps/extension/src/features/cloud-bridge/artifactsClient.ts:145

## S26.39 Live updates from ongoing work.
- Should: While a reply or run is still producing an artifact, the artifact view updates live as content arrives.
- Status: web done, desktop done, mobile done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:637; apps/web/features/chat/hooks/use-streaming-artifact.ts:96; apps/web/features/chat/components/messages/MessageBubble.tsx:1133; apps/mobile/src/features/chat/components/MessageBubble.tsx:1449; apps/mobile/src/features/chat/components/StreamingArtifactCard.tsx:114; apps/extension-vscode/src/features/surfaces/treeQuickPick.ts:150

## S26.40 Mobile reader adaptation.
- Should: On a phone-sized screen the artifact reader adapts (full-screen sheet, touch controls) instead of a cramped side panel.
- Status: web done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:448; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:207; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:313; apps/mobile/src/features/chat/components/MessageBubble.tsx:385
