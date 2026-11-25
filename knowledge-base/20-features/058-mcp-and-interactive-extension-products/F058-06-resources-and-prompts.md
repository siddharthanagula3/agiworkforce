---
id: "F058-06"
type: "feature"
title: "Resources and prompts"
aliases: ["Resources and prompts", "MCP resources", "MCP prompts", "Select a resource or prompt to attach it to your next chat turn", "Prompt arguments", "Use prompt", "/mcp:<server>:<prompt>", "mcp_context", "S58.09", "S58.10"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S58.09", "S58.10"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:cloud", "mode:local", "SYS-chat-turn-pipeline", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-memory-projects-and-context", "F058-01", "api:GET /api/connectors/[connectorId]/capabilities"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-06 Resources and prompts

Lets a person see a server's resources and prompt templates and use them in chat. On web, picking a resource or a prompt (with arguments) attaches it to the next chat turn; the server fetches it and gives it to the model as untrusted reference text. CLI exposes prompts as slash commands. Mobile has none.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.09](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5809), [S58.10](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5810).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows what a server can supply to read (resources, templates) and its prompt templates. Choosing one stores a selection in the composer; on send the server reads the resource or runs the prompt on the MCP server and adds the text to the model's context inside a fence marked as untrusted (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:133-160; apps/web/lib/connectors/mcp-context-service.ts:1-60).

**Why it exists.** Many servers publish documents and ready-made prompts; without this only tools are usable. [inferred]

**Who uses it.** People using servers that publish documents or templates, such as docs or repository servers. [inferred]

**Problems it solves**

- Attaching a server document to a question without copy and paste.
- Running a server's prompt template with arguments.

**Use cases**

- Click a resource in the web panel to attach it to the next message.
- Pick a prompt with two arguments, fill them in, send.
- CLI: type /mcp:docs:review.
- VS Code: open the server's tools list to see which prompts and resources it has.

## 2. User experience

**Where to find it**

- Web: Settings > Connectors > a connected connector: panel groups 'Resources', 'Templates', 'Prompts' and a separate resource list with heading 'From <connector>' (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:290-345; apps/web/features/chat/components/mcp/McpResourceList.tsx:112-200). Desktop (public) shows the hosted web screen.
- Tauri desktop: no resources or prompts view found (search of apps/desktop/src/features/mcp).
- CLI: terminal interface slash commands '/mcp:<server>:<prompt>' (apps/cli/src/tui/tui_app.rs:4265-4300).
- VS Code: server row action 'Show tools' opens a list with Tools, Prompts and Resources sections, read only (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:670-718).
- Mobile and Chrome: none found.

**Before you start**

- A connected server that publishes resources or prompts.
- Web: capabilities panel loaded; connectors released.
- CLI: server connected in the session; prompts appear after the background attach finishes (apps/cli/src/tui/tui_app.rs:4258-4264).

**Screens and controls**

- Web: click a resource name chip to select it; click a prompt chip; prompts with arguments open a form 'Prompt arguments' with 'Use prompt' and 'Cancel'; hint 'Select a resource or prompt to attach it to your next chat turn.' (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:300-359).
- Composer shows chips 'Prompt: <name>' and 'Resource: <name>' with button labelled 'Remove selected connector context' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5171-5200).
- CLI command hints list arguments as name=<value> and [name=<value>] for optional (apps/cli/src/tui/tui_app.rs:4274-4290).

**Journey**

1. Open the connector detail.
2. Choose a resource or prompt.
3. Fill prompt arguments if asked.
4. See the chip in the composer; up to four resources are kept (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1034).
5. Send the message; the server reads the resource or runs the prompt and adds it to the model context.
6. Remove the chip to cancel.

**What the person sees and gets**

