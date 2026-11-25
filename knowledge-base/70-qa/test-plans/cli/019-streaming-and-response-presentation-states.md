---
id: "PLAN-cli-019"
type: "test-plan"
title: "CLI · 19. Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "19"
---
# CLI · 19. Streaming and response-presentation states

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S19.01 Request accepted.

- **Expected:** Right after sending, the surface shows that the request was accepted and work has started (before any output).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3017; apps/cli/src/tui/tui_app.rs:7896
- **Where to find it:** In Terminal run `agi`, type a message, press Enter. The line under the transcript starts with 'Thinking…' and a seconds count. (labels found in the code)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type any short message and press Enter.
  3. Look at the line just under the transcript: it should read 'Thinking…' with a seconds count, before any answer text appears.

## S19.03 Preparing context.

- **Expected:** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8545; apps/cli/src/agent/chat.rs:2722
- **Where to find it:** In Terminal run `agi`, attach a file or add context, then send. The line under the transcript reads 'Preparing context…' before the model answers. (labels found in the code)
- **Needs:** a file to attach
- **Steps:**
  1. Run `agi` in Terminal.
  2. Attach a file or mention a file with @ in the message, then press Enter.
  3. Look for 'Preparing context…' under the transcript before the answer starts.

## S19.04 Searching sources.

- **Expected:** While the assistant searches sources, the surface shows a searching state (ideally with the query).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:7945
- **Where to find it:** In Terminal run `agi`, type /search followed by a question, press Enter. A tool row with the search icon ⌕ appears while the search runs. (labels found in the code)
- **Needs:** a web search key (code says /search needs one)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type `/search <a question about a recent topic>` and press Enter.
  3. Look for a tool row with the ⌕ icon and a spinner while the search runs.

## S19.05 Running code.

- **Expected:** While code runs, the surface shows a running-code state for that step.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:7945
- **Where to find it:** In Terminal run `agi`, ask it to run a shell command, then approve. The tool row with the $ icon shows a spinner while the command runs. (labels found in the code)
- **Needs:** none (default permission mode asks for approval)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type `run the command echo hello` and press Enter.
  3. Press Yes at the approval panel.
  4. Look for the $ tool row with a spinner while the command runs, then a check mark when done.

## S19.06 Calling a connected service.

- **Expected:** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:7945
- **Where to find it:** In Terminal run `agi`, type /mcp to see connected services, then ask the agent to use one. Its tool row shows while it runs. (labels found in the code)
- **Needs:** a connected service (MCP server) set up
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type `/mcp` and press Enter to see connected services.
  3. Ask the agent to use a tool from one of them and press Enter.
  4. Look for the tool row with the service tool name and a spinner while it runs.

## S19.07 Waiting for approval.

- **Expected:** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3013; apps/cli/src/tui/approval_broker.rs:333
- **Where to find it:** In Terminal run `agi`, ask for an action that needs approval. The turn shows 'Waiting for your approval' with approval buttons. (labels found in the code)
- **Steps:**
  1. Run `agi` in Terminal (default permission mode).
  2. Type `create a file called test.txt containing hello` and press Enter.
  3. Look for 'Waiting for your approval' under the transcript and the approval panel with buttons.
  4. Press Yes or Deny All and check the turn continues or stops.

## S19.08 Waiting for user input.

- **Expected:** When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:1768; apps/cli/src/tui/tui_app.rs:1830
- **Where to find it:** In Terminal run `agi`. When the agent asks a question during a task, a panel titled 'Question from the agent' appears with choices and 'Type your own answer'. (labels found in the code)
- **Needs:** none (the agent decides when to ask)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Give a task that is ambiguous so the agent may ask you something.
  3. Look for the 'Question from the agent' panel.
  4. Choose an option with arrow keys and Enter, or type your own answer, and check the turn continues.

## S19.09 Receiving first output.

- **Expected:** The moment the first output arrives, the waiting indicator gives way to the answer.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1571 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:8163
- **Where to find it:** In Terminal run `agi`, type a message, press Enter. The 'Thinking…' line is replaced by the answer text. (labels found in the code)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type a short message and press Enter.
  3. Watch the 'Thinking…' line; when the first text arrives it should be replaced by the answer.

## S19.10 Streaming text.

