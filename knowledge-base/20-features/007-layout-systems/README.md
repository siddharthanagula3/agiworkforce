---
id: "AREA-007"
type: "area"
title: "Layout systems"
features: ["F007-01", "F007-02", "F007-03", "F007-04", "F007-05", "F007-06", "F007-07", "F007-08", "F007-09", "F007-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 7. Layout systems

This area decides how the chat screen is laid out: where the conversation sits, how wide it is, which side panels open beside it, and how it changes on a phone, a tablet or a wide window. It also covers panels that can be resized, hidden, pulled into their own window, or printed. A good layout keeps the reply readable, keeps the composer (the text box) in reach, and remembers what the person set up.

**Who uses it.** Every user of every app. The layout code has no plan gate. The web and desktop code-session panes (tiled or stacked) only appear in the Code page, and only when the page turns them on (the `enabled` input of the pane hook, apps/web/features/code/hooks/use-code-panes.ts:25-34). The desktop floating Quick Ask window and detachable panels only exist in the Electron desktop app.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F007-01](F007-01-start-view-and-reading-column.md) | Start view and reading column | built | built | partly | built | partly | partly |
| [F007-02](F007-02-side-panels-beside-the-chat-artifact-sources-work.md) | Side panels beside the chat (artifact, sources, work) | built | built | built | no | partly | partly |
| [F007-03](F007-03-code-workspace-and-several-sessions-at-once.md) | Code workspace and several sessions at once | partly | partly | n/a | built | built | n/a |
| [F007-04](F007-04-collapsible-navigation-and-responsive-shell.md) | Collapsible navigation and responsive shell | partly | partly | partly | n/a | built | partly |
| [F007-05](F007-05-composer-at-the-bottom-growing-and-full-screen-edi.md) | Composer at the bottom, growing and full-screen editing | built | built | built | built | built | built |
| [F007-06](F007-06-full-screen-readers-and-viewers.md) | Full-screen readers and viewers | built | built | built | no | no | partly |
| [F007-07](F007-07-detachable-panels-and-floating-quick-ask.md) | Detachable panels and floating Quick Ask | n/a | built | n/a | n/a | no | built |
| [F007-08](F007-08-browser-beside-the-conversation.md) | Browser beside the conversation | no | no | no | n/a | no | built |
| [F007-09](F007-09-layout-memory-and-window-restoration.md) | Layout memory and window restoration | built | built | n/a | n/a | built | n/a |
| [F007-10](F007-10-printing.md) | Printing | built | built | built | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/007-layout-systems.md](../../10-requirements/capabilities/007-layout-systems.md).

## How this area works in the code

