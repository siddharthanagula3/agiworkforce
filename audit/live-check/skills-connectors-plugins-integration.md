# Skills, connectors and plugins integration

Status: In progress; Web integrated read and history verified; cross-surface repairs remain
Owner: Shared capabilities + application maintainers
Last verified: 2026-11-01
Purpose: Track the complete integration goal, current implementation evidence, live checks, repairs and exact blockers across exposing application surfaces.
Retention: Delete only when the full integration objective is verified or its remaining requirements have an explicit successor owned by the same goal.

## Acceptance requirements

| Area                | Required verification                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skills              | Discovery; metadata validation; instruction and companion-resource loading; configuration; explicit invocation; automatic selection where supported; execution; creation; editing; importing; sharing; updating; disabling; deletion; instruction precedence; workspace permissions; model and tool capabilities.                          |
| Connectors          | Account selection; authentication; scopes; resource access; connection-state synchronization; refresh; reconnect; disconnect; real configured-account searches and reads; authorized writes to controlled resources; pagination; empty results; expired and revoked credentials; rate limits; uncertain-write reconciliation before retry. |
| Plugins             | Discovery; manifest validation; installation; dependencies; configuration; bundled capability registration; enable/disable; updates; removal; invalid manifests; naming collisions; incompatible versions; partial installation failure; preservation of shared dependencies and connections.                                              |
| Integrated workflow | An installed plugin exposes a skill; the skill invokes an authorized connector; the assistant produces a usable result; the result survives reopening. Cancellation, failure recovery, permission enforcement, revocation and disable/remove behavior must be exercised through running applications.                                      |
| Evidence            | Reproducible steps, runtime evidence, a capability-by-surface matrix, exact blockers and explicit unverified paths. Shared source and passing mocks do not establish live execution on another surface.                                                                                                                                    |

The existing authentication, authorization, routing, entitlements, usage and trust boundaries remain authoritative. The owner's earlier Fly shutdown and Neon restart constraints remain in force. No production user data is changed by this campaign. The owner subsequently delegated choosing a disposable Notion write-test resource. Use a newly created private QA page; do not modify existing workspace content or broaden sharing.

## Current baseline

`50c73df51db8fae99cb858b08af368f57ba3961c` is on main and verified serving the web release. Its exact JS job and normal pre-push chain passed. Earlier verified coverage is retained in [the chat/integration tracker](chat-rendering-2026-10-30.md) and its release evidence; it is not treated as proof of the broader objective.

Current source separates plugin installation, skill resolution and connector authorization. Relevant owners include:

- `packages/contracts/types/src/plugins.ts` and `capabilities.ts`.
- `packages/contracts/cloud-contracts/src/plugin-marketplaces.ts`.
- `apps/web/features/plugins/server/directory/` and `lib/services/plugin-owned-source-service.ts`.
- `apps/web/lib/connectors/plugin-connectors.ts` and `lib/user-connector-tools.ts`.
- The completion route's request processor, tool-schema loader, tool loop and provider adapters.

Coarse capability grants do not prove a lifecycle operation is implemented or reachable. The public Electron desktop hosts the web app; retained Tauri behavior is a separate internal implementation and cannot substitute for a public Desktop check.

## Capability-by-surface verification matrix

V means verified through the running application for the stated case; P means only part of the row is verified; F means the stated case failed; B means an identified external dependency blocks the live check; U means unverified. A future N/A cell requires current source evidence that the operation is not exposed or advertised there.

| Capability                                                                             | Web                                                                                      | Public Desktop | Mobile | Chrome | VS Code | CLI | Retained Tauri |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ------ | ------ | ------- | --- | -------------- |
| Skill discovery and explicit invocation                                                | V: authored plugin skill                                                                 | U              | U      | U      | U       | U   | U              |
| Skill creation and metadata acceptance                                                 | P: one valid plugin-owned draft                                                          | U              | U      | U      | U       | U   | U              |
| Skill instructions and companion resources                                             | P: instructions loaded; resources unverified                                             | U              | U      | U      | U       | U   | U              |
| Skill configuration and automatic selection                                            | U                                                                                        | U              | U      | U      | U       | U   | U              |
| Skill edit/import/share/update/disable/delete                                          | U                                                                                        | U              | U      | U      | U       | U   | U              |
| Skill precedence, workspace and model/tool restrictions                                | U: earlier unit coverage requires requirement mapping                                    | U              | U      | U      | U       | U   | U              |
| Connector account/auth/scopes/sync/refresh/reconnect/disconnect                        | P: earlier Notion evidence retained; lifecycle retest pending                            | U              | U      | U      | U       | U   | U              |
| Connector reads/search/pagination/empty/rate-limit behavior                            | P: plugin-mediated account-metadata read completed; other cases unverified               | U              | U      | U      | U       | U   | U              |
| Connector writes and uncertain-outcome recovery                                        | U: private QA page creation and controlled writes authorized; not yet executed           | U              | U      | U      | U       | U   | U              |
| Plugin discovery, valid manifest and installation                                      | V: one authored plugin                                                                   | U              | U      | U      | U       | U   | U              |
| Plugin dependencies/configuration/updates/collisions/invalid manifests/partial failure | P: authored edit saves and registers a second skill; remaining cases unverified          | U              | U      | U      | U       | U   | U              |
| Plugin disable/remove and shared dependency/connection preservation                    | P: disable rejects an already-selected skill; removal/shared ownership unverified        | U              | U      | U      | U       | U   | U              |
| Plugin → skill → connector → persisted usable result                                   | V: authored plugin → selected skill → two approved Notion reads → native table, reopened | U              | U      | U      | U       | U   | U              |
| Cancellation, recovery, permission refusal and revocation                              | P: re-enable/retry reaches approval; Deny returns honest refusal; other cases unverified | U              | U      | U      | U       | U   | U              |

