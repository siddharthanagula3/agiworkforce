# Skills, connectors and plugins integration

Status: In progress; controlled Notion create/read/edit/read and reopening verified; other connector lifecycles remain
Owner: Shared capabilities + application maintainers
Last verified: 2026-11-02
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

`1950ccaaa30f61eafcd6fe724f9550591b40e94a` is the verified production release, deployment `dpl_2erMUQGzwLEynFpqDgFk37sJxMQ1`. Its exact JavaScript job `125046576402` passed before staging and promotion. The protected canary, canonical site and API checks passed; the canonical version identifies that commit and deployment. The development probe returns HTTP 404, authentication remains enforced, and Neon is at migration 391 with nothing pending or drifted. `production-release-1950.json` records the release and rollback identity. The MCP admission repair described below is pushed to main as `5f215aabba2a4d6e78b4b84760a323f0590655e7`; it is not yet deployed. Its full isolated pre-push chain passed, including the required security-claim proof index. Earlier verified coverage remains in [the chat/integration tracker](chat-rendering-2026-10-30.md); it does not establish the broader objective.

Current source separates plugin installation, skill resolution and connector authorization. Relevant owners include:

- `packages/contracts/types/src/plugins.ts` and `capabilities.ts`.
- `packages/contracts/cloud-contracts/src/plugin-marketplaces.ts`.
- `apps/web/features/plugins/server/directory/` and `lib/services/plugin-owned-source-service.ts`.
- `apps/web/lib/connectors/plugin-connectors.ts` and `lib/user-connector-tools.ts`.
- The completion route's request processor, tool-schema loader, tool loop and provider adapters.

Coarse capability grants do not prove a lifecycle operation is implemented or reachable. The public Electron desktop hosts the web app; retained Tauri behavior is a separate internal implementation and cannot substitute for a public Desktop check.

## Capability-by-surface verification matrix

V means verified through the running application for the stated case; P means only part of the row is verified; F means the stated case failed; B means an identified external dependency blocks the live check; U means unverified. A future N/A cell requires current source evidence that the operation is not exposed or advertised there.

| Capability                                                                             | Web                                                                                      | Public Desktop | Mobile                                                              | Chrome | VS Code                                                    | CLI                                                               | Retained Tauri |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------- | ----------------------------------------------------------------- | -------------- |
| Skill discovery and explicit invocation                                                | V: authored plugin skill                                                                 | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Skill creation and metadata acceptance                                                 | P: one valid plugin-owned draft                                                          | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Skill instructions and companion resources                                             | P: instructions loaded; resources unverified                                             | U              | P: exact previews and native-component tests; device run unverified | U      | P: same CLI sync engine repaired; extension run unverified | P: real loopback HTTP and filesystem sync; account run unverified | U              |
| Skill configuration and automatic selection                                            | U                                                                                        | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Skill edit/import/share/update/disable/delete                                          | U                                                                                        | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Skill precedence, workspace and model/tool restrictions                                | U: earlier unit coverage requires requirement mapping                                    | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Connector account/auth/scopes/sync/refresh/reconnect/disconnect                        | P: earlier Notion evidence retained; lifecycle retest pending                            | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Connector reads/search/pagination/empty/rate-limit behavior                            | P: plugin-mediated account-metadata read completed; other cases unverified               | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Connector writes and uncertain-outcome recovery                                        | P: private Notion create/read/edit/read verified; uncertain-write recovery unverified    | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Plugin discovery, valid manifest and installation                                      | V: one authored plugin                                                                   | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Plugin dependencies/configuration/updates/collisions/invalid manifests/partial failure | P: authored edit saves and registers a second skill; remaining cases unverified          | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Plugin disable/remove and shared dependency/connection preservation                    | P: disable rejects an already-selected skill; removal/shared ownership unverified        | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Plugin → skill → connector → persisted usable result                                   | V: authored plugin → selected skill → two approved Notion reads → native table, reopened | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |
| Cancellation, recovery, permission refusal and revocation                              | P: re-enable/retry reaches approval; Deny returns honest refusal; other cases unverified | U              | U                                                                   | U      | U                                                          | U                                                                 | U              |

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

