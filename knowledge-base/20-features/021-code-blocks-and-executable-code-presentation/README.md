---
id: "AREA-021"
type: "area"
title: "Code blocks and executable code presentation"
features: ["F021-01", "F021-02", "F021-03", "F021-04", "F021-05", "F021-06", "F021-07", "F021-08", "F021-09", "F021-10", "F021-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 21. Code blocks and executable code presentation

When the assistant writes code, the person sees it as a clear block with its language name and colours, and can copy it, save it as a file, open it larger, or send it to an editor. Where the product can run code, the person can start a run from the chat, watch the output, errors, plots and generated files, and re-run or stop it. This matters because code is the thing people most often need to take elsewhere, and a run that fails silently or looks like it succeeded wastes time and trust.

**Who uses it.** Every chat user sees code blocks, and the copy, download and expand controls are on the web chat block for all users (no plan check seen in the block code). Running code in the cloud needs the sandbox server gate to be on (apps/web/lib/e2b/gate.ts) and a plan lookup that fails closed (apps/web/lib/e2b/runtime.ts:139-150). Running from the chat needs the code-execution toggle on and a model that reports code-execution support (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1633-1641). Workspace admins: not seen in the code. Developers use the same code path through the coding page (apps/web/features/code/components/CodeComposer.tsx).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F021-01](F021-01-language-label-and-syntax-colours.md) | Language label and syntax colours | built | built | built | built | no | built |
| [F021-02](F021-02-copy-and-download-a-code-block.md) | Copy and download a code block | built | built | built | partly | partly | partly |
| [F021-03](F021-03-open-a-code-block-full-screen.md) | Open a code block full screen | built | built | n/a | no | no | no |
| [F021-04](F021-04-diff-changed-lines-and-error-line-highlight.md) | Diff, changed lines and error-line highlight | partly | partly | partly | partly | partly | no |
| [F021-05](F021-05-explain-edit-beside-chat-and-open-in-coding-worksp.md) | Explain, edit beside chat, and open in coding workspace | partly | partly | partly | no | partly | no |
| [F021-06](F021-06-apply-suggested-code-to-repository-files.md) | Apply suggested code to repository files | no | no | no | built | built | no |
| [F021-07](F021-07-run-code-from-the-chat.md) | Run code from the chat | partly | partly | partly | partly | partly | no |
| [F021-08](F021-08-execution-output-panel.md) | Execution output panel | partly | partly | partly | partly | partly | partly |
| [F021-09](F021-09-generated-files-and-plots.md) | Generated files and plots | built | built | partly | no | no | partly |
| [F021-10](F021-10-retry-stop-and-reset-a-run.md) | Retry, stop and reset a run | partly | partly | partly | partly | built | no |
| [F021-11](F021-11-line-numbers-line-wrapping-and-collapsing-long-blo.md) | Line numbers, line wrapping and collapsing long blocks | partly | partly | partly | no | no | no |

Requirement items for this area: [10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md).

## How this area works in the code

