---
id: "PLAN-vscode-019"
type: "test-plan"
title: "VS Code · 19. Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "19"
---
# VS Code · 19. Streaming and response-presentation states

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S19.01 Request accepted.

- **Expected:** Right after sending, the surface shows that the request was accepted and work has started (before any output).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7826; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5031
- **Where to find it:** AGI Code (activity bar icon) > chat box "Describe a task…" > Send (Enter) (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Click the AGI Code icon in the activity bar, or run "Code: Open Chat" from the Command Palette.
  2. Click the box "Describe a task…", type a short question, and press Enter or click "Send (Enter)".
  3. Look at your message: it should show "Sending", then "Running", and the AGI typing mark (aria label "AGI is responding") should appear before any answer text.

## S19.02 Waiting in queue.

- **Expected:** A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:634; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7830
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) while a reply is still running (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send a question that takes a while to answer.
  2. While the reply is still streaming, type a second message and press Enter or click "Send (Enter)".
  3. Look at the second message: it should show "Queued".
  4. When the first reply finishes, look for "Starting queued follow-up" above the box, with a count of waiting messages if others are queued.

## S19.03 Preparing context.

- **Expected:** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7930; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9211
- **Where to find it:** AGI Code > chat box "Describe a task…" > "+" button ("Attach or use tools") to add a file or context > Send (Enter) (labels found in the code)
- **Needs:** a file to attach (optional)
- **Steps:**
  1. Click the "+" button (title "Attach or use tools") and add a file or the editor context.
  2. Type a question and press Enter or click "Send (Enter)".
  3. Look between sending and the first answer: the AGI typing mark (aria label "AGI is responding") shows, and "Context (N)" appears under your message.

## S19.04 Searching sources.

- **Expected:** While the assistant searches sources, the surface shows a searching state (ideally with the query).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8797; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7946; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7961
- **Where to find it:** AGI Code > "+" button ("Attach or use tools") > Browse the web > chat box "Describe a task…" (labels found in the code)
- **Needs:** a signed-in account that can run a model; the model must choose to search
- **Steps:**
  1. Click the "+" button and choose "Browse the web"; the chip "Browse the web for current sources" appears.
  2. Ask a question that needs current facts, for example a news question, and press Enter.
  3. Look for a tool row with a search icon while the search runs, and the search summary text the runtime sends in that row.

## S19.05 Running code.

- **Expected:** While code runs, the surface shows a running-code state for that step.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8793; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7946; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7961
- **Where to find it:** AGI Code > chat box "Describe a task…" > ask for a command to run, such as "run the tests" (labels found in the code)
- **Needs:** a signed-in account that can run a model; a project folder open in VS Code
- **Steps:**
  1. Set the mode with the control labelled "Mode and reasoning effort" to "Auto" or "Ask".
  2. Type "run the tests in this project" and press Enter.
  3. Look for a tool row with a terminal icon. It shows as pending until it ends, then changes to done or error.

## S19.06 Calling a connected service.

- **Expected:** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7946; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7961
- **Where to find it:** AGI Code > start screen "Connected apps" > "Ask with it" (labels found in the code)
- **Needs:** a connected app or MCP server
- **Steps:**
  1. Connect an app or MCP server (Settings via "Code: Open Settings" or "Code: Open Agent Configuration").
  2. Open the chat, click "Ask with it" under "Connected apps", type a request, and press Enter.
  3. Look for a tool row with a plug icon that names the connected service and shows as pending until it ends.

## S19.07 Waiting for approval.

- **Expected:** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7117; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8437
- **Where to find it:** AGI Code > controls "Mode and reasoning effort" > Ask > chat box "Describe a task…" (labels found in the code)
- **Needs:** a signed-in account that can run a model; a project folder open in VS Code
- **Steps:**
  1. Open the mode control (aria label "Mode and reasoning effort") and choose "Ask".
  2. Type a request that edits a file or runs a command, such as "add a comment to README", and press Enter.
  3. Look for an approval card in the chat with buttons "Approve once", "Approve … for session", "Deny" and "Abort turn" (and "Review change" when offered). The reply should pause there.

## S19.09 Receiving first output.

- **Expected:** The moment the first output arrives, the waiting indicator gives way to the answer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7815; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7852
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send any question and press Enter.
  2. Watch the AGI typing mark (aria label "AGI is responding") after sending.
  3. Look for the first answer text to appear in the reply bubble.

## S19.10 Streaming text.

- **Expected:** Text appears progressively while the model streams.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7852; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now)
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send a question that gets a long answer, for example "explain how a hash map works", and press Enter.
  2. Watch the reply bubble while it is still streaming.
  3. Look for the text to grow piece by piece, with the "Stop response" button available in the box.