The initial read-only Mobile/Chrome/VS Code packet identified six separate source mismatches: Mobile public-directory installation uses the registry-only endpoint; owned plugin reinstallation does not restore its MCP registrations; Mobile offline replay drops selected skill context; Mobile previews and CLI/VS Code sync consume a companion-file JSON envelope as file content; imported plugin conversion drops skill metadata; CLI account sync drops dependency/version frontmatter. Source reachability guards and exact references are in `mobile-chrome-vscode-audit.md` and its matrix JSON in the same evidence directory. The companion-response repair below addresses one finding; the other five remain open. The packet is not native live-QA evidence and does not establish that every other exposed path works.

## Companion-resource response repair

Mobile consumed the preview endpoint’s entire JSON response as text. CLI account sync consumed that same preview representation as file bytes, which also made binary resources fail with HTTP 415. The shared preview contract now identifies the selectable text explicitly; Mobile unwraps and validates it, preserves whitespace and Unicode, and rejects mismatched paths or malformed responses. CLI sync requests the existing raw download representation. VS Code uses that same CLI account-sync engine; its extension-level execution still needs a live check.

The Mobile regression first failed nine exact-content/invalid-envelope cases with the original service. The CLI regression first failed against a loopback HTTP server that implements the real preview/download distinction, then passed after requesting raw bytes. It writes and reads both a spaced-path text file and a binary resource containing non-UTF-8 bytes through the actual sync functions. The cloud suite passed 127 tests; one pre-existing test remains ignored because it touches the real OS credential store. Mobile service/detail tests passed 35 cases, and preview-contract fixtures passed 12 cases. Web producer tests, typechecking and final hygiene receipts are recorded with the candidate’s evidence, not inferred from the fixture passes. Device and configured-account execution are not claimed by these automated checks.

The Notion capability probe separately confirms 65 tools after the shared MCP gate, including page creation and update. Both are then refused by the web-side eight-level schema check. Its schema-node counting and the shared 16-level/512-key/64-reference admission boundary require investigation without raising budgets or removing poisoning protection. The three shared-gate rejections concern comment creation and two query tools; they do not explain the page-operation refusals.

## Owner-reported offline-eval and Priority CI failures

The owner queued these repairs after the current integration milestone. Both failures were verified against commit `43c6bccaa3903e5b504c1f514ab435f584af53ad`: offline run `41326541833`, job `124907568366`; Priority run `41326541863`, job `124907566985`. The Priority L1 tests passed. Its subsequent whole-repository coverage step failed because the same offline reference case failed; aggregate line coverage was 79.69% against the unchanged 75% floor.

The handwritten `chat-prompt/what-can-you-do-pro` answer omitted connected apps after the ordinary-account selective-connector policy changed. This is an explicitly synthetic reference (`source: reference`, no model key, cost or latency), rather than a live model measurement. Its one answer now describes supported connected apps subject to connection and required approval. Corpus checks, thresholds, request fingerprints and measured recordings were not edited.

The original suites test reproduced the failure. The corrected full offline harness and the formerly failing coverage project each passed 329 tests with three pre-existing skips; the project measured 88.43% line coverage. All remaining offline workflow checks passed, including replay, prompt coverage, PII scanning, baseline auditing and measurement integrity. The new offline CI run `41346195200` passed. Priority run `41346195158`, job `124966418160`, then passed its L1 tests, full coverage, boundaries and failure guards. Its optional Codecov upload was skipped; the coverage calculation and evidence preservation succeeded. The entire 102-minute repository coverage run was not repeated locally. Both reported failures are now green on the deployed commit. The JS job remains the owner’s production gate and passed for that commit. `deferred-ci-repair-verification.json` and the preserved owner screenshot record the case.

## Mobile offline skill selection