- **Expected:** Text appears progressively while the model streams.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:8163; apps/cli/src/tui/tui_app.rs:5144 (quoted code not found in the file now)
- **Where to find it:** In Terminal run `agi`, type a message, press Enter. The answer text grows on screen while the model is still writing. (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Ask for a long answer, for example `explain how a hash map works in detail`, and press Enter.
  3. Watch the answer text grow line by line before the 'Thinking…' line disappears.

## S19.11 Streaming structured output.

- **Expected:** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5511
- **Where to find it:** In Terminal run `agi`, ask for a list, a table and a code block. They appear formatted while the answer is still streaming. (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Ask `give me a bulleted list, a small table, and a code block`, and press Enter.
  3. Watch the answer while it streams: the list, table and code block should show formatted, not as raw markup.

## S19.13 Generating media.

- **Expected:** While an image/video is generated, the surface shows generation progress.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5327 (quoted code not found in the file now)
- **Where to find it:** In Terminal run `agi`, type /image followed by a prompt and press Enter. The line 'Generating the image. Esc stops it.' appears. (labels found in the code)
- **Needs:** an AGI account (the image command is for managed accounts)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type `/image a red bicycle on a beach` and press Enter.
  3. Look for the line 'Generating the image. Esc stops it.' and a running state while it draws.
  4. Press Esc to stop and check the turn ends.

## S19.15 Completed.

- **Expected:** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2161; apps/cli/src/tui/tui_app.rs:2888
- **Where to find it:** In Terminal run `agi`, send a prompt and let it finish. The spinner stops and the answer line shows model, tokens in and out, and time. (labels found in the code)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Type a short message and press Enter.
  3. Wait until the 'Thinking…' line disappears.
  4. Look for the detail line under the answer with model, tokens and duration.

## S19.16 Partially completed.

- **Expected:** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:339; apps/cli/src/tui/tui_app.rs:7996
- **Where to find it:** not found in the code. Searched apps/cli/src for 'partial', 'Partially' and 'with errors'; no partially-completed label exists. The only related view is the header counts 'N completed · N failed' (apps/cli/src/tui/tui_app.rs).
- **Needs:** a run where some steps fail and others succeed

## S19.17 Cancel requested.

- **Expected:** After the user presses stop, the surface shows the stop is in progress until it takes effect.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8423; apps/cli/src/tui/tui_app.rs:8728
- **Where to find it:** In Terminal run `agi`, send a long prompt, press Esc while it works. The footer shows 'stopping the turn…'. (labels found in the code)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Send a prompt that gives a long answer, and press Enter.
  3. While it works, press Esc.
  4. Look for 'stopping the turn…' in the footer until the turn ends.

## S19.18 Cancelled.

- **Expected:** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8731; apps/cli/src/tui/tui_app.rs:8721
- **Where to find it:** In Terminal run `agi`, send a long prompt, press Esc. The transcript shows '⊘ Stopped' and keeps the text that already arrived. (labels found in the code)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Send a long prompt and press Enter.
  3. Press Esc once text has started to appear.
  4. Look for '⊘ Stopped' under the transcript and check the partial text is still there.

## S19.20 Resuming existing work.

- **Expected:** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- **Code:** done. Evidence present: apps/cli/src/agent/history.rs:280; apps/cli/src/lib.rs:1850
- **Where to find it:** In Terminal run `agi resume <session id>`, or inside `agi` type /resume. The line 'Resumed session … (N messages).' appears. (labels found in the code)
- **Needs:** a session that was still running
- **Steps:**
  1. Start a long background or long prompt, then close the terminal.
  2. Open Terminal, run `agi resume` and pick the session, or run `agi resume <session id>`.
  3. Look for 'Resumed session … (N messages).' and check the unfinished work is continued, not started from scratch.

## S19.21 Rate-limited.

- **Expected:** A rate-limited turn says so, with when to retry if known.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:386; apps/cli/src/errors.rs:436
- **Where to find it:** In Terminal run `agi`, send a prompt. When a provider rate-limits, the turn ends with a red error line 'is rate-limiting. Wait …s' or 'Rate limited, retry after …s'. (labels found in the code)
- **Needs:** a provider that rate-limits (not on demand)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Send prompts until the provider rate-limits (cannot be forced on demand).
  3. Look for the error line in the transcript that gives the wait time or says to wait and retry.

## S19.22 Budget exhausted.

- **Expected:** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- **Code:** done. Evidence present: apps/cli/src/errors.rs:414; apps/cli/src/errors.rs:522
- **Where to find it:** In Terminal run `agi`, type /usage to see usage. A turn blocked by a plan limit shows 'It resets in …' or 'Run `agi usage` to see when it resets.' (labels found in the code)
- **Needs:** an account that reaches its plan limit
- **Steps:**
  1. Run `agi` in Terminal.
  2. Send prompts until the plan limit is reached (cannot be forced on demand).
  3. Look for the error line with 'It resets in' or the 'agi usage' hint.
  4. Type `/usage` and compare the usage shown.

## S19.23 Authentication expired.

- **Expected:** A turn that fails because sign-in expired says so and offers to sign in again.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:326; apps/cli/src/errors.rs:509
- **Where to find it:** In Terminal run `agi`, send a prompt after sign-in has expired. The error line says 'Run `agi login` to sign in to your AGI account again.' (labels found in the code)
- **Needs:** an expired AGI sign-in
- **Steps:**
  1. Run `agi` in Terminal with an expired sign-in.
  2. Send a prompt.
  3. Look for the error line that says to run `agi login` to sign in again.
  4. Run `agi login` and check the next prompt works.

## S19.25 Provider unavailable.

- **Expected:** When the model provider is down/unavailable, the turn says so and offers retry or another model.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:405; apps/cli/src/errors.rs:944
- **Where to find it:** In Terminal run `agi`, send a prompt while the provider is down. The error line says '…returned HTTP …' and suggests a retry or another model. (labels found in the code)
- **Needs:** a provider outage (not on demand)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Send a prompt while the provider is unavailable (cannot be forced on demand).
  3. Look for the error line with 'Retry the request' or 'Pick another model'.
  4. Type `/model` and pick another model, then send again.

## S19.26 Failed with recoverable input.

- **Expected:** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:374; apps/cli/src/errors.rs:606
- **Where to find it:** In Terminal run `agi`, send a prompt that is too long. The error line says 'Context exceeded for …' and suggests `/compact`. (labels found in the code)
- **Needs:** a very long input
- **Steps:**
  1. Run `agi` in Terminal.
  2. Paste a very long text as the prompt and press Enter.
  3. Look for the error line 'Context exceeded for' with the `/compact` tip.
  4. Type `/compact`, then send the message again.

## S19.27 Failed after useful partial output.

- **Expected:** A turn that fails after producing useful output keeps that output and marks the failure.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:94; apps/cli/src/agent/chat.rs:2319
- **Where to find it:** In Terminal run `agi`. If the stream breaks after text arrived, the kept text stays and the error line says 'The connection closed before the answer finished.' (labels found in the code)
- **Needs:** a dropped connection (not on demand)
- **Steps:**
  1. Run `agi` in Terminal.
  2. Send a long prompt and let the connection drop (cannot be forced on demand).
  3. Look for the partial answer still on screen, then the error line 'The connection closed before the answer finished.'

## S19.28 Session restored after app restart.

- **Expected:** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6006; apps/cli/src/tui/tui_app.rs:4345
- **Where to find it:** Quit `agi`, then in Terminal run `agi resume` and pick the session, or inside `agi` type /resume. The earlier conversation and turns come back. (labels found in the code)
- **Steps:**
  1. Send a prompt, let it finish, then quit `agi`.
  2. Run `agi resume` in Terminal and pick the session.
  3. Look for 'Resumed session … (N messages).' and check the earlier turns are shown as before.

## S19.29 Background work continuing after UI closure.

- **Expected:** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- **Code:** done. Evidence present: apps/cli/src/background.rs:246; apps/cli/src/background.rs:474; apps/cli/src/background.rs:303; apps/cli/src/lib.rs:207; apps/cli/src/lib.rs:8110
- **Where to find it:** In Terminal run `agi background start <prompt>` (alias `agi bg start`), then `agi background list`. Use `agi background attach <id>` when it is done. (labels found in the code)
- **Steps:**
  1. Run `agi background start write a short summary of this folder`.
  2. Close the Terminal window.
  3. Open a new Terminal and run `agi background list`; check the state label.
  4. Run `agi background attach <id>` when it says finished, and check the result is there.