1. **Shell sizes itself to the window.** The web shell turns the window width and height into a tier (compact, tablet, regular) and a sidebar mode (drawer, rail, persistent). (`apps/web/shared/components/layout/app-shell-layout.ts:5`, `apps/web/shared/components/layout/app-shell-layout.ts:27`)
2. **Empty or full chat page.** The chat route renders the web chat root. The page decides whether the chat is empty (greeting and centred composer) or shows the transcript with the composer pinned. (`apps/web/app/chat/page.tsx:13`, `apps/web/features/chat/pages/WebChatPage.tsx:6651`, `apps/web/features/chat/pages/WebChatPage.tsx:7637`)
3. **Transcript column.** Messages render in their own scrolling list, with notices and rows held to a `max-w-3xl` centred column. (`apps/web/features/chat/components/messages/ChatMessageList.tsx:1939`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:2015`)
4. **Right panel opens.** The artifact panel reads a media query. At 639 pixels or narrower it is a full-screen overlay with a backdrop; otherwise it sits beside the chat with an inline width from the store. (`apps/web/features/chat/stores/artifacts-store.ts:38`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:265`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:669`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:680`)
5. **Resize.** The resize bar listens for drag and arrow keys and calls the store setter, which clamps to 280 to 900. (`apps/web/features/chat/components/SidePanelResizeHandle.tsx:35`, `packages/ui/unified-chat/src/stores/uiStore.ts:6`, `packages/ui/unified-chat/src/stores/uiStore.ts:55`)
6. **Layout saved.** Sidebar state goes to browser storage; panel width and theme go to a second store. In the desktop shell the same changes are also written through the host bridge to the shell's window-state file. (`apps/web/shared/stores/layout-store.ts:101`, `packages/ui/unified-chat/src/stores/uiStore.ts:77`, `apps/web/features/desktop-host/hooks/use-shell-layout.ts:35`, `apps/desktop/electron/shellWindowStore.ts:36`)
7. **Desktop window frame.** The Electron main process restores the saved frame for the current display arrangement and saves it again as the window moves. (`apps/desktop/electron/main.ts:945`, `apps/desktop/electron/main.ts:1011`, `apps/desktop/electron/windowState.ts:33`)
8. **Code panes.** The Code page uses a pane hook for up to three sessions and a layout toggle; CSS styles tiled and stacked. (`apps/web/features/code/hooks/use-code-panes.ts:31`, `apps/web/features/code/CloudCodePage.tsx:2387`, `apps/web/features/code/CloudCodePage.module.css:2631`)
9. **Detach, Quick Ask and print.** Detached panels open as a named browser window with copied styles. Quick Ask is a small desktop window loading the hosted quick-ask page. Print sets a page attribute that the print CSS keys on. (`apps/web/features/desktop-host/lib/panel-windows.ts:109`, `apps/desktop/electron/quickAsk.ts:6`, `apps/web/features/chat/pages/WebChatPage.tsx:7407`, `apps/web/app/globals.css:1862`)
10. **Mobile layout.** The phone app picks a permanent or overlay drawer and a grid column count from the window width, and caps content width. (`apps/mobile/src/shared/hooks/useResponsiveLayout.ts:23`, `apps/mobile/src/shared/layout/contentColumn.ts:3`, `apps/mobile/app/(app)/_layout.tsx:15`)

## Files to know