This repair is on main at `5097a76472b00312b132cd674477477a1481c70a`; its complete pre-push chain passed. The hosted release remains the separately verified production baseline above. No native app was published.

The chat handler queued an offline Cloud message before reading the selected skill. The persisted queue schema omitted the selection, and the reconnect handler did not forward it. The queue now retains the selected skill with the message's account provenance and model; replay forwards that snapshot. Legacy entries without a selection remain valid. Corrupt skill metadata and Local entries containing an account skill are refused, and an inactive account cannot bypass validation by matching a previously queued duplicate.

The regression first failed 12 cases against the original implementation. The repaired queue, reconnect hook, network-state and account-teardown suites passed 61 tests, including restart restoration, offline-to-online replay, distinct skill/model choices and account isolation. Both Mobile TypeScript projects passed. The teardown fixture now initializes the real catalogue/model dependencies and asserts that normal cleanup emits no warning. These are automated service and hook checks; actual iOS/Android queue interaction remains unverified.

## Connector-resource refusal and presentation check

An independent local resource request refused public web search in a list of prohibited actions. The shared refusal parser recognized bare search phrases but did not recognize the qualifier in “use public web search.” This incorrectly required native web search. The parser now recognizes qualified public web, internet and online search refusals without treating a separate positive search instruction as refused. The original shared and server regressions failed before the change; the shared search suite and server search/dispatch suites pass after it.

The unchanged prompt in a fresh chat (`c741b03c-cf2a-440c-bf11-d038f70d689a`) offered zero web-search, URL-fetch or image tools in eight provider frames. The attached resource reached the provider as fenced untrusted context; every offered tool was present in the system inventory. A subsequently approved `notion-fetch` call read only `notion://docs/notion-flavored-markdown-spec`; the unrelated account read was denied and did not execute. The model also made two failed skill-resource attempts before recovering; this does not establish reliable automatic skill selection. No external content was written.

The answer and attached resource survived refresh. Copy message preserved all 458 characters of the answer, but the displayed table dropped the end of a cell containing an unescaped pipe in inline code. The saved generated source is malformed for GFM tables: the Markdown AST retains an extra cell and HTML conversion discards it. This was a loss-of-content fallback gap, not confirmed incorrect CSS or a failure to parse valid GFM. `web-resource-read-acceptance.json` records the actual calls, refusal, source and screenshots.

## Lossless fallback for generated tables

The existing remark pipeline now identifies table rows with more cells than their header. It renders that table's original source through the existing Markdown code surface before HTML conversion can drop the extra cells. Valid tables, including escaped inline pipes and short rows, keep their normal presentation. The source fallback does not attempt to infer a different column structure or claim that invalid Markdown is a successfully rendered native table.

Copy and expand remain available. A synthetic source block has no real code fence to edit, so it carries a read-only marker through the existing sanitizer and clears only its inherited code-editor callback. The sanitizer accepts only that literal marker on code elements; HTML execution and link protocols are unchanged. Real Markdown code fences retain their editor.

Regressions reproduced the original lost-cell and copy failure, then passed after the change. A separate regression caught the unsupported editor control and verified its removal while keeping normal code editing. The final 11 selected renderer suites passed 270 tests, including math, code copying, functional blocks, streaming, fence edit identity, block settlement, parse cost and sanitization. The shared renderer typecheck and scoped lint passed. The Web typecheck receipt is recorded separately with the candidate.

The same saved chat was reopened without another model call. Its fallback copied all 458 characters exactly in both themes; the original table-copy result had dropped the final rule. Expand and Escape worked. Keyboard focus reached the code area and Right scrolled it horizontally; the page stayed at its 1280-pixel viewport width. The QA account's original dark theme and clipboard were restored. Narrower viewport checks and native application runs are not established by this desktop-browser case. `table-fallback-verification.json` records source hashes, before/after screenshots and these limits.

## Downloadable skill entry metadata on CLI sync

