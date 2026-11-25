---
id: "PLAN-cli-034"
type: "test-plan"
title: "CLI · 34. Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "34"
---
# CLI · 34. Search experiences

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S34.01 Search inside the current conversation.

- **Expected:** Inside an open conversation the user can type a query and jump between the messages that match it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4680
- **Where to find it:** In an open chat in the terminal app, type /find <text> and press Return (labels found in the code)
- **Steps:**
  1. Run agi, then send two or three messages that share one word.
  2. Type /find <word> and press Return.
  3. Look for a list of matches, each with a message number, a speaker (you or assistant) and a short snippet of the matching line, and compare with Expected. The code lists the matches; it does not jump the view to a message.

## S34.02 Search conversation history.

- **Expected:** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:7848; apps/cli/src/repl/registry.rs:980; apps/cli/src/sessions.rs:919
- **Where to find it:** In the terminal, type agi --search <query> and press Return (labels found in the code)
- **Needs:** a few saved chats that contain a known word in a title or message
- **Steps:**
  1. Pick a word that appears in the title or a message of a saved chat.
  2. Type agi --search <word> and press Return.
  3. Look for the line "N session(s) matching" followed by the matching chats, and compare with Expected.
  4. Open one match with agi --session <ID>, using an ID from the list, and check that the chat opens.

## S34.06 Search connected company sources.

- **Expected:** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts (text found, layout changed); apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/cli/src/models/managed_approvals.rs:126; apps/cli/src/claude_parity.rs:2772
- **Where to find it:** In a Managed Cloud chat in the terminal app, type /connectors and press Return (labels found in the code)
- **Needs:** a paid account, a Managed Cloud chat, and Google Drive, Slack or Notion connected at the account's connectors page
- **Steps:**
  1. Start a Managed Cloud chat with agi (not a Local or BYOK chat).
  2. Type /connectors and press Return.
  3. Read the line "Your account's connectors" and the note that Google Drive, Slack and Notion are offered to the chat.
  4. Ask a question that needs a connected source, such as a file name in Drive, and check that an approval prompt appears before each connector call, then compare with Expected.

## S34.07 Public web search.

- **Expected:** A chat can search the public web and answer from the results.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/web/mod.rs:340; apps/cli/src/auth.rs:1127; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2753
- **Where to find it:** In a chat in the terminal app, type /search <question> and press Return (labels found in the code)
- **Needs:** a Brave Search or Tavily key for a Local or BYOK chat, or a Managed Cloud chat on a model that can search the web
- **Steps:**
  1. Start a chat with agi and make sure a Brave Search or Tavily key is saved, or use a Managed Cloud chat.
  2. Type /search followed by a question about a current topic, and press Return.
  3. Read the answer and look for a "Sources" block listing numbered titles and web addresses.
  4. Compare the answer with the sources and with Expected.

## S34.19 User-selected source collections.

- **Expected:** The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.
- **Code:** done. Evidence present: apps/cli/src/cloud/knowledge.rs:89; apps/cli/src/lib.rs:3800; packages/contracts/cloud-contracts/src/project-knowledge.ts:123
- **Where to find it:** In the terminal, type agi projects add-file <project> <file> and press Return (labels found in the code)
- **Needs:** a paid account with a project in it and a small text file to add
- **Steps:**
  1. Type agi projects list and note a project name.
  2. Type agi projects add-file "<project name>" <path to a small text file> and press Return.
  3. Type agi projects show "<project name>" and look for the file under "Knowledge files", then compare with Expected.

## S34.22 Query clarification choices.

- **Expected:** When a search query is ambiguous the product offers clarification choices the user can pick before searching.
- **Code:** done. Evidence moved: apps/cli/src/platform/runtime/tool_catalog.rs (text found, layout changed); apps/cli/src/features/exec/tools/task_registry/mod.rs:605 (quoted code not found in the file now); apps/cli/src/features/exec/tools/task_registry/mod.rs:636; apps/cli/src/features/exec/tools/task_registry/mod.rs:566 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Only a general ask_user tool was found (apps/cli/src/platform/runtime/tool_catalog.rs) that offers options for any question; nothing ties it to ambiguous search queries. Searched apps/cli/src for "clarif" only.

## S34.27 Open original source.

- **Expected:** From a citation or source card the user can open the original page/document.
- **Code:** done. Evidence present: apps/cli/src/sources.rs:91; apps/cli/src/tui/tui_app.rs:8665; apps/cli/src/repl/mod.rs:833; crates/agiworkforce-llm/src/stream.rs:877; apps/cli/src/models/streaming.rs:924; apps/cli/src/features/exec/tools/web/mod.rs:581
- **Where to find it:** not found in the code. The Sources block shows numbered titles and web addresses as plain text (apps/cli/src/sources.rs); searching apps/cli/src for open, xdg-open and webbrowser found no open-link action for sources.

## S34.32 Empty-results and unavailable-source states.

- **Expected:** Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/web/mod.rs:487; apps/cli/src/features/exec/tools/web/mod.rs:459
- **Where to find it:** In a chat in the terminal app, type /search <question> and press Return (labels found in the code)
- **Needs:** a chat with no search key saved for the first step; a Managed Cloud account whose plan blocks web search for the unavailable message
- **Steps:**
  1. Start a Local or BYOK chat with no Brave Search or Tavily key saved, then type /search <question> and press Return.
  2. Look for the message "/search needs a web search key in this session." and compare with Expected.
  3. Type /search with a question made of nonsense words and check that the answer says the search found nothing, then compare with Expected.
