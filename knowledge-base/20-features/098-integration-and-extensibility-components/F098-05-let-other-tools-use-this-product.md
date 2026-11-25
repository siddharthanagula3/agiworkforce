---
id: "F098-05"
type: "feature"
title: "Let other tools use this product"
aliases: ["agi mcp-server", "MCP server host", "CLI as MCP server", "Command::McpServer"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.13"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-connectors-plugins-and-skills", "surface:cli", "mode:local", "file:apps/cli/src/app_server.rs", "file:crates/agiworkforce-mcp/src/server.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-05 Let other tools use this product

Runs the CLI as an MCP server on standard input and output, so another AI client can list and call the CLI's local file, search, shell, git and language-server tools. It lists a fixed set of tools, refuses any tool not listed, and needs no sign-in or model.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.13](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9813).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** 'agi mcp-server' reads one JSON line at a time, answers initialize, ping, server/discover, tools/list and tools/call, and runs each call through the CLI's normal tool executor with approval prompts refused.

**Why it exists.** Lets other MCP clients use the CLI's tools on the same machine (S98.13), like Claude's own serve mode.

**Who uses it.** Developers who connect an editor or agent that speaks MCP to the CLI.

**Problems it solves**

- Reusing one tool set from several clients.
- Keeping model-needing tools out of a tool-only server.

**Use cases**

- An editor lists the CLI's read_file and grep_files tools.
- An agent runs git tools through the CLI.
- A client discovers tools using the newer stateless protocol or the older initialize handshake.

## 2. User experience

**Where to find it**

- CLI: 'agi mcp-server' (apps/cli/src/lib.rs:842-849, 6630; docs/standards/cli-command-surface.md row 'mcp-server').
- Other apps: not available (CLI only).

**Before you start**

- The CLI installed; a client that speaks MCP over stdio.
- The client confirms each call (lib.rs:842-849).

**Screens and controls**

- No screen. A command line command and the protocol.

**Journey**

1. 1. Configure the client to start 'agi mcp-server' as a stdio server.
2. 2. The client sends initialize or server/discover.
3. 3. The client sends tools/list and sees the fixed tools.
4. 4. The client sends tools/call with a tool name and arguments.
5. 5. The CLI runs the tool in its working directory and returns text with an isError flag.

**What the person sees and gets**

- JSON lines on stdout; nothing else is written there (app_server.rs:132-135).
- Unknown tool error: "Tool '<name>' is not advertised by this MCP server." code -32602 (app_server.rs:188-196).
- Unknown method error: 'Unknown: <method>' (app_server.rs:262-266).

**Settings**

- None found. Workspace root is the current directory; workspace policy and trust gate apply through the normal executor (lib.rs:842-849; app_server.rs:213-214).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Starts on stdio and claims stdout for the protocol (app_server.rs:132-135).
- Lists a fixed set: read_file, read_many_files, write_file, edit_file, multiedit, apply_patch, notebook_edit, resolve_conflict, run_command, list_directory, search_files, grep_files, glob, list_worktrees, five LSP tools, powershell on Windows, and the git tools (app_server.rs:105-176).
- Answers initialize, ping, server/discover, subscriptions/listen, tools/list (cached one hour, public) and tools/call (app_server.rs:232-300).
- Refuses a tool that is not advertised (app_server.rs:188-196).
- Runs the call with approval callback set to deny and privacy mode Local (app_server.rs:197-215).
- A unit test checks that an unwired exec tool is not listed and that calling it returns an invalid-params error (app_server.rs:319-343).

**Incomplete**

- Because the approval callback denies and confirmation flags are false, how tools that normally need approval (write, shell) behave here is not shown by the test; the code comment says the client confirms each call, but the executor's handling of a denied approval was not read.
- Only tools are served; no resources or prompts (capabilities are tools only, app_server.rs:243).

**Present but disconnected or switched off**

- An exec tool that would need a model is deliberately not advertised (app_server.rs:316-343).

**Not available**

- Web, Mobile, VS Code, Chrome and Desktop do not host an MCP server (brief: CLI only).
- No authentication on the stdio channel; access is whoever can start the process [inferred].

## 4. Required behaviour

**Established requirements**

- The product can run as an MCP server that exposes its own tools to other clients (S98.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.13)
- A tool that is not advertised cannot be called. (source: apps/cli/src/app_server.rs:188-196, 319-343)
- mcp-server is a documented CLI command: 'Run as an MCP stdio server.' (source: doc: docs/standards/cli-command-surface.md)

**Acceptance criteria**

1. tools/list returns only the fixed core tools plus git tools.
2. tools/call for a name not in the list returns error -32602.
3. A malformed JSON line returns a parse error, not a crash.
4. A notification without an id gets no reply.
5. Stdout carries only JSON lines.
6. A file read through read_file returns its text with isError false.
7. Closing stdin ends the process.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Tools run with the permissions of the user who started the process.
- [inferred] No AGI account or subscription is needed because no model or cloud call is made.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add integration tests that start the binary and run initialize, tools/list and a read-only call.
- [proposed] Document what happens to a write tool when the approval callback denies.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | agi mcp-server | `apps/cli/src/lib.rs` | Command::McpServer (line 849) dispatch at line 6630. |
| service | run_mcp_server | `apps/cli/src/app_server.rs` | Stdio loop (line 132). |
| service | mcp_server_replies | `apps/cli/src/app_server.rs` | Method router (line 232). |
| service | mcp_server_tools | `apps/cli/src/app_server.rs` | Builds the advertised tool list (line 165). |
| service | call_cli_tool | `apps/cli/src/app_server.rs` | Checks the tool is advertised, then runs the executor (line 188). |
| config | MCP_SERVER_CORE_TOOLS | `apps/cli/src/app_server.rs` | Fixed list of core tool names (line 105). |
| service | Tool catalog | apps/cli/src/runtime/tool_catalog.rs (not found) (not found) | built_in_tool_definitions and git_tool_definitions (named in app_server.rs:166). |
| service | Tool executor | apps/cli/src/tools (not found) (not found) | execute_tool_with_opts runs the call (app_server.rs:214). |
| service | MCP server helpers | `crates/agiworkforce-mcp/src/server.rs` | initialize_result, discover_result, classify_request, success, cacheable. |
| service | MCP protocol constants | `crates/agiworkforce-mcp/src/protocol.rs` | Error codes, protocol versions. |
| test | mcp_server_does_not_advertise_unwired_exec_tool | `apps/cli/src/app_server.rs` | Unit test at line 319-343. |
| config | CLI command surface doc | `docs/standards/cli-command-surface.md` | Lists the mcp-server command. |
| service | Stdout claim | `apps/cli/src/output.rs` | claim_stdout_for_protocol (used at app_server.rs:133). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client starts the CLI process and writes a JSON line. | device | app_server.rs:132-150 |
| Server classifies the request era and answers initialize, discover, list or call. | device | app_server.rs:232-300 |
| For tools/call the CLI checks the name against the advertised list, then runs the tool in the current directory. | device | app_server.rs:188-215 |
| Result text and isError are written back as one JSON line. | device | app_server.rs:140-146, 215-225 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tool results (file text, command output). | Not stored by the server; returned to the client. | No. | Whatever the client keeps. |

**Models and providers.** No model or provider is used by the server. The connected client has its own model, which is outside this product.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No AGI sign-in needed by this code path (not checked in app_server.rs). |
| Permissions | Approvals refused; workspace policy and trust gate apply through the executor per the command doc; the client is expected to confirm (lib.rs:842-849). Tools run as the local user. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code; tools/list is cached one hour by the client (app_server.rs:103). |
| Feature flags | Windows adds powershell to the list (app_server.rs:165-170). |
| Model compatibility | Not applicable; no model used. |
| Provider restrictions | none found in the code. |
| Local mode | Fully local: runs on the device with no network call in this code path. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Blank lines are skipped; frames without an id are ignored. | app_server.rs:140-147, 234-237 |
| Error | Parse error -32700 for bad JSON; invalid params for an unadvertised tool; method not found for unknown methods. | app_server.rs:232-266 |
| Tool failure | isError true with the error text. | app_server.rs:215-225 |
| Cancel and shutdown | End of stdin ends the loop; the stdio app server handles SIGTERM separately. | app_server.rs:136-139; 60-94 |
| Retry, timeout, offline | not handled in the code for this server (tools run to completion; no network). | searched app_server.rs:132-300 |
| Accessibility | Not applicable; no interface. | command line protocol |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/app_server.rs`: Unit test mcp_server_does_not_advertise_unwired_exec_tool (line 319): initialize, tools/list without the exec tool, and invalid-params error for calling it.

**Test scenarios**

- **List tools**
  1. Pipe an initialize line and a tools/list line into 'agi mcp-server'.
  - Expected: Second reply lists the fixed tool names.
- **Unlisted tool**
  1. Send tools/call with name 'agiworkforce_exec'.
  - Expected: Error code -32602 and the 'not advertised' text.
- **Read a file**
  1. Send tools/call for read_file on a file in the working directory.
  - Expected: Text content, isError false.
- **Write refused or allowed**
  1. Send tools/call for write_file.
  - Expected: Record what happens; the code does not state it.
- **Modern discover**
  1. Send server/discover with modern metadata.
  - Expected: Discover result with tools capability.

**Where to look when it fails**

- No logs on stdout by design. Errors come as JSON-RPC error objects.
- Run with the unit test name to check the tool list contract.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Only one unit test; no process-level test.** Affects: CLI users of mcp-server.. Evidence: apps/cli/tests/app_server_stdio.rs targets the developer session server, not this command.. Work needed: Add a spawn-the-binary test.
- **Behaviour of write and shell tools under a denying approval callback is undocumented.** Affects: Clients that call write_file or run_command.. Evidence: app_server.rs:197-215.. Work needed: Trace the executor and document or test.
- **Server exposes no resources or prompts.** Affects: MCP clients expecting them.. Evidence: capabilities is tools only (app_server.rs:243).. Work needed: Decide if needed.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-connectors-plugins-and-skills
- surface:cli
- mode:local
- file:apps/cli/src/app_server.rs
- file:crates/agiworkforce-mcp/src/server.rs

## Unknown

- How the executor treats a denied approval for write and shell tools.
- Whether any other app embeds this server.
- Whether an end-to-end test spawns the binary elsewhere in the repository.
- Whether a documented client setup page exists for end users.
