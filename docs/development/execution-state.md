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
| Public pages at the landing's standard (founder gate)    | lead        | systemic restyle landed 2026-09-05 |

## UI surfaces audited (rendered, by the lead)

| Surface                            | Date       | Result                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web sign in and sign up            | 2026-09-05 | rebuilt to the measured reference, approved                                                                                                                                                                                                                                                                                                                                        |
| Desktop sign in card               | 2026-09-05 | rebuilt, approved                                                                                                                                                                                                                                                                                                                                                                  |
| Web chat run (search, code)        | 2026-09-05 | trace, dock, failure row, queued row corrected; code execution invented a result (fixed, live recheck pending)                                                                                                                                                                                                                                                                     |
| Settings modal, 16 sections        | 2026-09-05 | density and copy corrected; nav clipping found by measurement and fixed                                                                                                                                                                                                                                                                                                            |
| Command palette, menus             | 2026-09-05 | palette reshaped; chat row menu anchoring defect fixed; project picker rebuilt                                                                                                                                                                                                                                                                                                     |
| Library viewer                     | 2026-09-05 | zoom defect fixed; two corrections pending recapture                                                                                                                                                                                                                                                                                                                               |
| Model selector short list          | 2026-09-05 | approved after seven corrections; catalogue in flight                                                                                                                                                                                                                                                                                                                              |
| Public pages (34 nav routes)       | 2026-09-05 | swept in the browser: 200 on every route, no broken images, no overflow; shared system restyled to the landing                                                                                                                                                                                                                                                                     |
| Landing surface frames             | 2026-09-05 | six frames rebuilt as working sessions with route receipts, approved in isolation and in the marquee                                                                                                                                                                                                                                                                               |
| Header and landing sections        | 2026-09-05 | grouped navigation, announcement, proof row, latest and start sections approved in both themes                                                                                                                                                                                                                                                                                     |
| Header polish and the agi web page | 2026-09-05 | 64px blurred sticky bar, current section held, animated panels, grouped phone menu; /web replaces the wrong /apps target from the Product menu and footer; both themes and 390px reviewed                                                                                                                                                                                          |
| 73 public routes at 390px          | 2026-09-05 | no horizontal overflow on any route; hero pill wraps, two buttons plus two text links, frames crop at 150% with a right fade, consent banner compact, 44px menu targets; landing, features, pricing, download, about frames reviewed                                                                                                                                               |
| 72 public routes, mechanical audit | 2026-09-05 | rendered copy scanned for em dashes, orphans, placeholders, overflow, empty controls and dead links; only the deep research orphan headline and the local /download release 404s surfaced                                                                                                                                                                                          |
| Account menu feedback flow         | 2026-09-05 | menu item, dialog with capture and upload, submit returned 200 and the row carried the page path; operator rendering awaits a platform admin identity                                                                                                                                                                                                                              |
| Phone composer controls            | 2026-09-05 | chatgpt.com phone composer measured (36px round controls, 20px glyphs, 28px segmented control); ours at 390px: icon-only Chat and AGI Work toggle 60x28, 32px round mic, voice and send with 18px glyphs, global 40px phone button floor overridden on these controls, desktop app shortcut removed and the AGI Work tray shrunk to its content, inset under the composer          |
| Effort control                     | 2026-09-05 | effort left the model picker for its own trigger; popover carries the level name, a thick slider with stop dots and a lock at the first gated level (chatgpt.com pattern); picker keeps a single scroller                                                                                                                                                                          |
| Voice conversation                 | 2026-09-05 | driven end to end in Chromium with a synthesised microphone file at 1280px and 390px: utterance transcribed, sent, answered, spoken, then listening resumed; the analyser AudioContext and speech synthesis are now created inside the entry tap so iOS Safari, which suspends both outside a gesture, gets a live level and an audible reply                                      |
| Plus menu and effort popover       | 2026-09-06 | founder trimmed the plus menu: Run code, Memory and the Web search status row are gone, Deep Research and Create Office files sit above Skills, the route receipt card no longer docks in the menu; effort popover header names the model and level and opens the picker, blue slider; the bolt glyph was rejected because chatgpt.com uses it for paid fast mode, the brain stays |