CLI account sync reconstructed every `SKILL.md` from the body endpoint, dropping the original frontmatter. For skills the existing API marks downloadable, it now reads the original entry through the same authenticated raw-file representation used for companions. The downloaded text is preserved exactly and is rejected if empty, over the existing file limit, or invalid UTF-8. Authored skills remain on their existing body path and do not require an original-file endpoint. There is no permissive fallback after a failed original-entry request.

The real loopback HTTP/filesystem regression failed with the prior implementation, then passed with the original entry, version, explicit-only selection flag, required tools, environment and connector names intact. A separate loopback case covers an authored skill with no entry-file endpoint. The full CLI cloud suite passed 131 tests; its existing OS-credential-store test remains ignored. CLI Clippy passed with warnings and unsafe code denied. The first exact-name test command selected zero tests and is not evidence; the corrected fully matched red/green runs each executed the intended test.

This CLI repair covers preservation of downloadable bundled entries. It does not establish live account sync, VS Code extension execution, complete native support for every optional frontmatter field or authored-skill metadata. The separate imported-plugin correction is recorded below; its running-UI acceptance remains open.

Automatic approval review initially rejected broader schema admission. The later immutable four-file proposal was tested off-tree, explicitly approved by the owner, and then applied unchanged. Its scope and live verification are recorded below. The settings panel inspects tool parameters and attaches resources/prompts to chat; it does not provide a manual tool runner.

## Imported plugin skill metadata

The imported-plugin path now retains parsed frontmatter, the declared version and the hash of the original source file through its cache and runtime conversion. It uses the shared Skill metadata reader rather than reconstructing empty metadata in Web. Trusted installation and workspace labels override document-supplied labels; tool authorization remains with the existing runtime owner.

The installed-skill cache has a new namespace and refuses structurally incomplete records. The regression tests reproduce missing requirements, unchanged identity after header edits and stale cache replay on the original implementation. They also exercise dependency enforcement after a cache round trip. No schema migration, production data deletion or connector grant change is required. Authored-skill metadata, CLI synchronization of non-downloadable plugin entries and running-UI import/refresh acceptance remain separate open checks.

## Subsequent JavaScript release gate

Commit `594d19a4aff5afb8c97d0b1ce41ab4b4eff555f9` passed the complete shared-chat suite locally: 2,604 tests in 221 files. Its push run `41360279698`, JavaScript job `125009089534`, failed one SCIM route test after 37,427 other Web tests passed. The failing test exceeded the unchanged five-second limit while comparing a page with 25 separately authenticated detail reads. Each read performs the real Argon2 verification. The entire original SCIM file passed its 47 tests in isolation, so this is a resource-sensitive test boundary rather than established broken provisioning behavior.

The full-page query-count and tenant assertions remain together. All 25 detail comparisons now run as independently initialized cases with real authentication; none were sampled out. There is no timeout increase, cryptographic cost change, auth mock, retry or skip. The revised file passed 72 tests locally. The reported offline-eval and Priority failures remain fixed on the current production release. The repaired exact JavaScript job `125046576402` subsequently passed, and release `1950ccaaa30f61eafcd6fe724f9550591b40e94a` was staged, promoted and verified. Rust and Priority jobs were not used as additional deployment prerequisites.

## Controlled Notion write and schema admission

The real provider catalog contains 68 definitions. The unchanged shared validator admits 65. Web inspection previously admitted 57 because property maps and keyword containers counted as nested schema definitions. The owner approved the exact proposal with SHA-256 `7c8682f32780db95a451d77d3685e3acdda7d083abe9e86115121a8b1f5ee0dc`; it was applied only after that approval. Web now admits 64 definitions. Calendar-event updates still exceed eight schema-definition levels, and the three shared-validator refusals remain. No raw-depth, property, key, reference or description budget was increased. Original schemas retain their identity; authentication, scopes and per-tool approval enforcement are unchanged. Descriptive schema annotations now also pass the existing poisoning and length checks.