## S19.11 Streaming structured output.

- **Expected:** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7853; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now)
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send "give me a list, a table and a short code example of a for loop" and press Enter.
  2. Watch the reply while it streams.
  3. Look for the list, table and code block to show as formatted parts (not raw markdown symbols) while the reply is still streaming, and the code block to get its copy actions.

## S19.15 Completed.

- **Expected:** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5833 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7890
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter), then wait for the reply to end (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send a question and press Enter.
  2. Wait until the reply stops growing and the typing mark is gone.
  3. For a reply that used tools, open the activity group above the reply and look for "Completed" in its summary line.

## S19.16 Partially completed.

- **Expected:** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5833 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7960
- **Where to find it:** AGI Code > chat box "Describe a task…" > a request where one tool step fails (for example a command that exits with an error) (labels found in the code)
- **Needs:** a signed-in account that can run a model; a project folder open in VS Code
- **Steps:**
  1. Send a request that runs a command likely to fail, such as "run a command that does not exist", and press Enter.
  2. Wait for the reply to end.
  3. Look at the activity group summary above the reply: it should read "Completed with errors" when a tool step failed and the rest finished.

## S19.17 Cancel requested.

- **Expected:** After the user presses stop, the surface shows the stop is in progress until it takes effect.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5870
- **Where to find it:** AGI Code > chat box while a reply runs > "Stop response" button (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send a long question and wait until the reply is streaming.
  2. Click the "Stop response" button in the box (title "Stop response").
  3. Look just above the box: the status line should read "Stopping…" and the button should be busy until the stop takes effect.

## S19.18 Cancelled.

- **Expected:** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:330 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code > chat box while a reply runs > "Stop response" button (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Send a long question, wait for some text to appear, then click "Stop response".
  2. Wait for the stop to take effect.
  3. Look at the reply: the text that already arrived should stay, and the turn should end with the stop copy or the status clearing.

## S19.20 Resuming existing work.

- **Expected:** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3048; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3035; apps/cli/src/app_server/developer_host.rs:3943
- **Where to find it:** AGI Code > Search sessions (sessions list) > open the session that was running (labels found in the code)
- **Needs:** a signed-in account that can run a model
- **Steps:**
  1. Start a long reply in a chat, then close the AGI Code view or editor chat tab while it runs.
  2. Reopen AGI Code, find the session in the list (placeholder "Search sessions"), and open it.
  3. Look for the running reply to continue with its activity rows still updating, rather than starting over.

## S19.21 Rate-limited.

- **Expected:** A rate-limited turn says so, with when to retry if known.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:308 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:310
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) on a model whose provider is rate-limiting this account (labels found in the code)
- **Needs:** a provider that is rate-limiting this account; not forced by the tester
- **Steps:**
  1. Send a request on a model whose provider is rate-limiting this account (a tester cannot force this on demand).
  2. Look for the error card with the rate-limit text and the buttons "Retry" and "Switch model".
  3. Check that a wait time appears when the provider gave one.

## S19.22 Budget exhausted.

- **Expected:** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:300 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:309
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) on an account that has used its usage limit (labels found in the code)
- **Needs:** an account that has reached its usage limit
- **Steps:**
  1. Send a request from an account that has reached its usage limit.
  2. Look for the error card with "You have reached a usage limit on your account…".
  3. Check that the card offers "Upgrade your plan" or "See your usage".

## S19.23 Authentication expired.

- **Expected:** A turn that fails because sign-in expired says so and offers to sign in again.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:295 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:307
- **Where to find it:** Command Palette > "Code: Sign Out of AGI Cloud" > AGI Code > chat box "Describe a task…" > Send (Enter) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account to sign out of
- **Steps:**
  1. Run "Code: Sign Out of AGI Cloud" from the Command Palette.
  2. Open AGI Code and send a message.
  3. Look for the error card "Sign in to AGI to run this model on your plan." with the button "Sign in to AGI".

## S19.24 Required device unavailable.

- **Expected:** When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4311; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8102
- **Where to find it:** Command Palette > "Code: Restart Local Runtime" (or stop the local runtime) > AGI Code > runtime status panel (labels found in the code)
- **Needs:** a computer where the local runtime can be stopped
- **Steps:**
  1. Stop the local runtime, or make it unavailable on this computer.
  2. Open AGI Code and try to send a message.
  3. Look for the runtime status panel titled "Developer runtime needs setup" with the message "AGI's local runtime isn't running." and the "Try again" button.

## S19.25 Provider unavailable.

- **Expected:** When the model provider is down/unavailable, the turn says so and offers retry or another model.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:316 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) on a model whose provider is down (labels found in the code)
- **Needs:** a provider that is down; not forced by the tester
- **Steps:**
  1. Send a request on a model whose provider is unavailable (a tester cannot force this on demand).
  2. Look for the error card "… could not answer." with "Retry" and "Switch model" buttons.
  3. Click "Switch model" and check that the request can continue on another model.