## Dead or disconnected UI

| Found                                                                                  | State                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cmd K did nothing on the chat page                                                     | fixed 6a49ffc35                                                                                                                                                                                                                                                                  |
| Stop lost the attempt and showed a toast                                               | fixed fce4fc435                                                                                                                                                                                                                                                                  |
| Sandbox refusal repeated three times per turn                                          | fixed 6329a6bd5                                                                                                                                                                                                                                                                  |
| Share project missing on the main chat page                                            | fixed e0979d2f0                                                                                                                                                                                                                                                                  |
| Chat row menu drawn at the viewport corner                                             | fixed 01fd497c7                                                                                                                                                                                                                                                                  |
| Search notice blamed the tool on a code question                                       | fixed 33f517c90                                                                                                                                                                                                                                                                  |
| Code request answered without running code                                             | fixed 81be75123, live recheck pending                                                                                                                                                                                                                                            |
| Provider billing exhaustion shown as raw JSON with a dead Retry                        | found live 21:46; D-14; fix in flight                                                                                                                                                                                                                                            |
| Settings nav first row clipped under the search                                        | fixed 5e2136d6f                                                                                                                                                                                                                                                                  |
| Dev routes under /dev in the production route tree                                     | to verify                                                                                                                                                                                                                                                                        |
| Operator, founder, local, waitlist, beta pages                                         | to verify                                                                                                                                                                                                                                                                        |
| Three built admin APIs (observability, takedown, privacy) with no UI                   | fixed 45ff0dffd b6f44a736 34b1f2107: operator console tabs with governed flows                                                                                                                                                                                                   |
| COGS ledger written but never displayed                                                | fixed b6f44a736: costs tab with attributed cost per account                                                                                                                                                                                                                      |
| Admin console readiness ledger self attested for 3 of 5 rows                           | fixed a119900bd: rows removed, live policy state remains                                                                                                                                                                                                                         |
| Pricing models table printed a comma for plans with no models                          | fixed 752d93fdb: the cell reads None; capability table opens by default                                                                                                                                                                                                          |
| Public pages carried italic accent phrases and unstyled link lists                     | fixed 4ccc39928: landing eyebrow, heading weight and card treatment site wide                                                                                                                                                                                                    |
| Landing frames were empty greetings                                                    | fixed 69c545157: sessions with tool rows, approvals, sources, diffs, receipts                                                                                                                                                                                                    |
| Surface and feature pages led with ledgers and stale screenshots                       | fixed d2cf23d9a 579587379: live frames and five product scenes on every hero                                                                                                                                                                                                     |
| Public pages read as one template (hero, ledger, cards, close)                         | fixed 55d7cc01a: nine section primitives, three console scenes, seven pages recomposed                                                                                                                                                                                           |
| Composer tightened by the parity work against the founder's approved size              | fixed a499b7630 and the footer commit: 3 september density restored, quiet line back                                                                                                                                                                                             |
| No way to send feedback with a screenshot from the product; feedback had no image path | fixed: Send feedback in the account menu, capture or upload, private storage key, operator console render (verified live on localhost, screenshot dropped locally because private storage is not configured here)                                                                |
| Product frames ended on a hard border                                                  | fixed 5ec2faf25: frames fade into the ground on hero, bento, split, walkthrough and moment slots                                                                                                                                                                                 |
| Nine stale product screenshots on business, teams, agi work and feature pages          | fixed 55d7cc01a: replaced with scenes                                                                                                                                                                                                                                            |
| Landing cited 22 providers where the providers page computes 14 on your key            | fixed 55d7cc01a: both read the same constants                                                                                                                                                                                                                                    |
| Founder asked for two named frontier models in the catalogue                           | done 4cacda1c5: the new OpenAI entry is added from the provider's published pages (flagship band, no task route, so Auto is unchanged); the Anthropic one was already curated on 2026-09-04 and rechecked; the OpenAI roster guard now asserts no orphan instead of set equality |
| Ten settings deep links landed on a bare chat page                                     | fixed 65188a68f: section travels in a query key the chat page opens; verified                                                                                                                                                                                                    |
| /download calls four release endpoints that 404 locally                                | open: verify against production release assets before judging                                                                                                                                                                                                                    |