| File | Role |
|---|---|
| `apps/web/shared/components/layout/app-shell-layout.ts` | Turns window size into compact, tablet or regular and picks the sidebar mode. |
| `apps/web/features/chat/pages/WebChatPage.tsx` | The main chat page: empty-state layout, panels, print menu, detach hooks. |
| `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Right-hand artifact panel with overlay or side-by-side behaviour. |
| `apps/web/features/chat/components/SidePanelResizeHandle.tsx` | Drag and keyboard resize bar shared by the artifact, research and work panels. |
| `packages/ui/unified-chat/src/stores/uiStore.ts` | Shared panel width limits (280 to 900) and saved panel width and sidebar flag. |
| `apps/web/shared/stores/layout-store.ts` | Web sidebar collapsed state, saved in browser storage. |
| `apps/web/features/code/hooks/use-code-panes.ts` | State for up to three session panes and tiled or stacked layout. |
| `apps/web/features/desktop-host/lib/panel-windows.ts` | Opens a panel in its own window and copies styles into it. |
| `apps/desktop/electron/quickAsk.ts` | The floating Quick Ask window. |
| `apps/desktop/electron/windowState.ts` | Saved window frames per display arrangement and the 220 to 720 panel width limits. |
| `apps/mobile/src/shared/hooks/useResponsiveLayout.ts` | Mobile drawer width and grid columns from window width. |
| `apps/web/app/globals.css` | Print stylesheet keyed on data-print-scope=transcript. |

## What is stored

- Sidebar collapsed flag: Browser storage key 'agi-ui-store' (apps/web/shared/stores/layout-store.ts:101-117)
- Sidebar collapsed, theme mode, artifact panel width: Browser storage key 'chat-ui-store' (packages/ui/unified-chat/src/stores/uiStore.ts:77-85)
- Window frames per display arrangement, last route, sidebar collapsed, secondary panel width: Desktop shell window-state file on disk (apps/desktop/electron/windowState.ts:33-45; it mentions a window-state.json file at line 115)
- Window frame also saved in settings: Desktop settings store, key windowFrame (apps/desktop/electron/main.ts:1020)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **enabled (code panes)**: Turns tiled or stacked session panes on or off on the Code page. (apps/web/features/code/hooks/use-code-panes.ts:31)
- **ARTIFACT_PANEL_OVERLAY_QUERY, (max-width: 639px)**: Switches the artifact panel between overlay and side-by-side. (apps/web/features/chat/stores/artifacts-store.ts:38)
- **Shell width breakpoints 768 and 1024**: Choose drawer, rail or persistent sidebar. (apps/web/shared/components/layout/app-shell-layout.ts:5-6)
- **Mobile drawer breakpoint (280 + 720)**: Permanent or overlay drawer. (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3-10, 23)
- **Host bridge present**: Only inside the desktop shell are layout changes mirrored to the shell state. (apps/web/features/desktop-host/hooks/use-shell-layout.ts:17)
- **No plan gates or environment flags found in this area**: None seen. (Searched the files listed above only)

## Shared between apps

Shared: the web chat page, panels and print stylesheet (the desktop app shows the hosted web app, so desktop gets them too); packages/ui/unified-chat for panel width limits, markdown tables and the saved UI store. Separate per app: the mobile layout (apps/mobile, React Native), the CLI terminal screens (apps/cli/src/tui/tui_app.rs), the VS Code webview (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), and the Chrome extension side panel and in-page panel (apps/extension). Desktop-only native code is in apps/desktop/electron.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Two different panel width ranges. The web store allows 280 to 900, but the desktop shell clamps the saved width to 220 to 720, so a width of 800 chosen on desktop comes back as 720 on the next launch. (packages/ui/unified-chat/src/stores/uiStore.ts:6-7 and apps/desktop/electron/windowState.ts:57-58, 104-107)
- The artifact panel carries a fixed `lg:w-[480px]` and `md:w-1/2` class but also an inline width on desktop layout; the inline width wins, so the class widths are only used before the layout is known. (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:680, 686)
- The panel sets a `sm:min-w-[280px]` but the overlay cut-off is 639 wide, so between 640 and about 900 a 280 minimum panel leaves very little room for the chat; I saw no check that keeps the conversation above a minimum width. (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:686)
- Many line numbers in the brief no longer match the code (for example WebChatPage.tsx:5650, ChatComposerNew.tsx:4477, main.ts:881 point at unrelated code). The brief's code map is out of date. (apps/web/features/chat/pages/WebChatPage.tsx:5650 shows message edit code; apps/desktop/electron/main.ts:881 shows screen-share code)
- Left sidebar cannot be resized on any app, as the brief says. (No file; S7.10 has no code)
- The brief lists Chrome as done for the reading-width layout and cites side_panel.ts:5254 and 5218, but those lines are inside CSS for a memory list and onboarding button, not a reading column. (apps/extension/src/side_panel.ts:5218)

## Not established

- I did not open the composer files (ChatComposerNew.tsx, ComposerInput.tsx, ChatInput.tsx), so the growth limit and full-screen editor behaviour are not confirmed.
- I did not open ResearchReportView, ImageLightbox, ArtifactPreview, the mobile full-screen components or the Chrome media viewer, so full-screen reader and viewer behaviour is taken from the brief only.
- I did not confirm how the CLI, VS Code and Chrome lay out start views and reading width; only the brief and a few file locations.
- How a person triggers a panel detach (the exact button or menu) and the Quick Ask shortcut key were not found.
- How desktop handles Print (it shows the web page, but I did not confirm the Electron print path).
- Whether the sidebar toggle has a keyboard shortcut.
- The 'full-width table' view: I saw sticky headers but did not open MarkdownTable's expanded view.
- Which pane limit message, if any, is shown when the third pane is requested.
- Tablet two-column behaviour on mobile was inferred from the drawer code only; apps/mobile/src/shared/hooks/useTabletLayout.ts was not opened.
- Whether the VS Code docking (S7.13) comes only from VS Code's own window features or from custom code.
