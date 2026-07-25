// STB-24 TOMBSTONE — delete this file with `git rm` on a normal checkout.
//
// The shared backing module for the eleven apps/web/shared/utils/ stub files.
// Once those were removed it had zero importers repo-wide. Its no-op store
// hooks, `invoke = async () => ({})`, `countTokens = () => 0`, and the
// null-rendering React component stubs (BrowserVisualization, MonacoEditor,
// TerminalPanel, MemoryPanel, ScreenCaptureButton, TimeoutWarningDialog,
// DiffViewer) all type-checked at any JSX or call site that reached them,
// so a misrouted import rendered nothing and reported success.
export {};
