# Execution state

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

The living evidence of what is happening. One screen, updated when state
changes, never a narrative. Older detail lives in the decision model
(`../decisions/2026-09-05-living-decision-model.md`), the synthesis
(`../architecture/synthesis-2026-09-05.md`) and the readiness audit
(`../research/surface-ship-readiness-2026-09-05.md`).

## Current objective

Ship the web surface as one coherent product at shared ChatGPT and Claude
parity, model and provider neutral, with every visible control wired, then
desktop as the voice and computer use flagship. Acceptance is rendered
behaviour inspected by the lead, not tests.

## Release blockers (web)

| Blocker                                                  | Owner       | State                              |
| -------------------------------------------------------- | ----------- | ---------------------------------- |
| Migrations 0159 to 0174 applied in production            | founder     | drafts proven locally, not applied |
| Production key value quota (rate limits fail closed)     | founder     | decision pending                   |
| Separate Google key for local and QA                     | founder     | pending                            |
| Stripe live configuration                                | founder     | pending                            |
| Model selector catalogue and derived admission (D-13)    | engineering | in flight                          |
| Dead UI sweep of the product routes (truth map below)    | lead        | started 2026-09-05                 |
| Admin console reachable with a workspace bearing account | founder     | QA account has no workspace        |

## UI surfaces audited (rendered, by the lead)

| Surface                     | Date       | Result                                                                                                         |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Web sign in and sign up     | 2026-09-05 | rebuilt to the measured reference, approved                                                                    |
| Desktop sign in card        | 2026-09-05 | rebuilt, approved                                                                                              |
| Web chat run (search, code) | 2026-09-05 | trace, dock, failure row, queued row corrected; code execution invented a result (fixed, live recheck pending) |
| Settings modal, 16 sections | 2026-09-05 | density and copy corrected; nav clipping found by measurement and fixed                                        |
| Command palette, menus      | 2026-09-05 | palette reshaped; chat row menu anchoring defect fixed; project picker rebuilt                                 |
| Library viewer              | 2026-09-05 | zoom defect fixed; two corrections pending recapture                                                           |
| Model selector short list   | 2026-09-05 | approved after seven corrections; catalogue in flight                                                          |

## Dead or disconnected UI

| Found                                                                | State                                         |
| -------------------------------------------------------------------- | --------------------------------------------- |
| Cmd K did nothing on the chat page                                   | fixed 6a49ffc35                               |
| Stop lost the attempt and showed a toast                             | fixed fce4fc435                               |
| Sandbox refusal repeated three times per turn                        | fixed 6329a6bd5                               |
| Share project missing on the main chat page                          | fix in flight (nav slice)                     |
| Chat row menu drawn at the viewport corner                           | fix in flight, approved                       |
| Search notice blamed the tool on a code question                     | fixed 33f517c90                               |
| Code request answered without running code                           | fixed 81be75123, live recheck pending         |
| Settings nav first row clipped under the search                      | fixed 5e2136d6f                               |
| Dev routes under /dev in the production route tree                   | to verify                                     |
| Operator, founder, local, waitlist, beta pages                       | to verify                                     |
| Three built admin APIs (observability, takedown, privacy) with no UI | found by recon; operator console slice queued |
| COGS ledger written but never displayed                              | found by recon; operator console slice queued |
| Admin console readiness ledger self attested for 3 of 5 rows         | found by recon; make live or remove           |

## Critical flows

| Flow                                    | Verified                   | Failed or open                                                |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| Sign in, sign up, SSO callback          | 2026-09-05 web and desktop |                                                               |
| New chat with search and a table answer | 2026-09-05                 |                                                               |
| Code execution on explicit request      |                            | invented result on 2026-09-05; fix committed, recheck pending |
| Stop and retry a turn                   | 2026-09-05 (spec)          |                                                               |
| Settings read and write                 | 2026-09-05 (captures)      | propagation of each setting into behaviour untested           |
| Projects, schedules, library            | 2026-09-05 (captures)      | viewer corrections pending                                    |
| Desktop tray, chord, preset rebind      | 2026-09-05 live            | waves 2 to 5 pending founder sign in                          |
| Admin console                           |                            | never exercised with a workspace account                      |

## Fixes completed today (by area)

Auth a62853607 95b3244d3 9031a173c; chat run 1c3c352b9 fce4fc435 0c2b851c7
fa9280cae f43ae4757 460727c0b fd1e70ba8 912e27c50 6329a6bd5 4cad501e2
4d255db2c 33778b692 911f8dc89 dd3eccc7b; search cost 09b1e2f80 3bb332c19
9ad957bd0 ea9cc2c4c 9673c7a57 e5c0959af; continuity 3914c1d54 949b55fb8;
registry and gateways 137874204 5fbce2ad6 ed108d8e6 7305ce475 1e8902ccd;
resilience 84eaf9dc3 b9e077d80 642b32800 e7c829ba6; adherence 81be75123
33f517c90; settings 7fec33f94 to 41a1ae00f, 207353b17 8f5c2aa29 57c51c684
717b1f58f 70fe7c0b2 5e2136d6f; navigation 73cea7bbf b9d24d48f 6a49ffc35
32c0e291c; route preview d742a1b7b 5f244a834; telemetry 7ff4257e3 347e60191
855b39141; selector 5d4984b06 a984e8777; docs and decisions f5e81c0d9
35ceaa689 fb6e29bac f44c0438e 8f4866e18 8cce76a69.

## CI and security

CI: green on 35ceaa689 except the desktop lane (fixed 095847562 7710bce1e);
runs on later shas in progress. Guards: 58 check chain green on the pushed
commits; pre-push moving to a clean worktree of HEAD. Security: trust
boundary, egress, secrets, RLS boundary guards green; HIPAA unsupported by
decision; web span scrubbing in flight.

## Surfaces

| Surface     | State                                                          |
| ----------- | -------------------------------------------------------------- |
| Web         | blocked on the founder gated items above and the dead UI sweep |
| Desktop     | blocked on signing and notarization secrets; Windows pipeline  |
| Mobile      | blocked on store credentials; IAP flagged off by decision      |
| CLI         | blocked on NPM_TOKEN and binary signing                        |
| Chrome ext  | blocked on Web Store publisher identity                        |
| VS Code ext | blocked on Entra ids and Marketplace grant                     |

## External blockers

Founder: migrations, key value quota, Google key, Stripe live, signing and
notarization, store and marketplace credentials, NPM_TOKEN, an admin account
with a workspace, reseller agreements for gateway routes (commercial status),
the single production deploy.
