---
id: "PLAN-cli-052"
type: "test-plan"
title: "CLI · 52. Custom-assistant builder"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "52"
---
# CLI · 52. Custom-assistant builder

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S52.01 Assistant manager.

- **Expected:** A user sees their custom assistants in one place and can open, edit or remove each.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:1147; apps/cli/src/agents.rs:1165; apps/cli/src/agents.rs:1188
- **Owner decision is open on this item.**
- **Where to find it:** Type /agents (no words after it) in the AGI CLI chat screen. It opens the "Agents" list. (labels found in the code)
- **Needs:** at least one custom assistant already created
- **Steps:**
  1. Start the app with agi, then type /agents and press Enter.
  2. Look for the "Agents" box: each row shows the name, color, scope (project or global), model and description.
  3. Type part of a name in the search line to filter the list, then press Esc to close it.
  4. To remove one, type /agents delete <name> --yes (without --yes it only shows a warning that the delete cannot be undone).
  5. To change one, type /agents set <name> <field> <value>, then /agents show <name> to see the result.
  6. Compare with Expected: open, edit and remove are all reachable, but the list itself has no edit or remove buttons, and Enter activates the agent instead of opening an editor.

## S52.02 Create assistant.

- **Expected:** A user can create a new custom assistant from the product.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:268; apps/cli/src/agents.rs:580; apps/cli/src/agents.rs:1062
- **Owner decision is open on this item.**
- **Where to find it:** Type /agents create <description> (several words, for an AI-drafted assistant) or /agents create <name> (one word, for a blank template) in the chat screen. (labels found in the code)
- **Needs:** a signed-in account with a model for the description form; none for the blank template
- **Steps:**
  1. Type /agents create (with nothing after it) and press Enter to see the "Create new agent" help.
  2. Type /agents create reviews pull requests for risky changes and press Enter.
  3. Wait for "Generating agent configuration..." to finish.
  4. Type /agents and press Enter to check that the new agent appears in the "Agents" list.
  5. For a blank template, type /agents create my-reviewer and press Enter, then check for "Created project agent `my-reviewer` at" in the reply.
  6. Compare with Expected: the new assistant can be created from the product, and it shows up in the list.

## S52.04 Direct configuration editor.

- **Expected:** A user can edit an assistant's fields (name, instructions, model, tools) in a form or editor inside the product.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:1188
- **Where to find it:** Type /agents set <name> <field> <value> in the chat screen. There is no form or editor screen; each command changes one field. (labels found in the code)
- **Needs:** a custom assistant to change
- **Steps:**
  1. Type /agents set reviewer description Reviews risky pull requests and press Enter, using the name of an assistant you made.
  2. Read the reply: it should say the field was updated.
  3. Type /agents show reviewer and press Enter.
  4. Compare with Expected: the new description shows in the details.
  5. Repeat with another field, for example /agents set reviewer model <model name> or /agents set reviewer tools read_file, search_files.
  6. Note the editable fields listed in the "Fields:" line: description, model, color, tools, disallowedTools, skills, maxTurns, maxBudgetUsd, permissionMode, prompt.

## S52.06 Assistant name.

- **Expected:** An assistant has a user-set name shown wherever it is listed or used.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:268; apps/cli/src/agents.rs:874; apps/cli/src/agents.rs:25
- **Where to find it:** Type /agents rename <name> <new-name> in the chat screen, then type /agents to check the list. (labels found in the code)
- **Needs:** a custom assistant to rename
- **Steps:**
  1. Type /agents rename reviewer code-reviewer and press Enter.
  2. Read the reply: it should say the agent was renamed.
  3. Type /agents and press Enter.
  4. Compare with Expected: the new name is shown in the "name" column of the "Agents" list.
  5. Type /agents show code-reviewer and check the "Agent:" heading.

## S52.08 Short description.

- **Expected:** An assistant has a short description shown in lists.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:268; apps/cli/src/agents.rs:874; apps/cli/src/agents.rs:25
- **Where to find it:** Type /agents set <name> description <text> in the chat screen, then type /agents to see it in the list. (labels found in the code)
- **Needs:** a custom assistant to describe
- **Steps:**
  1. Type /agents set reviewer description Reviews risky pull requests and press Enter.
  2. Type /agents and press Enter.
  3. Compare with Expected: the description appears in the list row for reviewer.
  4. Clear it with /agents set reviewer description and check that the row shows "(no description)".

## S52.10 Instructions.

