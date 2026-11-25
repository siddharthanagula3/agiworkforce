# Area 52. Custom-assistant builder

41 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S52.01 Assistant manager.
- Should: A user sees their custom assistants in one place and can open, edit or remove each.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:726; apps/cli/src/agents.rs:744; apps/cli/src/agents.rs:767

## S52.02 Create assistant.
- Should: A user can create a new custom assistant from the product.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/agents.rs:396; apps/cli/src/agents.rs:625

## S52.03 Guided conversational builder.
- Should: A user can build an assistant by chatting with a builder that fills in its configuration.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.04 Direct configuration editor.
- Should: A user can edit an assistant's fields (name, instructions, model, tools) in a form or editor inside the product.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:767

## S52.05 Live test/preview pane.
- Should: While configuring an assistant the user can try it in a preview/test chat that reflects unsaved changes.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S52.06 Assistant name.
- Should: An assistant has a user-set name shown wherever it is listed or used.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/agents.rs:464; apps/cli/src/agents.rs:20

## S52.07 Avatar or icon.
- Should: An assistant can carry an avatar, icon or colour that identifies it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.08 Short description.
- Should: An assistant has a short description shown in lists.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/agents.rs:464; apps/cli/src/agents.rs:20

## S52.09 Long description.
- Should: An assistant can carry a longer description separate from its short one.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.10 Instructions.
- Should: An assistant has instructions that shape every conversation it runs.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/tui/tui_app.rs:3663; apps/cli/src/agents.rs:96

## S52.11 Conversation starters.
- Should: An assistant shows starter prompts a user can click to begin a conversation.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.12 Suggested use cases.
- Should: An assistant lists suggested use cases so users know when to pick it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.13 Reference-file upload.
- Should: A user can upload reference files that the assistant can read in every conversation.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.14 Connected reference sources.
- Should: An assistant can be connected to live reference sources (drives, sites, repos) it searches.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.15 Source-refresh behavior.
- Should: The builder sets how and when an assistant's connected sources refresh.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.16 Model preference.
- Should: An assistant can pin a preferred model that is used when it runs.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/tui/tui_app.rs:3663; apps/cli/src/agents.rs:55

## S52.17 Tool selection.
- Should: An assistant's configuration chooses which tools it may use.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/tui/tui_app.rs:3663; apps/cli/src/agents.rs:67

## S52.18 Web-search enablement.
- Should: An assistant's configuration can turn web search on or off for it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/tui/tui_app.rs:3663; apps/cli/src/agents.rs:67

## S52.19 Code-execution enablement.
- Should: An assistant's configuration can turn code execution on or off for it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/tui/tui_app.rs:3663; apps/cli/src/agents.rs:67

## S52.20 Media-generation enablement.
- Should: An assistant's configuration can turn image/media generation on or off for it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.21 Connector selection.
- Should: An assistant's configuration selects which connectors it can use.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:1183; apps/cli/src/agent/mod.rs:905; apps/cli/src/agent/chat.rs:2114

## S52.22 Custom-action schema.
- Should: A builder can define custom actions from an API schema (e.g. OpenAPI) that the assistant can call.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.23 Authentication configuration for actions.
- Should: A builder can configure authentication (API key/OAuth) for an assistant's custom actions.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.24 Tool testing.
- Should: A builder can test an assistant's tools/actions from the builder and see the result.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.25 Sample prompts.
- Should: An assistant carries sample prompts shown to users.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.26 Output-format examples.
- Should: An assistant carries output-format examples it follows.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.27 Draft save.
- Should: A builder can save an assistant as a draft without publishing it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.28 Publish.
- Should: A builder can publish an assistant so others (or they) can use the published version.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.29 Version history.
- Should: An assistant keeps a version history the builder can browse.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.30 Revert published version.
- Should: A builder can revert an assistant to an earlier published version.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.31 Private access.
- Should: An assistant can be kept private to its creator.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:188; apps/cli/src/agents.rs:396; apps/cli/src/agents.rs:376; apps/cli/src/agents.rs:167

## S52.32 Named-user access.
- Should: A builder can share an assistant with named people.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.33 Workspace access.
- Should: A builder can make an assistant available to everyone in their workspace/organization.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/agents.rs:228; apps/cli/src/agents.rs:255

## S52.34 Public listing.
- Should: A builder can list an assistant in a public directory others can browse.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.35 Creator profile.
- Should: A published assistant shows its creator's profile.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.36 Verified publisher information.
- Should: A published assistant shows verified publisher information.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.37 Usage analytics.
- Should: A builder sees usage analytics for their assistant.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.38 Duplicate/fork.
- Should: A user can duplicate or fork an assistant to make their own copy.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.39 Export or migration.
- Should: A user can export an assistant or migrate assistants in from/out to another product.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S52.40 Deprecation notice.
- Should: An assistant can show a deprecation notice to its users.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S52.41 Replacement-assistant link.
- Should: A deprecated assistant can point users to a replacement assistant.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