1. **The reply arrives and fences are routed to the code block component.** The markdown renderer sends each finished fenced block to the CodeBlock component, passing the language class and the code text. Streaming blocks are marked so they show plain text. (`packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:726`, `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:282`)
2. **CodeBlock decides what kind of block it is.** It reads the language from the class name, turns chart and diagram fences into their own components, shows inline code for unlabelled backticks, and sends other labelled blocks to the full code block. (`packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:282-326`, `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:327`)
3. **The block draws its header and buttons.** FencedCodeBlock shows the language label, Copy, Edit (only if an editor is available and the reply is complete), Download and Expand buttons. HTML blocks also get a preview. (`packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:79`, `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:81`, `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:199`)
4. **Highlighting runs after the block is complete.** The highlighter loads the language and theme on demand, caches the result per code and language, and renders coloured tokens. Until ready it shows the plain code. (`packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx:1`, `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:6`, `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:231`, `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:240`)
5. **Copy and download act on the block's own text.** Copy writes the code text to the clipboard. Download picks a file name and extension from the language and saves the text as a file on the device. (`packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:93`, `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:108`, `packages/ui/unified-chat/src/components/markdown/codeFileName.ts:113`)
6. **The user asks for a run from the composer.** The code-execution setting is part of the composer state. It is switched on by the toggle or the code command, and switched off automatically when the selected model does not support code execution. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1633-1641`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1717-1719`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2566`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3263`)
7. **The server decides whether cloud execution may run.** The sandbox gate reads the server switch and the sandbox key. The plan is looked up first and the request is refused if the lookup fails. Pricing must be known before provisioning. (`apps/web/lib/e2b/gate.ts:6-7`, `apps/web/lib/e2b/gate.ts:9`, `apps/web/lib/e2b/gate.ts:20`, `apps/web/lib/e2b/runtime.ts:139-150`, `apps/web/lib/e2b/compute-metering.ts:89-91`)
8. **The run result comes back as tool data.** The web chat shows the run result through the execution block. Mobile and VS Code keep it in a tool-call timeline. The stored form of the result is not established in this pass. (`apps/web/features/chat/components/messages/MessageBubble.tsx:2799`, `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:76`)
9. **The execution block renders output, errors and plots.** It shows a spinner while running, a success or failure icon, stdout under Output, stderr under Stderr, exit code on failure, and only safe base64 images as plots. (`apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:76`, `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:22-33`)
10. **Other apps have their own renderers.** VS Code renders its own markdown with its own copy, explain and diff classes. Mobile re-runs through a service call with its own timeout and error messages. The CLI renders in the terminal. (`apps/extension-vscode/src/webview/render.ts:49-50`, `apps/extension-vscode/src/webview/render.ts:236`, `apps/mobile/src/features/chat/components/CodeRunAgain.tsx:17`, `apps/mobile/src/features/chat/components/CodeRunAgain.tsx:20`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | The code block itself: header, language label, Copy, Edit, Download, Expand, full-screen dialog, diff lines, shell note, chart and diagram routing. |
| `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Turns the reply markdown into React; sends each finished fence to CodeBlock (line 726). |
| `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Renders highlighted tokens, falls back to plain code while loading or when disabled during streaming. |
| `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts` | Loads languages and the six colour themes on demand, caches highlighted lines, stores the active theme. |
| `packages/ui/unified-chat/src/components/markdown/codeFileName.ts` | Maps a language name to a download file name and extension, with a plain text fallback. |
| `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` | Web run panel: spinner, success or failure icon, output, stderr, exit code, plots. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Code-execution toggle state, model support check, automatic turn-off, command that turns it on. |
| `apps/web/lib/e2b/gate.ts` | Server switches for cloud code execution: the flag, the sandbox key, and the readiness check. |
| `apps/web/lib/e2b/runtime.ts` | Creates and runs sandbox sessions; resolves the plan first and fails closed. |
| `apps/mobile/src/features/chat/components/CodeRunAgain.tsx` | Mobile re-run control and its too-long and failure messages. |
| `apps/extension-vscode/src/webview/render.ts` | VS Code chat renderer: code body, diff line classes, Copy and Explain buttons, surface copy handler. |

## What is stored

- The code text of each block is part of the assistant message content in the chat (the block is rebuilt from message content on screen).: Chat message content; the database table was not traced in this pass.
- Copied code goes to the system clipboard only; nothing is kept by the app.: Operating-system clipboard (packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:93).
- Downloaded code is saved as a file chosen by the browser or the user.: The device downloads folder via the download helper (CodeBlock.tsx:108; downloadTextFile.ts).
- Active code colour theme is held in memory for the page session; the saved choice was not traced.: packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:85-92.
- Highlight cache of coloured lines, per code and language.: In memory, read through readHighlightCache (shikiHighlighter.ts:231).
- Run results (stdout, stderr, return code, images) are passed in as tool data.: Not established: the persistence layer for execution results was not traced.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION**: Server flag. Must be the value 1 for the provisioning check to pass; combined with the sandbox key and pricing for cloud runs. (apps/web/lib/e2b/gate.ts:6 (read at :15 and :21))
- **E2B_API_KEY**: Sandbox service key. Its presence alone makes e2bExecutionEnabled() return true; provisioning also needs the flag. (apps/web/lib/e2b/gate.ts:7, :10, :21-22)
- **Sandbox pricing readiness**: Cloud provisioning is refused unless the sandbox rate can be resolved. (apps/web/lib/e2b/compute-metering.ts:89-91 (sandboxComputeIsPriceable))
- **Plan lookup for managed compute**: Refuses managed compute if the plan cannot be looked up (fail closed). (apps/web/lib/e2b/runtime.ts:139-150)
- **Code-execution toggle and model support**: User switch for running code from chat; forced off when the model does not report support. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:399, 1633-1641, 1717-1719, 2566)
- **Code colour theme**: Chooses one of six highlight themes; default is GitHub-style. (packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:58-75 and setCodeTheme at :92)
- **Managed compute private beta**: Separate broader gate for managed compute; the brief says it is on when unset. (apps/web/lib/e2b/gate.ts:4 imports it; the value was not read in this pass.)