- Web resource list errors: '<connector> did not finish listing what it offers to read, so this list is incomplete. Its tools are unaffected.' and empty text '<connector> has no resources or prompts to attach.' (apps/web/features/chat/components/mcp/McpResourceList.tsx:150-175).
- If context cannot be loaded the request fails with McpContextError (apps/web/lib/connectors/mcp-context-service.ts:27-32); exact user message not traced.

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capabilities route returns resources, resourceTemplates and prompts with arguments (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:98-117).
- Web panel publishes a selection through sessionStorage and a window event; the composer consumes it, de-duplicates resources and keeps four (apps/web/features/connectors/lib/mcp-context-selection.ts:11-25; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1010-1045).
- The composer sends mcpContext with the turn (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1667,3679,3926).
- Server loads the selection through the user's connector handle, clips each item (32,000 characters) and the total (96,000), escapes angle brackets and prefixes a sentinel saying it is reference material, never instructions (apps/web/lib/connectors/mcp-context-service.ts:13-60).
- The chat request processor accepts mcp_context (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:546,3602).
- CLI registers MCP prompts as slash commands with argument hints, re-run after the background attach finishes (apps/cli/src/tui/tui_app.rs:4265-4300).
- CLI agent can read a resource by uri through the manager (apps/cli/src/agent/mod.rs:977; apps/cli/src/mcp/mod.rs:1654-1662,2511-2557).
- VS Code lists tools, prompts and resources for a server (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:679-718).

**Incomplete**

- Templates (resourceTemplates) are listed on web but cannot be selected (no onSelect for the 'Templates' group) (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:322-326).
- CLI has no user-facing browse or attach for resources; only the agent reads them (searched apps/cli/src/lib.rs and repl).
- VS Code lists prompts and resources but cannot run or attach them.

**Present but disconnected or switched off**

- Custom server resources and prompts are dark on web while connectors are coming soon (apps/web/lib/user-connector-tools.ts:2083).

**Not available**

- Mobile: none (only tools used from the catalog).
- Tauri desktop: no resources or prompts UI found in apps/desktop/src/features/mcp.
- Chrome: none.

## 4. Required behaviour

**Established requirements**