Off-tree validation covered the 12 original guards, 31 proposed regressions, 23 adversarial/boundary checks and 5,000 deterministic schemas checked against independent JSON Schema tooling. After application, 372 Web tests in 32 affected connector/security/tool-loop files and 106 shared MCP tests passed. Five transport test doubles initially omitted the newly used validator; they now preserve the real exports while stubbing transport. Their original assertions remain. Web/shared MCP typechecks, formatting, lint and the mock-export guard passed before the final test-double additions; the expanded checks are rerun with the staged change before commit.

The ordinary Chat surface completed conversation `74bbe45d-381e-4c9d-b9cb-e4ad5875e84f` against the real authorized Notion connection. Exactly one private draft, `AGI Integration QA 2026-11-01 run alpha`, was created with ID `40c6ce1b-a403-815f-8e8a-fab99926ef34`. The returned ID was fetched, its `QA marker: started` content inspected, its content updated, and the same ID fetched again with `QA marker: completed`. The real Notion browser page independently shows the completed marker under Private. The chat result survives reload. The response used nine provider frames; the recorded offered tool set contains no public web-search or image-generation tool. The five remote operations were a formatting-resource read, creation, initial page read, update and final read. Three connector-discovery loads are separate local operations. Existing private workspace pages were not listed or edited.

Evidence lives in `integrated-capabilities-2026-11-01`: `notion-private-create-approval.png`, `notion-private-edit-readback.txt`, `notion-private-edit-readback.png`, `notion-private-lifecycle-complete.png`, `notion-external-private-page.png`, `notion-lifecycle-after-reopen.png`, `provider-tool-offers.jsonl` frames 32–40, and `notion-private-lifecycle-verification.json`. The owner requested skipping routine QA permission prompts; the existing Notion Fetch approval was set to Allow for this chat in this localhost conversation. No global or production approval policy was disabled.

The current selective-release owner advertises 13 connectors. Live connection entry checks reached provider sign-in for Airtable, Canva and ClickUp. The owner declined Jira connection; it remains disconnected. Linear is now verified for authenticated account and team reads. Its valid OAuth response used lowercase `bearer`; the prior adapter copied that token type directly into the HTTP header. A same-credential live comparison, with cache disabled, rejected the raw lowercase header both before and after successful canonical-header and native-SDK controls. The runtime now uses the official SDK AuthProvider for bearer credentials. Linear discovers 70 tools and the real whoami/list_teams calls returned the authenticated account and one team with hasNextPage false. Transport failures retain valid OAuth credentials; existing invalid-grant and disconnect paths own revocation. Cloudflare, Confluence, Datadog, Monday.com, PostHog, Sentry and Todoist still need entry-flow and configured-account checks. `connector-lifecycle-progress.json` records current operation status. This is partial connector verification, not completion of the full lifecycle goal.

## SDK authentication and readiness repair

The observed Linear 401 was an adapter interoperability defect. The OAuth grant
was unexpired, had read/write scope and matched the issuer/resource URI. Its
`token_type` was lowercase `bearer`, which the adapter inserted literally into
Authorization. Using the same credential and fresh SDK clients without cache,
the raw header failed before and after the controls; canonical Bearer and native
SDK AuthProvider both succeeded. No tool was executed by those controls.
`linear-auth-variant-proof.json` records the independent live comparison.

Bearer credentials now go through the installed official SDK AuthProvider. The
shared config accepts that public SDK interface, and the SDK constructs the
header. Existing non-bearer header handling is retained. No provider-specific
runtime exception, SDK fork, new auth engine, storage schema or migration is
included. The temporary development-only comparison was removed. A proposed
local metadata migration was never applied and was removed; the unrelated
migration 392 already in the shared local QA database was not modified.

Catalog aggregation also forwards original typed SDK connection failures to
the existing account broker. It refreshes at most once on the same account;
forbidden requests do not expand scopes, and account changes do not silently
move the operation elsewhere. Failed handshakes are unavailable rather than
successful empty catalogs. A transport rejection alone does not delete a valid
OAuth grant. Existing token-lifecycle and explicit-disconnect paths retain
revocation authority. The settings adapter refreshes its account state after
failed discovery. Empty attachable resources/prompts no longer imply that a
connector's read tools are unavailable.