## Critical flows

| Flow                                              | Verified                   | Failed or open                                                                                                                         |
| ------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in, sign up, SSO callback                    | 2026-09-05 web and desktop |                                                                                                                                        |
| New chat with search and a table answer           | 2026-09-05                 |                                                                                                                                        |
| Code execution on explicit request                |                            | recheck at 21:46 failed one layer earlier: Auto picked a route whose provider account is unfunded, raw JSON shown (D-14 fix in flight) |
| Stop and retry a turn                             | 2026-09-05 (spec)          |                                                                                                                                        |
| Settings read and write                           | 2026-09-05 (captures)      | propagation of each setting into behaviour untested                                                                                    |
| Projects, schedules, library                      | 2026-09-05 (captures)      | viewer corrections pending                                                                                                             |
| Desktop tray, chord, preset rebind                | 2026-09-05 live            | waves 2 to 5 pending founder sign in                                                                                                   |
| Desktop computer use, local voice, OS permissions |                            | no transport from the shipped Electron build to the Rust layer (D-15 spike queued)                                                     |
| Desktop dictation into another app                |                            | does not exist; system wide dictation fail closed by design record                                                                     |
| Admin console                                     |                            | never exercised with a workspace account                                                                                               |

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
35ceaa689 fb6e29bac f44c0438e 8f4866e18 8cce76a69; marketing 552427af5 4ccc39928
69c545157 752d93fdb 9936eecbc d2cf23d9a 579587379; settings deep links 65188a68f (reference study: x.ai home, product, api, company, pricing,
business pages captured under scratchpad ref).

## CI and security

CI: dccc11b5c was red in four lanes that were already red on 5080fa8fd (raw palette
classes in the routing health panel and diluted text in the model selector against
the web UI invariants guard; an unused tuple and a window.location navigation
against lint; the workflow bundle reaching node:async_hooks through the logger,
which failed next build; the desktop sign-in visual spec looking for the
pre-rebuild heading), all four fixed in 8395ee11a and the run on 55d7cc01a is the
gate for the founder-authorised production deploy. Earlier: 1e8902ccd went red in seven lanes with four causes (an index export swept ahead
of its definition, colour literals in the project page, a lint warning in the
trace timeline, a desktop wire id collision from the gateway sync); all four fixed,
33 commits pushed as b77bd2da8 through the new clean worktree pre-push hook
(954523697), the Rust dedup follows. Guards: the hook now judges commits, not
the shared tree. Security: trust boundary, egress, secrets, RLS boundary guards
green; web span scrubbing landed (2cc92999e); vendor adapter allowlist is config
(1c628446a); HIPAA unsupported by decision.

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

## Open founder decisions (asked 2026-09-05 evening, awaiting answers)

| Decision                                                                                                                                | Recommended                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop runtime: Tauri app, Electron plus sidecar, or Electron port                                                                     | Tauri app becomes the product after a one week parity check; the parity comparison (2026-09-05) found the Tauri pipeline is the finished one and that permissions attach per signed bundle, which rules out the sidecar |
| Web connect your own provider account lane                                                                                              | Yes, client held keys forwarded per request, never stored                                                                                                                                                               |
| Production path                                                                                                                         | Apply 0159 to 0174 after a branch rehearsal, then continuous deploys behind the reviewer gate                                                                                                                           |
| Accounts: Anthropic funding, separate Google key, paid Upstash, gateway terms, Free and Pro QA identities, a platform admin QA identity | All                                                                                                                                                                                                                     |
| Anonymous first message on the landing, the way grok.com opens on its composer                                                          | Yes, once the free lane (workstream F) is live and terms verified; until then the landing keeps sign in first, because an anonymous request has no lane to run on                                                       |
