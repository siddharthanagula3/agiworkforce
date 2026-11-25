# Area 28. Code Canvas and application preview

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S28.01 Editable code source.
- Should: Generated code opens in an editable source view where the user can change it and keep the result.
- Status: web done, desktop done, mobile missing, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485; apps/extension-vscode/package.json:282; apps/extension-vscode/src/providers/diffDecorationProvider.ts:335

## S28.02 Multi-file project tree.
- Should: A multi-file project is shown as a browsable file tree.
- Status: cli missing, vscode done, chrome unverified
- Code: apps/extension-vscode/package.json:74; apps/extension-vscode/src/extension.ts:50; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346

## S28.03 File creation and deletion.
- Should: The user can create and delete files in the generated project.
- Status: web missing, desktop missing, mobile missing, vscode done, chrome missing
- Code: apps/extension-vscode/package.json:74; apps/extension-vscode/src/extension.ts:50; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346

## S28.04 File rename.
- Should: The user can rename files in the generated project.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/extension-vscode/package.json:74; apps/extension-vscode/src/extension.ts:50; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346

## S28.05 Language-aware editing.
- Should: The code editor is language-aware (syntax highlighting, indentation, brackets) while editing.
- Status: web missing, desktop missing, mobile missing, vscode done, chrome missing
- Code: apps/extension-vscode/package.json:282; apps/extension-vscode/src/providers/diffDecorationProvider.ts:335

## S28.06 Syntax diagnostics.
- Should: The code editor shows syntax errors and diagnostics inline.
- Status: web missing, desktop missing, mobile missing, vscode done, chrome missing
- Code: apps/extension-vscode/package.json:74; apps/extension-vscode/src/extension.ts:50; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346

## S28.07 Code completion where offered.
- Should: The code editor offers code completion (where the product offers it).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.08 Search across generated files.
- Should: The user can search across all the generated files of a project.
- Status: web missing, desktop missing, mobile missing, vscode done, chrome missing
- Code: apps/extension-vscode/package.json:74; apps/extension-vscode/src/extension.ts:50; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346

## S28.09 Source/preview split view.
- Should: Source and preview can be shown side by side.
- Status: chrome unverified

## S28.10 HTML preview.
- Should: HTML artifacts render as a live, interactive preview.
- Status: web partial, desktop partial, mobile done, chrome unverified
- Code: apps/web/lib/artifact-sandbox.ts:95; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:110; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:114
- Unfinished: web: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact | desktop: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact

## S28.11 React or supported framework preview.
- Should: React (or other supported framework) components render as a live preview.
- Status: web partial, desktop partial, mobile missing, chrome unverified
- Code: apps/web/lib/artifact-sandbox.ts:95
- Unfinished: web: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact | desktop: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact

## S28.12 Responsive preview sizes.
- Should: The preview can be switched between device sizes (phone, tablet, desktop).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.13 Preview theme selection.
- Should: The preview can be switched between light and dark themes.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.14 Element-selection editing.
- Should: The user can click an element in the preview to select it and ask for an edit to that element.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.15 Console panel.
- Should: A console panel shows the preview's logs and errors.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.16 Runtime-error overlay.
- Should: Runtime errors in the preview appear as an overlay with a way to recover.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: infrastructure/sandbox/index.html:494; infrastructure/sandbox/index.html:500; apps/web/features/chat/components/SandboxedIframe.tsx:163; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2097; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:69; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:819

## S28.17 Dependency-installation panel.
- Should: A panel shows and manages the dependencies/packages the app installs.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.18 Preview reload.
- Should: The user can reload the preview.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1580; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:902

## S28.19 Restart runtime.
- Should: The user can restart the app's runtime from a clean state.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1580; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:902

## S28.20 Network-permission controls.
- Should: The user can see and control which network destinations an app may reach.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.21 Secret/configuration placeholders.
- Should: Apps can declare secrets/config values as placeholders the user fills in without exposing them.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S28.22 AI-backed app behavior through a brokered API.
- Should: An app can call AI through a brokered product API instead of embedding keys.
- Status: web done, desktop missing, mobile missing, chrome missing
- Code: infrastructure/sandbox/index.html:310; apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:170; apps/web/lib/services/artifact-runtime-service.ts:204

## S28.23 App-local storage or database configuration.
- Should: An app can be given persistent local storage or a database, configured by the user.
- Status: web done, desktop missing, mobile missing, chrome missing
- Code: infrastructure/sandbox/index.html:310; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:94; apps/web/lib/services/artifact-runtime-service.ts:95; apps/web/db/neon/0325_published_artifact_storage.sql:3

## S28.24 Download source.
- Should: The user can download the app's source code.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1441; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:421; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:228; apps/cli/src/lib.rs:1034; apps/cli/src/lib.rs:1944; apps/extension-vscode/package.json:593; apps/extension-vscode/src/features/artifacts/artifactActions.ts:138

## S28.25 Export project archive.
- Should: The user can export a whole multi-file project as an archive (e.g. zip).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:527; apps/web/features/chat/utils/downloadArtifacts.ts:142

## S28.26 Open in coding workspace.
- Should: Generated code can be opened in a real coding workspace to keep developing it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome missing
- Code: apps/cli/src/lib.rs:1034; apps/cli/src/lib.rs:1944; apps/extension-vscode/package.json:593; apps/extension-vscode/src/features/artifacts/artifactActions.ts:138

## S28.27 Publish preview.
- Should: The user can publish the app to a shareable preview link.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1563; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1704; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:78; apps/web/app/api/artifacts/publish/route.ts:182; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:405; apps/mobile/src/features/chat/services/artifactPublishing.ts:13; apps/cli/src/lib.rs:1053; apps/cli/src/cloud/artifacts.rs:391

## S28.28 Publish production version.
- Should: The user can publish a separate production version (stable URL or domain) distinct from previews.
- Status: vscode missing, chrome unverified

## S28.29 Version comparison.
- Should: The user can compare two versions of the app's code.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S28.30 Rollback.
- Should: The user can roll the app back to an earlier version.
- Status: web done, desktop done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1294; apps/web/features/chat/stores/artifacts-store.ts:680

## S28.31 Fork/copy another shared creation.
- Should: From someone else's shared creation, the user can make their own copy to keep editing.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S28.32 Viewer-specific authentication for connected apps.
- Should: A viewer of a shared app can authenticate their own accounts for the app's connected services.
- Status: web missing, desktop missing, mobile missing, chrome missing