Conversation `c84fc6c7-3668-47f4-9683-99ae920694b0` completed actual Linear whoami
and list_teams calls through chat after one-call approvals. The inspected raw
responses identify account display name agiautomationllc, workspace Siddhartha
Nagula and one team, with hasNextPage false. No issue content, other connector
or write operation was requested. The model unnecessarily loaded the private
QA Notion skill, but made no Notion connector call; automatic skill selection
is not counted as verified. Discovery lists 70 tools with no shared-schema
rejections. Evidence: `linear-live-capabilities.json`,
`linear-native-read-verification.json` and `linear-native-read-result.png`.

The lowercase-header real-SDK fixture and credential-retention regression both
failed before their respective corrections and passed afterward. The final auth
candidate passed 437 Web tests in 37 files and 107 shared MCP tests; shared/Web
typechecks and lint passed. The former
runs the actual SDK through discovery, initialization, listing and a controlled
read. Boundary tests continue to assert the exact credential through the SDK
provider. The final combined test/type/lint receipts identify the current
candidate; earlier 430-Web/107-SDK totals describe the preceding candidate.

Public OAuth discovery using the installed SDK read metadata for all 13
selectively released endpoints. All advertise S256 PKCE. This used no
credential, client registration, grant or tool call and is not counted as an
authenticated operation. `connector-public-oauth-metadata.json` preserves the
results. The owner declined Jira and Sentry. Other observed flows stop at
provider login, project-region choice or sensitive-access disclosure; those
operation lifecycles remain unverified. Current source boundaries are recorded
in `ARCHITECTURE.md`.

## Coordinated refusal follow-up

The post-auth Notion smoke request exposed a separate search-routing edge:
its direct prohibition listed several actions and ended with an ordinary
non-Oxford or-list. The existing parser treated only the first item as refused,
so the prohibited search phrase became a required native web search. Provider
frames 48–53 exposed web_search and the UI displayed an inappropriate empty-web
fallback despite the successful connected-page read.

The bounded shared parser now carries direct action prohibitions across those
lists while preserving introductory constraints, cautions against guessing and
separate affirmative lookups. Four new negative cases failed before the fix;
the full shared suite passed 320 tests afterward. Web tool-gate/loop integration
passed 26 tests in two files. No retry, timeout, coverage threshold or security
guard was weakened.

The same Notion request in fresh conversation
`e64053d8-29f5-4c52-9f48-fe607735619a` then performed only connector discovery and
the requested fetch, returning the actual QA marker completed. No public-search
or image-generation tool was offered in time-correlated provider frames 54–56;
the inspected activity contains no public search and the empty-web fallback is
absent. `notion-native-clean-fetch-proof.txt`,
`notion-native-clean-verification.json`, `notion-native-clean-result.png` and
`provider-tool-offers.jsonl` preserve the evidence. The temporary private QA
plugin was disabled after its lifecycle checks so its test skills do not pollute
ordinary chats; the user's connected Notion and Linear grants remain independent.

## Live access and remaining investigation

- The delegated private Notion QA page was created and its edit verified through both chat tool records and the real Notion UI; see the controlled-write evidence below. Other provider/resource writes remain unverified.
- Other selected provider grants, native/extension/CLI execution and every remaining matrix cell need current-source inventory and proportionate runtime checks.
- Plugin connector registration currently uses an `installed_by_plugin` owner key and ignores creation conflicts. Shared ownership and namespace collisions need a concrete regression before a defect or repair is claimed.
- Three earlier Notion schemas were refused by existing depth/key budgets. Their support remains incomplete; no budget has been increased or validator weakened.
- The local diagnostic restart completed after the original server's terminal status and free port were verified. A browser tab caught the temporary disconnect; its error page does not establish a new server failure.