- The product discovers a server's resources and lets the user browse or attach them (web, desktop done; mobile, CLI, VS Code missing). (source: brief S58.09)
- Where a server offers prompts, the product lists them and lets the user run one (web, desktop, CLI done; mobile, VS Code missing). (source: brief S58.10)
- Server-supplied text is treated as untrusted reference material, never as instructions. (source: apps/web/lib/connectors/mcp-context-service.ts:12-13 (sentinel text) and the fence import)
- Security behavior fails closed; validate at trust boundaries. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A server with resources lists them under 'Resources'; clicking one adds a chip 'Resource: <name>' to the composer.
2. Selecting a prompt without arguments attaches it immediately; with arguments, a form opens and required fields are required.
3. At most four distinct resources are kept in the composer.
4. Removing the chip removes the context from the next send.
5. Resource text longer than the limit is cut and angle brackets are escaped.
6. A server that failed to list resources shows the incomplete-list message and a retry button.
7. In the CLI, a prompt appears as /mcp:<server>:<prompt> once the server is attached.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief says desktop is done: true for the hosted web app, not for the Tauri build. [inferred]
- VS Code listing counts as discovery but not browse-and-attach, so the requirement is partly met. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make resource templates selectable with a filled URI.
- [proposed] Add a CLI command to attach a resource to a turn.
- [proposed] Show resources and prompts on mobile from the catalog already fetched.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/connectors/[connectorId]/capabilities | `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Supplies resources, templates, prompts. |
| component | ConnectorCapabilitiesPanel | `apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx` | Select resource or prompt and fill arguments. |
| component | McpResourceList | `apps/web/features/chat/components/mcp/McpResourceList.tsx` | Resource list with partial-failure state. |
| hook | useConnectorCapabilities | `apps/web/features/connectors/hooks/use-connector-capabilities.ts` | Catalog fetch and cache. |
| service | mcp-context-selection | `apps/web/features/connectors/lib/mcp-context-selection.ts` | sessionStorage and event bridge from panel to composer. |
| component | ChatComposerNew (mcp context) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Holds selection, shows chips, sends mcpContext. |
| service | mcp-context-service | `apps/web/lib/connectors/mcp-context-service.ts` | Reads resources and runs prompts on the server, fences and clips them. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts mcp_context and loads it into the turn. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends mcp context in the request (file matched by search). |
| schema | ConnectorCapabilityCatalogSchema | `packages/contracts/cloud-contracts/src/connector-capabilities.ts` | Defines resources and prompts shapes. |
| service | register_mcp_prompt_commands | `apps/cli/src/tui/tui_app.rs` | CLI prompt slash commands. |
| service | McpManager list_resources / read_resource | `apps/cli/src/mcp/mod.rs` | CLI resource access used by the agent. |
| service | agent resource read | `apps/cli/src/agent/mod.rs` | Agent reads a resource by server and uri. |
| service | mcp_server_tools | `apps/cli/src/app_server/surfaces.rs` | Returns tools, prompts, resources and warnings to VS Code. |
| component | showMcpServerTools | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code list of tools, prompts, resources. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The panel reads the catalog; the user selects a resource or prompt; the selection is stored in session storage and announced by a window event. | device | apps/web/features/connectors/lib/mcp-context-selection.ts:11-18 |
| The composer merges it into state (four resources at most) and attaches it as mcpContext when sending. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1010-1045,1667 |
| The chat request reaches the server, which resolves the connectors named and loads the context through the user's connector handle. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3602; apps/web/lib/connectors/mcp-context-service.ts:85 |
| The MCP server returns the resource contents or the prompt result. | outside service | apps/web/lib/connectors/mcp-context-service.ts:36-48 (reads text from content blocks) |
| The server clips, escapes and fences the text as untrusted reference material and adds it to the model's context. | our servers | apps/web/lib/connectors/mcp-context-service.ts:13-60 |
| The model answers using that context. | outside service | model providers are selected by the chat pipeline (SYS-chat-turn-pipeline); not traced here |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending selection (prompt name, arguments, resource uris) | browser sessionStorage key agi:mcp-context-pending and composer memory | no | Removed when consumed (apps/web/features/connectors/lib/mcp-context-selection.ts:19-23) |
| Fetched resource text | not stored by this service; added to the turn context (whether the turn is saved with it is not traced) | unknown | unknown |

**Models and providers.** Any model that receives the chat turn gets the fenced context; the code does not restrict by model or provider. Context caps (32,000 per item, 96,000 total characters) apply regardless of model (apps/web/lib/connectors/mcp-context-service.ts:13-14).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in cloud account for web; CLI and VS Code local. |
| Permissions | Resources are read with the user's own connector handle, so only their connected servers are reachable (apps/web/lib/connectors/mcp-context-service.ts:5-8). |
| Subscription | Connectors capability and caps as in F058-02; no separate rule for resources or prompts found. |
| Limits and metering | Four resources per turn in the composer; 32,000 characters per item; 96,000 total (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1034; apps/web/lib/connectors/mcp-context-service.ts:13-14). Token cost of the added context counts as chat usage [inferred]. |
| Feature flags | Release state and kill switch as in F058-01. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI prompts and resources run on the device against local or remote servers. Web: cloud only. Mobile: not available. Whether the Tauri desktop passes resources to local chat: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | 'Asking <connector> what it offers…' and panel spinner. | apps/web/features/chat/components/mcp/McpResourceList.tsx:121-127 |
| error | Error text with 'Try again'. | apps/web/features/chat/components/mcp/McpResourceList.tsx:129-145 |
| partial discovery | Incomplete-list message and retry. | apps/web/features/chat/components/mcp/McpResourceList.tsx:150-175 |
| empty | '<connector> has no resources or prompts to attach.' | apps/web/features/chat/components/mcp/McpResourceList.tsx:177-184 |
| required prompt argument | Input is required in the form. | apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:325 |
| cancel | Cancel closes the form; chip removable. | apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:339-343 |
| storage unavailable | sessionStorage write is not wrapped in try/catch in publish; consume has a parse guard. [inferred risk] | apps/web/features/connectors/lib/mcp-context-selection.ts:11-25 |
| oversized content | Clipped to the limits. | apps/web/lib/connectors/mcp-context-service.ts:57 |
| CLI prompts not yet attached | Commands appear after the background attach. | apps/cli/src/tui/tui_app.rs:4258-4264 |
| offline, timeout, retry | not handled in the code read beyond the retry buttons. | not found in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/mcp-context-service.test.ts`: Context service (contents not read).
- `apps/web/features/chat/components/mcp/__tests__/McpResourceList.test.tsx`: Resource list states (contents not read).
- `apps/web/features/connectors/components/__tests__/ConnectorCapabilitiesPanel.test.tsx`: Panel selection (contents not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.system-assembly-order.test.ts`: Request assembly; matched on mcp context (contents not read).

**Test scenarios**

- **Attach a resource**
  1. Connect a server with a resource.
  2. Open its panel and click the resource.
  3. Ask 'summarize the attached resource' and send.
  - Expected: Chip shown; the answer uses the resource; request carried mcp_context.
- **Prompt with arguments**
  1. Click a prompt that has two arguments.
  2. Fill both and press 'Use prompt'.
  3. Send.
  - Expected: Chip 'Prompt: <name>'; server result is in context.
- **Partial failure**
  1. Use a server whose resource listing times out.
  - Expected: Incomplete-list message; tools still listed; retry works.
- **Four-resource limit**
  1. Select five different resources.
  - Expected: Composer keeps four.
- **CLI prompt command**
  1. Start the terminal interface with a server that has a prompt.
  2. Type /mcp:<server>:<prompt>.
  - Expected: Prompt runs and the command hint shows the argument names.

**Where to look when it fails**

- McpContextError name from mcp-context-service.
- Capabilities route 503 or discoveryErrors entries with capability 'resources' or 'resourceTemplates'.
- Browser sessionStorage key agi:mcp-context-pending.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)
- CLI: [70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md)
- VS Code: [70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **Mobile has no resource or prompt view or attach.** Affects: Mobile. Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:492 (tools only); brief S58.09-S58.10. Work needed: Add UI and a way to attach to a mobile turn.
- **CLI cannot browse or attach resources by the user; only the agent reads them.** Affects: CLI. Evidence: apps/cli/src/agent/mod.rs:977; brief S58.09. Work needed: Add a command to list and attach.
- **VS Code lists resources and prompts but cannot run or attach them; brief says missing.** Affects: VS Code. Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:679-718. Work needed: Add run or attach actions; fix brief.
- **Tauri desktop has no resources or prompts UI; brief says done for desktop (true only for hosted web).** Affects: Tauri desktop. Evidence: apps/desktop/src/features/mcp contains no resource or prompt component. Work needed: Clarify scope.
- **Resource templates cannot be selected on web.** Affects: Web. Evidence: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:322-326. Work needed: Let the user fill a URI template.
- **Custom server resources are unreachable while connectors are coming soon.** Affects: Web, Desktop (hosted). Evidence: apps/web/lib/user-connector-tools.ts:2083. Work needed: Release decision.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:cloud
- mode:local
- SYS-chat-turn-pipeline
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-memory-projects-and-context
- F058-01
- api:GET /api/connectors/[connectorId]/capabilities

## Unknown

- Whether the fetched context is saved with the conversation.
- The user-facing message when McpContextError occurs.
- Whether the CLI prompt command runs the server prompt or only inserts text (handler not read).
- Whether the Tauri desktop chat can use MCP resources.
- Contents of the listed tests.
- Whether the token cost of attached context is metered separately.