## Web case: authored plugin and Notion account metadata

The local server uses `agiworkforce_dev` on loopback; inherited database URL variables were absent. The existing approved OpenAI and connector-encryption credentials are loaded into server memory from the primary checkout, not copied into a file. No production database is used for this case.

1. Open `/apps`, which resolves to Plugins in Settings.
2. Verify the initial No plugins state.
3. Add → Create a plugin. Create `Integration QA 2026-11-01`, containing `integration-notion-account-check` with the definition saved in `readonly-plugin-draft.json`.
4. Verify the Plugin created result and its one exposed skill. The installed table and slash menu update without a page reload.
5. Start a new chat, select the installed skill from the slash menu, and use the existing GPT-6 Luna selection.
6. Submit: `Use the selected integration-notion-account-check skill to verify the existing Notion connection with its get-self read operation. Return a compact table containing execution status and the names of returned fields only; do not include personal values or modify any content. No public web search or image generation.`
7. Inspect actual activity and persisted response in conversation `51adf6dc-30b1-4f3a-917b-af0375e52a03`.

Observed result: the skill's exact stored instructions loaded. Seven connector-schema loader calls followed. The first reported loading Notion's get-self schema among its matches. No Notion execution appears in the activity. The final native table says the operation was not run because it was unavailable on that turn. The response is not accepted as a successful integrated workflow.

An instrumented replay in `5fd8e5ea-2682-4e3e-b1e1-5a4f01d331ad` reproduced the failure. All eight provider frames offered get-self, but the system tool list omitted it and the schema loader. The request processor assembled that list before connected tools were loaded; the tool loop expanded the provider schemas without refreshing the list. The versioned reality instruction told the model not to claim an unlisted capability. This was a contradictory request, rather than a missing get-self schema or an exhausted tool budget.

The repair separates a server-owned, versioned inventory slot from the stable prompt and refreshes its provider-only view after final tool selection. It preserves the captured prompt version, published default prompt bytes, cache boundary, caller-owned tool descriptions and checkpoint source. Client messages cannot mint the private slot. Raw API requests remain caller-owned. The workflow input contract explicitly validates the private metadata needed for durable continuation.

The unchanged prompt then completed in `ef235072-1b8b-423d-ab65-0428780cc757`: skill load, schema load, one-time approval for Notion get-tool-access, one-time approval for get-self, then a native table containing Completed and the field names workspace and user. No permanent permission was saved, no personal result values were requested, and no external content was modified. All four provider frames named every offered tool in the system inventory. Refreshing and waiting for history hydration preserved both the table and the completed activity. An earlier immediate observation happened before hydration and is not counted as a persistence defect.

Evidence is under `integrated-capabilities-2026-11-01` in the task's visualization directory. `web-integrated-read-acceptance.json` records the assertions and case IDs; before/after, approval and reopened screenshots show the actual UI. The temporary metadata-only provider probe has two selftests for unchanged fetch arguments and absent credential/message canaries. Its actual provider observations are recorded separately from those selftests.

Disabling the plugin in a second settings tab rejected an already-selected draft in `1afd812c-4652-4f49-8a43-4d5050ad1087` with “The selected skill is not available,” before any additional model request (provider frame count stayed at 12). Re-enabling and retrying the same turn loaded the skill again and reached the get-self approval. Choosing Deny once yielded a native table reporting that permission was denied and no returned fields. `web-disabled-skill-acceptance.json` and its three screenshots record these states. This does not verify connector revocation or all cancellation paths.

Editing the same authored plugin preserved its read-only skill, changed its description, and added `integration-notion-page-check`. The UI reported “2 skills are now available in chat,” and a fresh conversation found the new skill immediately in its slash menu. `plugin-update-saved.png` and `controlled-write-skill-draft.json` preserve this case. The controlled write run used conversation `894d710e-f3d9-48b2-8a56-1683de9870ee`. It loaded the new skill and completed approved Notion capability discovery. A broad list of 100 existing private pages was declined by the operator to keep data collection narrow; that refusal is not counted as a product defect. Further tool discovery did not supply create/update operations, and the assistant honestly reported that no page was created or changed. All seven provider frames after the assembly relocation named every offered tool in the system inventory. `web-controlled-write-acceptance.json` and `controlled-write-tools-unavailable.png` record the remaining gap; its source/gate diagnosis is still open.

## Cross-surface source findings awaiting repairs and live checks

The read-only Mobile/Chrome/VS Code packet records six separate current-source mismatches: Mobile public-directory installation uses the registry-only endpoint; owned plugin reinstallation does not restore its MCP registrations; Mobile offline replay drops selected skill context; Mobile previews and CLI/VS Code sync consume a companion-file JSON envelope as file content; imported plugin conversion drops skill metadata; CLI account sync drops dependency/version frontmatter. Source reachability guards and exact references are in `mobile-chrome-vscode-audit.md` and its matrix JSON in the same evidence directory. These findings are not native live-QA results and do not establish that every other exposed path works.

## Live access and remaining investigation

- The owner answered the resource-selection request with “you choose.” A new private QA page is authorized for controlled write tests. Its actual creation and resulting page identity remain pending.
- Other selected provider grants, native/extension/CLI execution and every remaining matrix cell need current-source inventory and proportionate runtime checks.
- Plugin connector registration currently uses an `installed_by_plugin` owner key and ignores creation conflicts. Shared ownership and namespace collisions need a concrete regression before a defect or repair is claimed.
- Three earlier Notion schemas were refused by existing depth/key budgets. Their support remains incomplete; no budget has been increased or validator weakened.
- The local diagnostic restart completed after the original server's terminal status and free port were verified. A browser tab caught the temporary disconnect; its error page does not establish a new server failure.