## Shared between apps

Shared: the markdown and code block components in packages/ui/unified-chat (CodeBlock, HighlightedCode, shikiHighlighter, codeFileName) are used by the web chat and, by inference from AGENTS.md section 5, by the desktop, which shows the hosted web app. Separate per app: mobile renders with its own MessageContentRenderer and CodeRunAgain; the CLI renders in the terminal with its own Rust code (apps/cli/src/tui); VS Code has its own renderer (apps/extension-vscode/src/webview/render.ts); the web run panel lives in apps/web only. The sandbox server code (apps/web/lib/e2b) is shared by web and, per the brief, desktop.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The run panel shows the fixed English text Running Python while running, and other labels (Code Execution, Output, Stderr, Plot, Exit code) are fixed English too, although the runtime choice allows more than Python and the block code elsewhere uses translated labels. (apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:76)
- The brief says the web run has a stop control, but this run panel has no stop control. (apps/web/features/chat/components/messages/CodeExecutionBlock.tsx (whole file))
- The model-support check turns the code-execution toggle off silently with no message to the person, which does not match the brief's requirement to state an unsupported state clearly. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1717-1719)
- The brief cites lines for the unsupported-runtime state that are actually free-media access logic (image and video offers), not runtime support. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1296-1304 and :4505-4515)
- The brief cites webviewContent.ts:4235 as the Explain action, but that line is part of an upgrade or billing button handler; the explain button is in render.ts. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4233-4238; explain button at apps/extension-vscode/src/webview/render.ts:50 and handler at :236)
- The two server gate checks disagree: the execution-enabled check is true with the key alone, while the provisioning check needs the flag and the key. The brief's switch-on steps say both are needed. (apps/web/lib/e2b/gate.ts:9-12 and :20-24)
- The brief cites the web runtime selection at CodeComposer.tsx, which is the coding page, not the chat block. The chat has no runtime choice in the code seen. (apps/web/features/code/components/CodeComposer.tsx:322-329)
- The brief's note on S21.22 and S21.21 is cut off mid-sentence, and it repeats the same text for web and desktop. (audit brief 021-code-blocks-and-executable-code-presentation.md, items S21.21 and S21.22 (not code))

## Not established

- Whether the desktop app renders chat code through the same code as the web app. Inferred from AGENTS.md section 5, not traced in the desktop code.
- Mobile, CLI and VS Code rendering and run paths: the brief gives their line numbers, but I did not open those files (apps/mobile MessageContentRenderer.tsx, apps/cli/src/tui/tui_app.rs and markdown_renderer.rs, apps/extension-vscode ChatStateManager.ts and webviewContent.ts). Their behaviour is taken from the brief's status only.
- Whether any run can happen on the device (Local) or with the person's own key (own key). Only the cloud sandbox path was traced.
- How a run is sent from the composer to the sandbox and back: the request route and streaming were not traced beyond the gate and runtime checks.
- Where run results are stored and how they are restored when a chat is reopened.
- Exact behaviour on failure of a copy in the expanded view, of download on a locked-down browser, and of Explain in VS Code.
- Plan limits per run, time limits and the runtime list: not traced beyond the fail-closed plan lookup.
- Whether the managed compute private beta switch changes what the cloud sandbox allows; the value and its reader were not read.
- Whether the web chat block has a translation key for every label; the translation files were not checked.
- Mobile and VS Code durations, stdin and dependency-install status: the brief's status was used, the code was not checked for these.
- The test coverage for these features: not checked (the tests were not run, per the instruction that nothing is built or run).