## S19.26 Failed with recoverable input.

- **Expected:** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:320 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter) with a very long message or conversation (labels found in the code)
- **Needs:** a very long text to paste
- **Steps:**
  1. Paste a very long text (or keep one chat going until it is very long) and press Enter.
  2. Look for the error card "This conversation is longer than the model can read at once."
  3. Check that the card tells you what to change before resending.

## S19.27 Failed after useful partial output.

- **Expected:** A turn that fails after producing useful output keeps that output and marks the failure.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:318 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code > chat box "Describe a task…" > Send (Enter); the provider stream breaks part way through (labels found in the code)
- **Needs:** a provider stream that breaks mid-answer; not forced by the tester
- **Steps:**
  1. Send a long question and wait for some answer text to appear (a provider fault is needed to break it).
  2. Look for the error card "… stopped replying part way through." with the text received so far still above it.
  3. Check that the card offers "Switch model".

## S19.28 Session restored after app restart.

- **Expected:** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8276; apps/extension-vscode/src/core/commandSetup.ts:1399
- **Where to find it:** Quit and reopen VS Code > AGI Code (activity bar) > Search sessions > open the chat (labels found in the code)
- **Needs:** a signed-in account that can run a model; one stopped chat
- **Steps:**
  1. Have one finished chat and one chat where you pressed "Stop response" midway.
  2. Quit VS Code completely and open it again.
  3. Open AGI Code, find the chat in the list (placeholder "Search sessions"), and open it.
  4. Look for the messages and the notice "The previous turn stopped early. You can continue here." on the stopped chat.

## S19.29 Background work continuing after UI closure.

- **Expected:** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** no screen of its own. Code audit suggests the opposite of Expected: closing the view calls cancelInFlight (apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts, view dispose) and the editor panel does the same (apps/extension-vscode/src/providers/chatEditorPanel.ts), which interrupts the active turn. Not verified by running.
- **Needs:** a device that stays on while you wait
- **Steps:**
  1. Start a long reply and close the AGI Code view or the editor chat tab while it is still streaming.
  2. Wait a minute, then reopen AGI Code and open the same session from "Search sessions".
  3. Look at whether the reply finished and is there, or is still running, or shows "The turn was stopped.".