- **Expected:** An assistant has instructions that shape every conversation it runs.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:268; apps/cli/src/tui/tui_app.rs:5014; apps/cli/src/agents.rs:138
- **Where to find it:** Type /agents set <name> prompt <text> in the chat screen, then /agents show <name> to read it back. (labels found in the code)
- **Needs:** a custom assistant to give instructions to
- **Steps:**
  1. Type /agents set reviewer prompt You review code for security problems only and press Enter.
  2. Type /agents show reviewer and press Enter.
  3. Check the "Prompt:" section at the bottom of the reply for the new text.
  4. Type /agents reviewer to activate it. The reply should say Agent `reviewer` activated.
  5. Ask a question in the chat and compare the answer with the instructions in Expected.

## S52.16 Model preference.

- **Expected:** An assistant can pin a preferred model that is used when it runs.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:268; apps/cli/src/tui/tui_app.rs:5014; apps/cli/src/agents.rs:98
- **Where to find it:** Type /agents set <name> model <model name> in the chat screen, then /agents show <name>. Model names come from the model list in the product. (labels found in the code)
- **Needs:** a model name that this account can use
- **Steps:**
  1. Type /agents set reviewer model <model name> and press Enter, using a model name the product accepts.
  2. Type /agents show reviewer and press Enter.
  3. Check the "model:" line in the reply for the chosen model.
  4. Type /agents reviewer to activate it.
  5. Compare with Expected: the reply should say Agent `reviewer` activated and show "(model: ...)" with the pinned model.

## S52.17 Tool selection.

- **Expected:** An assistant's configuration chooses which tools it may use.
- **Code:** done. Evidence moved: apps/cli/src/claude_parity.rs:268; apps/cli/src/tui/tui_app.rs:5014; apps/cli/src/agents.rs:67 (quoted code not found in the file now)
- **Where to find it:** Type /agents set <name> tools <tool names> in the chat screen, or /agents set <name> disallowedTools <tool names> to block some. Check the result with /agents show <name>. (labels found in the code)
- **Needs:** a custom assistant to change
- **Steps:**
  1. Type /agents set reviewer tools read_file, search_files and press Enter.
  2. Type /agents show reviewer and press Enter.
  3. Check the "tools:" line in the reply.
  4. Type /agents set reviewer disallowedTools web_fetch to block one tool, then /agents show reviewer again.
  5. Compare with Expected: the tools line lists only the chosen tools, and the disallowed one appears under "disallowed_tools".

## S52.18 Web-search enablement.

- **Expected:** An assistant's configuration can turn web search on or off for it.
- **Code:** done. Evidence moved: apps/cli/src/claude_parity.rs:268; apps/cli/src/tui/tui_app.rs:5014; apps/cli/src/agents.rs:67 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No web-search switch for an assistant was found in apps/cli/src/agents.rs or the picker. The only per-assistant control is the tools and disallowedTools list, which takes tool names; I did not find a product-defined web-search tool name outside tests. Searched the CLI source for web_search, web search and per-agent options.

## S52.19 Code-execution enablement.

- **Expected:** An assistant's configuration can turn code execution on or off for it.
- **Code:** done. Evidence moved: apps/cli/src/claude_parity.rs:268; apps/cli/src/tui/tui_app.rs:5014; apps/cli/src/agents.rs:67 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No code-execution switch for an assistant was found. The only per-assistant control is the tools and disallowedTools list; the code-execution tool name is not defined in the agent settings. Searched the CLI source for code_execution, code execution and per-agent options.

## S52.21 Connector selection.

- **Expected:** An assistant's configuration selects which connectors it can use.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:1511; apps/cli/src/agent/mod.rs:1015; apps/cli/src/agent/chat.rs:2545
- **Where to find it:** not found in the code. The agent file frontmatter reads mcpServers (apps/cli/src/agents.rs) and applies it as the allowed MCP servers, but mcpServers is not one of the editable fields for /agents set. No connector picker was found. The only way found is editing the file that /agents path <name> prints. Searched for connector, mcp and mcpServers in the CLI source.

## S52.31 Private access.

- **Expected:** An assistant can be kept private to its creator.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:268; apps/cli/src/agents.rs:580; apps/cli/src/agents.rs:548; apps/cli/src/agents.rs:258
- **Where to find it:** not found in the code. No private setting for an assistant was found. Assistants are markdown files: project scope in .agiworkforce/agents and global scope in the user folder, shown as scope in the list. Searched apps/cli/src/agents.rs for private, visibility and share.

## S52.33 Workspace access.

- **Expected:** A builder can make an assistant available to everyone in their workspace/organization.
- **Code:** done. Evidence moved: apps/cli/src/agents.rs:228 (quoted code not found in the file now); apps/cli/src/agents.rs:289
- **Where to find it:** not found in the code. No workspace or organisation sharing for assistants was found. A project-scope assistant lives in the repository, so others see it only through the repository, and it loads only in a trusted project (trusted_project in apps/cli/src/agents.rs). Searched apps/cli/src/agents.rs for workspace, organization and share; the only hits are in tests.
