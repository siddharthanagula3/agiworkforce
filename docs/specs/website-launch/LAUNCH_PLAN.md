# Website launch plan

Status: In progress
Owner: Website launch preparation
Last updated: 2026-09-19

Scope: public discovery, sign-in, useful conversation with explicit Luna selection,
context/citations, files and reusable outputs, return history, permissions and recovery.
Native clients and full competitor parity are outside this website release.
No release approval exists. Optional capabilities require honest availability states.

| User task                    | Entry point              | Public promise                | Current behavior                                                                                     | Dependencies                                      | Evidence                                                           | Priority | Repair or limitation                                                              |
| ---------------------------- | ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------- |
| Discover and begin           | Landing / primary CTA    | Inspect rendered copy         | Landing and CTA passed                                                                               | Next, Clerk test auth                             | QA PUBLIC-ENTRY                                                    | P1       | Reproduce before repair                                                           |
| Continue previous work       | Chat history             | Durable conversations         | Synthetic history persists; original history unavailable                                             | Original isolated demo dataset                    | QA DEMO-HISTORY, CHAT-FIRST-TURN                                   | P1       | Do not substitute fresh synthetic content for original demo evidence              |
| Produce grounded answers     | Composer, explicit Luna  | Useful answers and continuity | Luna arithmetic and recall passed; grounding unverified                                              | Auth, schema, eligible route, search              | QA CHAT-FIRST-TURN, CHAT-CONTEXT-AFTER-RESTART                     | P1       | Preserve selected model; no substitution                                          |
| Reuse outputs                | Files, projects, library | To inspect                    | Local upload, revision and reopen paths partially verified; generated outputs blocked                | Auth, storage, schema, provider balance           | QA FILES-OUTPUTS; evidence/project-sources.json                    | P1       | Production storage lifecycle and generated-byte download remain open              |
| Control data and permissions | Settings / approvals     | To inspect                    | Local export/cancel, privacy, inactive-membership isolation and approval recovery partially verified | Tenant isolation, schema, provider tool execution | QA DATA-CONTROLS, PERMISSION-RECOVERY; evidence/data-controls.json | P0       | Production isolation, downloaded export bytes and live tool execution remain open |

Prioritize reproduced user failures; Jev selects material repair approaches from concrete evidence.
Historical passes are reusable only when source/configuration and relevant conditions match.

First batch complete: WEB-014 landing skip target fixed and browser verified at desktop/mobile widths.
Public CTA reaches local sign-in. The broader first-release scope remains unverified and not launch-ready.
Deferred product Jev pilot: no representative demo evidence or account data-processing eligibility yet;
no new model call belongs in the deterministic keyboard repair. Production decisions unchanged.

Owner expansion: inventory in QA_ISSUES.md now covers Enterprise, validation, settings, usage ratios and error/layout quality. Repair professional project errors first, then Linked devices and natural Free provisioning, one issue at a time. Three repair attempts maximum before documenting a blocker and selecting independent work. Reuse relevant valid passes; skip image/video generation. Existing production queue and historical GLOBAL NO-GO remain unchanged.
