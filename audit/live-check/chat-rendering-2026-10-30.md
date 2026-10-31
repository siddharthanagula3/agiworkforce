# Chat rendering and selected UI/UX repairs

Status: Initial web repairs deployed; owner follow-up fixes in local verification; governed prompt acceptance remains open
Owner: Web chat + shared rendering + settings/agents maintainers
Last verified: 2026-10-31
Purpose: Track the owner's rendering QA and selected notification/agent recommendations, verified causes, evidence and release boundaries.
Retention: Delete when pending acceptance is completed or transferred to existing defect owners; Git and the original chat retain dated evidence.

## Inputs and release state

The owner supplied `/Users/siddhartha/Downloads/AGIWORKFORCE_Luna_QA_2026-10-30`,
including the checklist JSON, report and screenshots. Controlled requests and
responses are in `apps/web/test/fixtures/chat-rendering.ts`. Earlier ChatGPT
screenshots are observations dated October 27. An owner-authorized private
ChatGPT web conversation was inspected read-only on October 30: H1/H2/H3 were
20/18/16px at weight 600, Subject was a 16px/24px textarea, the email body was a
16px/26px contenteditable DIV, writing documents retained headings/checklists
with Copy/Open editor, and diagrams/charts used actual Mermaid/native containers.
No message, edit, Send or Run action was performed. Private conversation IDs,
URLs, owner email, sidebar content and screenshots are excluded from this
repository. This observed account does not establish general plan availability
or full/current competitor parity.

The owner also supplied `AGI_Workforce_UI_UX_Repair_Pack` and explicitly selected
NEW-UX-01 through NEW-UX-04 alongside the chat repair. The pack distinguishes
60 cards from newly verified bugs: its four new items are usability
recommendations. The remaining historical/public-site/SEO cards were not added
to this implementation scope and are not asserted to be current defects.

Read-only Vercel/production inspection in the parent chat confirmed deployment
`dpl_B6PcJBTtasH479W26iDuKFaWDEgV` serves commit
`8a0899345b3bda355dcf6cb1ff42b5b80664043d`, timestamped 2026-10-27
07:23:03 -05. The math fix `ec9ed8dfe8c60f043c0cf649124556c4529107e4` is
timestamped 21:07:18 -05 that day. The deployed span renderer drops generated
`style` and `aria-hidden`. This is both a source and deployment gap; this branch
has not been deployed.

@15 is internal; stable pin @6 and published @1–14 remain unchanged. No live
prompt-quality evaluation, prompt promotion or paid provider/search/image call
was performed. Production inspection was read-only; no production conversation,
billing or database mutation was made.

## Causes and owners

| Finding                                          | Concrete source/evidence                                                                                                                                                     | Local correction                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid math lost geometry                         | Deployed span behavior; shared `markdownSanitizeSchema.ts`, `MarkdownContent.tsx`, `remarkPlugins.ts`; web `MessageBubble.tsx`                                               | Existing main preserves trusted KaTeX spans after sanitization; this change fixes adjacent display delimiters, incomplete-stream errors and wide-math scrolling                 |
| Output words selected images/research            | Pre-edit `packages/ai/routing/src/classify.ts:39` includes mockup/wireframe and `:196` selects research; shared `promptClassifier.ts:87` matches draw/visualize/illustration | Canonical `packages/ai/routing/src/output-intent.ts` shared by routing/selection/execution                                                                                      |
| Image presence became permission                 | Pre-edit web `request-processor.ts:1239` lacks user purpose; `image-chat-tools.ts:318` checks surface/args only                                                              | Positive picture admission; unknown requests stay text; edits/continuations require attached or owned source context                                                            |
| Writing/UI examples triggered search             | Broad recency, research and source phrases; “search and” inside checkbox labels                                                                                              | `apps/web/lib/web-search/required-search.ts` withholds unnecessary search; tool loop checks again                                                                               |
| Four-image request became one collage            | WebChatPage intercepted natural image intent into one direct image call before the conversational tool loop; one description could describe a complete gallery               | Plural resource intent stays conversational; one resource per call (`n = 1`), ordered gallery projection reuses its tool cards                                                  |
| Saved edits could be overwritten                 | Existing client/server upserts replaced content; continuation metadata was read after the request began                                                                      | Opaque server-owned edit revisions, same-read seed capture and atomic write guards across single/bulk/server/sync writers                                                       |
| Reasoning labels contradicted effective requests | Global preferences were mutated on model switches; request and composer resolved settings separately; elapsed time invented a Thinking status                                | Canonical `packages/contracts/types/src/reasoning-settings.ts`, scoped thinking store, composer/hook resolution and actual-event status                                         |
| HTML controls appeared but scripts did not run   | CodeBlock used a same-document srcDoc preview under nonce CSP; shared sandbox origin was not explicitly supplied by the web host                                             | `HtmlCodePreview.tsx` reuses ArtifactSandboxFrame, Providers bridges the validated host origin, blocked previews show an honest fallback                                        |
| Writing had presentation-only editing            | Shared EmailBlock/WritingBlock and `assistantFenceEdits.ts`; web `assistant-fence-persistence.ts`                                                                            | Exact source Copy, scoped fence identity, host Save and owned compare-and-swap PATCH                                                                                            |
| Functional blocks needed real controls/resources | Shared `answerSurfaces.ts`, `assistantFence.ts`, `AnswerForm.tsx`, `AnswerGallery.tsx`, `ChartArtifact.tsx`                                                                  | React validation/local Apply, card/grid/carousel DOM, independent image trust/failure states, data-backed charts                                                                |
| Diagrams lost preview/source or became pictures  | Web MessageBubble and shared Mermaid path; trusted CSS omitted timeline roles and scaled labels down on narrow screens                                                       | Separate safe SVGs, trusted timeline styles, natural-size local scrolling, source Copy, Expand/Escape and visible errors                                                        |
| Answer footer preferred the image badge          | `apps/web/features/chat/components/messages/MessageBubble.tsx` (`answeredByChipLabel`)                                                                                       | Image model stays on its card; conversational identity stays on the reply                                                                                                       |
| One Matplotlib figure appeared twice             | Saved/show exports had different byte hashes                                                                                                                                 | `apps/web/lib/e2b/python-figure-provenance.ts`, `png-render-identity.ts`, generated-file contracts and `turn-artifacts.ts` group validated render identity and retain downloads |

The abbreviated web API paths above are in
`apps/web/app/api/llm/v1/chat/completions/lib` or
`apps/web/app/api/media/image/lib`; shared rendering files are in
`packages/ui/unified-chat/src/components/markdown`.
The [feature spec](../../docs/specs/web-ui-parity/spec.md) owns the contract and
its [existing tasks](../../docs/specs/web-ui-parity/tasks.md) remain the worklist.

## Persistence boundary

`AssistantFenceEdit { index, language, source, content }` identifies the editable
fence by ordinal, normalized language and original body. The AST helper rejects
mismatches and changes only that fence, preserving surrounding Markdown/nesting.

The existing `PATCH /api/chat/conversations/[id]/messages/[messageId]` accepts
`{ fenceEdit }`. It checks authentication, CSRF, rate limits, user/workspace
ownership, assistant role, inactive generation and bounded content. It rejects
stale identity and updates only if the complete message still matches what was
read. The route returns confirmed content plus an opaque edit revision, refreshes artifact indexing and the
host updates its message store from that confirmation. Client/server upserts
require the captured revision and complete stored prefix before an edited
answer may be continued. Inserts cannot mint this marker. Sync content edits
rotate the marker; metadata-only sync and ratings preserve it. The client
captures continuation content and metadata together before awaiting the response.
A stale write receives a typed conflict with a Reopen saved chat action.

Nineteen real PostgreSQL cases verified blocked concurrent writers, stale and
forged revisions, legitimate continuations, the byte-prefix counterexample,
sync and ratings. The previous SQL was a negative control. The disposable
cluster was stopped and removed; no production database was used.

Route tests use deterministic auth/database stubs. The development probe uses
localStorage in its host save callback. Its Save/reopen checks do not verify the
authenticated API, database persistence or real chat reopen. Hosts without a
save callback label editing as temporary. Temporary chats and Local-mode
messages keep their existing local store path.

## Local browser checks

The root agent exercised fourteen separate authenticated local conversations
through the actual UI, database, save API and history hydration. The completed
consolidated run also exercised fifteen actual web MessageBubble checks through
the development-only `/dev/renderer-probe`, which is unavailable in production.
Cases use isolated fixture/conversation keys. The harness was corrected before
math geometry checks to avoid stale fixture state; measurement waits for used
KaTeX fonts.

| Case                     | Observed result                                                                                                                                                                   | Verification boundary                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Exact 578-character math | Source equality, exponent placement, fraction rules, matrix geometry and hidden duplicate HTML; integral/sum limits inspected in screenshots at 1440/1024/390/320px in light/dark | Controlled renderer fixture; no model-output quality claim |
| Headings                 | Assistant H1/H2/H3 20/18/16px; unrelated heading unchanged                                                                                                                        | Individual browser run                                     |
| Email                    | Actual text Copy/Edit, Save and reload                                                                                                                                            | Probe plus authenticated API Save/reopen                   |
| Seven writing artifacts  | Independent boundaries; saved block and siblings survive reopen                                                                                                                   | Probe plus authenticated targeted Save/reopen              |
| Project form             | Required validation, keyboard controls and local Apply result                                                                                                                     | No implicit chat submission                                |
| Cards/carousel           | DOM grid/cards, expandable details and navigation                                                                                                                                 | Web React                                                  |
| Three diagrams           | Three actual SVGs and exact source Copy                                                                                                                                           | Safe diagram renderer                                      |
| Four-image gallery       | Separate ordered resources, preserved failure slot/siblings and reopen                                                                                                            | Controlled SVG resources; no image-generation calls        |
| Native charts            | Bar/line/pie SVG, data and labels                                                                                                                                                 | Existing chart renderer                                    |

Evidence is local to the original chat, outside Git:

`/Users/siddhartha/.codex/visualizations/2026/10/30/01a18d4e-cb78-7740-a317-f92caf25c6ec/chat-rendering-2026-10-30`

It includes math screenshots/geometry JSON by width/theme, heading screenshots,
`email-saved.png`, `seven-writing-320.png`, `functional-form-320.png`,
`cards-carousel.png`, `three-diagrams-320.png`,
`gallery-partial-failure-320.png`, `native-charts.png`, `calculator-validation.png`
and `long-content-320.png`. The calculator computed 5 and 6 from 2 and 3, handled
negative/blank input and could not access the parent app (`window.top.document`
raised SecurityError). The local sandbox server used the existing infrastructure
headers; its pinned sanitizer bytes were verified against the existing SRI.
No CSP, sanitizer or approval boundary was weakened.

Five actual local Matplotlib PNGs and `figure-identities.json` provide separate
figure evidence: `monthly_sales_charts.png` and `chart.png` differ in byte hash
but share render identity; changed data, labels and a second figure have distinct
identities. Presentation retains four image groups and the fifth file as a
downloadable alias. The sample prints total 1315, average 219.17, maximum 310.
This is not hosted-sandbox or production blob-persistence evidence.

## Deterministic checks

- Routing/classification/release ledger: 424 passed; routing typecheck passed.
- Canonical search scope: 229 passed; search typecheck passed.
- Shared prompt classifier: 44 passed.
- Web tool-intent/media/search/prompt scope: 18 files, 364 passed.
- Real tool-loop fixtures: zero inappropriate image/network calls; source-dependent
  shorthand continuations; conversational SSE model identity; four ordered
  single-image calls/cards/URLs and final gallery text.
- Eval harness: 328 passed, 3 skipped. Authored reference replay: 132 satisfiable
  cases, including 23 chat-prompt cases. These verify the harness/fixtures.
- After @15 status/actions/chart truth corrections: 6 prompt files, 33 passed,
  including published immutability, registry and release records.
- Focused ESLint and `git diff --check` passed for the implementation slice.

These are scoped runs and overlap; their counts must not be summed as a
unique total. The final repository checks are recorded below when complete.

## Selected notification and agent recommendations

| Card      | Current source finding                                                                                                                            | Changed owners and verification                                                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEW-UX-01 | Saved channels did not clearly distinguish this browser's permission and web-push registration; the Settings toggle registered a worker on mount. | `BrowserNotificationStatus.tsx`, `NotificationsSection.tsx`, `WebPushToggle.tsx`, `web-push-client.ts`: a shared associated status, preserved channel/subscription selection, read-only Settings inspection. Global already-consented endpoint repair remains separate.                     |
| NEW-UX-02 | Four selectors alternated between side and stacked placement; long secondary copy dominated rows.                                                 | `NotificationsSection.module.css` and section markup: common responsive subgrid, consistent stacking and expandable delivery/security details.                                                                                                                                              |
| NEW-UX-03 | The editor mapped canonical skill names directly to labels and discarded descriptions; inherited mode exposed the whole checkbox list.            | `AgentSkillSelection.tsx`, `AgentConfigForm.tsx`, skill summary contract/API/catalog: optional bounded plain-text titles from canonical headings, descriptions/ID search, explicit inheritance/counts, keyboard multiselect and retained unavailable selections. No private skill-name map. |
| NEW-UX-04 | Actions were available only at the header; this editor had no unsaved-navigation guard.                                                           | `AgentEditorPage.tsx`: shared header/footer submit action, in-flow Create/Cancel, validation focus, disabled pending fields and existing unsaved-draft confirmation.                                                                                                                        |

The new authenticated local suite passed **9/9 in 58.0 seconds**. It covered
four notification permission states, selector alignment/stacking and keyboard
saves at 1440/320px, and three Agent inheritance/selection scenarios. All four
notification saves and three Agent submissions were intercepted in memory;
Agent POSTs returned an intentional 422 and created nothing. Permission,
subscribe, unsubscribe and display spies stayed at zero. Other preference
namespaces and consent writes were captured separately; they were not
misclassified as notification-view traffic. Unknown mutation attempts stayed
at zero. This is not an end-to-end notification-delivery or real Agent-creation
claim.

Visual review then found the new radio outline stretched by the existing
mobile button minimum height. The scoped correction keeps a 44px interactive
target and a 16px circle without reducing the global touch rule. All three
Agent scenarios passed again with actual target/pseudo-element geometry
assertions. The inherited `null`, explicit empty `[]` and selected canonical
IDs retained their request semantics; search Enter never submits the Agent.

Cropped evidence is under the rendering artifact's `settings-agent-ux/` folder,
including the final 320px selection/footer capture. Source checks also passed
52 notification tests, 34 final editor/selector tests, 6 contract tests and a
100-test catalog/API/older-consumer compatibility packet; these scopes overlap.

## October 31 follow-up checks

The supplied Three Site Comparison reuses October 30 AGI failures and records
new competitor observations separately; it is not a fresh reproduction of the
AGI defects. Current local evidence covers items 1–16 using actual rendered
controls, with deterministic model/tool outputs and real local persistence for
chat edits. The notification/agent browser fixtures intercept preference and
creation writes; they do not establish notification delivery or a completed
external Agent creation.

Item 17 remained in `ScheduleForm.tsx`: its introduction promised connector
selection while the canonical release gate hid it, and its instruction helper
denied chat access while the form offered optional Recent chats. The executor
requires both explicit source selection and the Search past chats setting.
The copy now describes sources without promising unavailable connector controls
and states the two chat-access conditions. Three focused cases failed before
the correction; the final packet passed 20 tests, including existing connector
and executor context checks. Two authenticated browser cases exercised the form
at 1440, 1024, 390 and 320 pixels in both themes, keyboard source selection,
Cancel and overflow checks. No schedule was created or executed.

The remaining Priority Level 1 failures were a header guard interpreting a
descendant touch-size variant as header minimum height, and an obsolete nowrap
assertion on the responsive action row. Scoped touch rules now live on the child
groups; the 48-pixel header guard is unchanged. Keyboard inspection also
reproduced unreachable ordinary buttons inside the narrow Panels menu; the
existing Popover primitive supplies the appropriate focus behavior. Copy's
untracked feedback timer could outlive unmount or be created after a late
clipboard completion; both races now have cleanup and regression coverage.
The focused packet passed 137 tests, and four real-browser cases covered both
themes, both pointer modes and eight viewports. The full current GitHub run
remains required before claiming that workflow green.

## Diagram and CI acceptance refinement

The first SVG-count check missed black timeline shapes and tiny scaled labels.
Direct screenshot review found those issues. The corrected check exercises
physical label size, actual timeline contrast, keyboard local scrolling, all
three Expand/Escape/focus flows and no duplicate SVGs at four widths in both
themes. It passed in 9.2 seconds. The SVG sanitizer and CSP were not relaxed.
Before/after screenshots are retained as `three-diagrams-before-320.png` and
`three-diagrams-320-light.png` / `three-diagrams-320-dark.png`.

A fresh Next development process using CI's signed-out fixture configuration
passed all **15 renderer checks in 1.2 minutes**, without the optional local
sanitizer cache. The real calculator sandbox used the actual pinned CDN asset
and retained the deployed security headers. The controlled browser fixture now
waits for and dismisses the real delayed cookie banner instead of sampling its
visibility too early. It does not force clicks through an overlay.

The local production web build passed after two test-only TypeScript errors
were corrected (Testing Library role options and byte-oriented skill hashing).
The built local server returned HTTP 404 with no renderer fixture DOM; the
production-boundary browser check passed in 1.3 seconds. This was a loopback
server with synthetic auth, not a deployment.

The blocking `web-renderer-e2e` job runs these development-only fixtures; the
production browser lane separately checks that `/dev/renderer-probe` is 404.
The page now has a server-side production gate. The coverage guard assigns
every signed-out spec to exactly one of those lanes and requires both in the
aggregate; existing auth and on-demand matrix checks remain intact. The
loopback-only sandbox fixture serves the existing document and reads all
security headers directly from the deployment configuration. Two fixture-server
checks, ten coverage-assignment checks and the workflow guards passed.

## Final repository verification

- `pnpm typecheck:all`: all 63 workspace tasks passed with the web heap limit,
  including the final post-UX run (2m14.5s).
- Full routing package after registry regeneration: 1,232 tests passed.
- Final combined changed web tests: 762 passed in 45 files, with the actual
  local Matplotlib interpreter and recorded image envelope enabled.
- Earlier changed web run: 607 passed, 5 optional checks skipped in the default run.
  Running the actual recorded image envelope and local Matplotlib interpreter
  explicitly passed 12 checks, including all five default optional checks.
- Full shared chat package: 2,563 tests passed in 220 files (6m29.6s).
- Earlier changed shared renderer tests: 221 passed. Existing code controls, table,
  continuation and thinking-policy checks passed another 111 tests; existing
  artifact editing and replay checks passed 18 web tests.
- Cloud generated-file/HTTP error contracts: 26 passed. Canonical reasoning:
  5 passed. Extension account freshness: 6 passed. Installed query-parser
  compatibility: 3 passed.
- `pnpm --filter @agiworkforce/desktop build:web` passed. This validates the
  retained Tauri web bundle, not a desktop binary or running native window.
- Changed non-ignored source ESLint (zero warnings), Prettier and diff checks
  passed. The full repository guard run is recorded at commit/push completion.

GitHub's blocking Rust audit exposed `RUSTSEC-2026-0418` in transitive
`libz-sys` 1.1.30 through `libgit2-sys` and `git2`. Cargo generated the update
to 1.1.31, whose [upstream correction](https://github.com/rust-lang/libz-sys/pull/280)
removes build-environment output. Cargo also selected already-locked compatible
`syn` and `getrandom` dependency edges within the published manifests' ranges;
no other package version changed. The patched crate compiled with `--locked`;
the existing blocking advisory command and bans/sources/licenses check passed.
No audit exception was added for the vulnerability.

A subsequent registry audit reported five high-severity findings in
`node-forge` 1.4.0, reached through Expo's CLI and certificate helper. The
[upstream patch](https://github.com/advisories/GHSA-hqq3-7jhf-c5jx) is 1.4.1.
The root override and pnpm-generated lock now resolve that release in both
contexts. The existing documented release-age process admits only
`node-forge@1.4.1` before its seventh day, justified by those security fixes;
the seven-day default and audit exceptions are unchanged. The only other
generated lock delta normalizes an existing Vitest coverage peer reference;
no other package version or importer changes.

Frozen install, actual installed-module resolution, the previously failing
5,000-record TLS input, 50,000-record variants and Expo certificate parsing/
validation/signing passed. Malformed PEM remains rejected. The blocking high
audit passes, with four moderate findings remaining. An actual Vitest 4 coverage
provider compatibility smoke passed three tests without threshold overrides;
this is not complete coverage acceptance. Lifecycle scripts and a local full
mobile build were not run for this dependency patch.

The JavaScript lane also recorded one redaction timing case at 50.891ms wall
time against its 50ms budget. Its exact cause remains unknown: no algorithm or
JIT regression reproduced, and 30 isolated samples used approximately 9–11ms
of thread CPU. The test now measures synchronous user+system thread CPU using
[Node's thread clock](https://nodejs.org/docs/latest-v24.x/api/process.html#processthreadcpuusagepreviousvalue),
retaining 50ms, every 50,000-character input and the original warmup. A real
off-CPU suspension control passes, while a bounded historical-regex control on
the identical input exceeds the budget and is rejected. Replacing the clock
with wall time in a temporary test copy makes the suspension control fail.
All 299 utils tests, type checking, lint and test hygiene passed. Production
redaction rules and behavior are unchanged.

The next full JavaScript run passed 5,228 mobile tests and found one notice
fixture that never established an active app state. The existing production
guard correctly withheld its cloud read in that fixture. The test now supplies
and restores foreground state explicitly, and adds background/inactive cases
that remain silent until the actual active-state callback runs. All 23 related
notice, heartbeat, task and usage-limit tests, mobile type checks and lint pass.
No production polling or Local Mode boundary was changed.

The same GitHub run surfaced three low-confidence script-tag findings in two
negative renderer test files. The literals exercise error non-disclosure and
nested-fence preservation; they never execute in the parent DOM. The existing
Semgrep registry records these exact test paths, owner, expiry and reviewed
reason. The scanner and unsafe fixtures are unchanged. The pinned rule still
reports all three findings; 11 affected renderer tests and 92 gate tests pass.
Independent allowlist accounting against the original CI report passes; removing
the new entry restores the same three unaccepted findings. Full provenance
replay correctly rejects the subsequently modified checkout; a new CI scan
must regenerate its own source binding before accepting the new revision.

CI run `41138065885` also exhausted its 30-minute repository-job budget near the
end of the still-progressing guard chain. Its cold protocol generation took
267 seconds and account-route analysis took 398 seconds. The independent job
ran the same chain successfully in 13m33s, demonstrating runner variability.
Both jobs now have a finite 45-minute budget. Their regression test requires
the complete chain to remain unconditional and blocking; no check was removed.

The signed-out browser lane exposed a shared-renderer regression: natural-width
SVG sizing also applied to noninteractive gallery thumbnails, overflowing their
390px and 360px cards. `MermaidDiagram.tsx` now exposes its existing
`interactive` state to trusted CSS; `packages/ui/design-tokens/src/chat.css`
limits embedded SVGs to their container while interactive chat diagrams retain
natural-size local scrolling. The unchanged thumbnail geometry checks pass at
1180px, 390px and 360px. The full chat-diagram browser case passes again in
9.6 seconds across four widths and both themes, including source Copy, reopen,
contrast, readable labels, local keyboard scrolling and Expand/Escape/focus.
All 24 Mermaid unit tests pass; sanitizer behavior is unchanged.

The broader JavaScript lane then exposed a parser-adapter copy mismatch:
Markdown-it includes the newline separating a fence body from its closing
delimiter, while the shared content contract expects the body alone. Chrome
and VS Code passed the token directly to classification. The existing
`@agiworkforce/utils/markdown-source` entrypoint now owns
`markdownItFenceSource`; both adapters use it to remove exactly that separator.
New integration cases preserve indentation, literal markup and intentional
trailing blank lines. The original mixed-reply assertions remain unchanged.
All 50 focused Chrome tests, 296 VS Code webview tests, three affected package
type checks, the VS Code project-reference build and real Chromium extension
smoke passed. The unrestricted local full Chrome run was interrupted under
heavy load, so its timing failures are not recorded as confirmed product bugs.
The subsequent bounded run passed 3,050 tests and exposed four loopback-listener
permission failures. Those four passed separately with listener permission;
no transport test or assertion was removed.

The complete coverage run measured 79.64% repository line coverage against its
unchanged 75% floor. It also caught two stale test fixtures, rather than new
product defects: `chat-tenant-isolation.test.ts` omitted the new tenant-scoped
revision lookup's empty result; `public-landmarks.test.ts` still allowlisted a
page wrapper after its child owned the correct `main-content` landmark. The
fixture now checks the third query's message/conversation/user/organization
scope and the intended 400 response. The stale allowlist entry was removed;
no nested main or production-route change was added. All 35 focused web checks
passed, including the content-edit and QA-gate regressions.

Native CI caught the CLI mirror still reading removed image-regex declarations
from `classify.ts`. Its image and research behavior also retained the obsolete
keyword rules. `apps/cli/src/routing/classify.rs` now mirrors the current output
intent, search-purpose and browser-action owners. Pattern, phrase and threshold
checks retain their mechanical source comparison; 55 behavior prompts also
match the actual TypeScript classifier. The frozen-source, locked/offline Cargo
routing run passed all 16 tests.
Scoped locked/offline CLI Clippy also passed with warnings and unsafe code
denied; package formatting passed and the lockfile was unchanged.

The Windows Explorer fixture slept and enumerated only once. Its address-bar
case could pass without observing a window, so that earlier pass was not
readiness evidence. The test-only `integration_fixture.rs` polls within the
existing five-probe/500ms policy and propagates enumeration errors; both native
cases now require their actual fixtures. All five deterministic helper tests
pass on macOS. Production automation and process lifecycle are unchanged;
actual Windows UI acceptance remains a CI check.

The package-runtime inventory declares both new pure entrypoints universal;
its actual import-graph check retains client/server restrictions. The service
ownership inventory explicitly includes the canonical search dependency and
requires a workspace reference. An obsolete route-contract exception was
removed. The canonical generated dependency/contract indexes were regenerated.
No guard restriction, test or security policy was disabled.

## Surface and remaining acceptance

Web React is implemented locally. Public Electron receives hosted web changes
after deployment; no desktop binary/window was verified. Retained Tauri uses
the shared React renderer, with native host/persistence still unverified.
Chrome/VS Code provide readable card/stats/carousel projections and honest
unsupported-form fallback; live hosts remain unverified. Mobile retains code/
copy fallback for new card/stats/form/carousel kinds; no new native controls or
durable edit host were added.

Fresh acceptance passed **29 browser checks in 4.2 minutes**: fourteen new
local authenticated conversations and fifteen renderer cases. The additional
two-tab late-continuation case passed in 26.3 seconds. It holds a stubbed
response open, saves a different document through the real PATCH API in another
tab, verifies the late POST receives 409 with the typed edit-conflict reason,
confirms the database kept the saved edit, and uses Reopen saved chat.

The fourteen cases cover Markdown, email, seven writing blocks, ten code
languages, Python output, calculator, five snippets, form, cards/carousel,
charts, three diagrams, four images, math and citations. Email and writing
perform real scoped Save/PATCH and reload; each other case verifies the exact
response persisted and reopens that same conversation. The citations case
reopens its source panel and verifies links. Model responses are deterministic
stubs; the Python browser case is not hosted code-execution evidence. Actual
local Matplotlib/IPython execution passed four integration checks separately.

The localhost fixtures require a test Clerk secret and loopback database and
must not be redirected to production. Initial harness failures were corrected:
loopback adapter/origin, per-test state, email source-copy expectation, cold
composer readiness and sandbox deployment headers. No failed instrument run is
counted as a product defect. The browser-discovered plural-image interception,
wide-matrix clipping and nonworking same-document script preview were reproduced
and corrected in product source.

Remaining catalog work includes per-command Copy, status notes, chat-sending
actions and semantic tag tones. @15 describes implemented behavior only and
stays internal; live emission and refusal/jailbreak quality remain unmeasured.
No production deployment or complete route/surface parity is claimed.

Existing defect owners are reused:

- `WEB-CHAT-PROMPT-V14-REFUSAL-REGRESSION-01`: governed candidate measurement and
  release evidence remain open.
- `WEB-CHAT-IMAGE-MODEL-CREDIT-01`: local identity checks corrected; persisted/
  authenticated and deployed acceptance remain open.
- `WEB-CHAT-UI-POLISH-2026-10-27`: unrelated transcript, sources, header/sidebar
  and truncation work remains in the existing compound row.

No duplicate defect rows or separate execution plan were created.

## Earlier publication hold

Read-only release inspection found that successful main CI automatically starts
staging, its staging environment has no reviewer gate, and its required
credential names are configured. Direct Vercel Git deployment is disabled.
To satisfy the owner's explicit no-deployment constraint while pushing main,
the final commit carries `Deployment: hold`. A shared, Git-parsed intent gate
prevents automatic staging/production/sandbox/signaling publication and queue
cleanup for that candidate; CI remains mandatory. No environment permission,
secret value or billing setting was changed. Existing manual release paths and
all prior release checks remain. The [canonical procedure](../../docs/development/ci-and-deploys.md)
documents the hold and later release behavior. The owner subsequently authorized
shipping the Neon optimizations and related UI/branding changes. The release
candidate proceeds through the existing exact-commit CI, staging, relay and
protected environment gates; earlier checkpoints retain their hold trailers.

## October 31 visual polish

The owner requested professional visual polish across the existing surfaces and
clarified that TV means the website on a large display. The authorized ChatGPT
reference was inspected again read-only: ordinary headings were 20/28, 18/28
and 16/26px at weight 600; email subject/body were 16/24 and 16/26px. These are
account observations, not general availability or pixel-parity claims. Private
reference content and identifiers remain outside Git. No new UI stack or image
generation was used.

| Finding                                                                              | Changed owners                                                                     | Correction                                                                                                                                |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tiny-screen prose became 14px; surface typography differed                           | `design-tokens/src/index.ts`, `chat.css`, web `globals.css`, mobile theme/renderer | Shared chat roles, stylesheet/native equality checks and compact distinct headings; retain font preferences and readable column limits    |
| Repeated writing chrome, empty recipients and no clean Edit return                   | shared `RichBlockCard`, `EmailBlock`, `WritingBlock`, answer form/gallery/surface  | Quiet framing, auto-growing subject, conditional recipient rows, reachable Copy/Edit/Cancel and unchanged scoped Save                     |
| Radio focus moved without selection after a fast key press                           | `AnswerForm`, installed Radix roving-focus/radio event path                        | Native form radios retain browser ArrowDown/Tab semantics; shared labels keep 44px targets and compact 16px glyphs                        |
| Notices covered content; their scrollable padding could enter the header             | web `ProductNotice`, `WebChatPage`, `WebAppShell`                                  | Measured content reservation, bounded scrolling and header clearance outside the scrollport; preserve actual warnings and dismiss actions |
| Global transitions animated layout changes                                           | web `globals.css`                                                                  | Limit default button/field transitions to visual feedback properties                                                                      |
| Underline was removed by the default sanitizer                                       | shared `markdownSanitizeSchema`, real renderer tests                               | Allow the inert `u` element; strip executable attributes and arbitrary styles as before                                                   |
| Mobile touch targets were small and action rows could overflow                       | mobile composer, SendButton, message actions, drawer and thread header             | Neutral Stop, physical 44pt targets, wrapping controls and unchanged handlers                                                             |
| Mobile writing Copy used the original source; recipients/newlines could be lost      | mobile `AssistantSurface`, renderer message/artifact identity keys                 | Controlled local drafts, exact live Copy/Share, preserved Cc/Bcc and body-only Copy with empty headers; explicit preview boundary         |
| Assistant grouping obscured native descendants behind a raw truncated label          | mobile `MessageBubble`                                                             | Non-grouping assistant container and real More action with existing action/confirmation handlers; retain user grouping                    |
| Native webview editor was narrow and Copy looked only for a code node                | VS Code `webviewContent`, `render`                                                 | Responsive host-styled editor and exact current textarea Copy                                                                             |
| Native email repeated headers and local writing implied retention                    | shared `assistantFence` native HTML projection                                     | Show full selectable email source once; keep the preview-only notice outside copied content                                               |
| Chrome ignored explicit theme preference in native controls                          | Chrome panel CSS/injection and published typography roles                          | Inherit the root color scheme; preserve explicit preference over opposite OS appearance                                                   |
| Retained desktop menus were omitted before hover; host context shared a squeezed row | Tauri conversation/project rows, composer context and shared `ChatInput`           | Mounted keyboard/focus/touch actions, bounded menus and a separate full-width host-context row above unchanged primary actions            |
| QR canvas used an existing raw white literal                                         | VS Code remote-control view and design tokens                                      | Fixed light canvas role with contrast verification; retain QR scanning background                                                         |

The earlier response routing, reasoning precedence, server edit revisions,
sanitizers, tool approvals, data isolation and multi-model contracts are not
changed by this polish pass. Claude/Haiku availability and exhausted credits
remain excluded. Nothing was deployed or changed in billing, account
permissions or production user data.

Fresh bounded acceptance:

- Web: **43/43** in 5.2 minutes. Fourteen independent local conversations use
  real loopback persistence and reopen; email/document Save and two-tab late
  continuation conflict are exercised. Renderer controls, six math expressions,
  diagrams, gallery failures, code copying and sandbox isolation remain green.
- The web visual matrix covers 320, 390, 844, 1024, 1440, 1920, 2560 and 3840px
  in both themes with fine/coarse input. It exercises a tall notice stack,
  keyboard scrolling, header hit-testing and releasing reserved space. Cookie
  state is settled through the actual record parser or visible banner before
  measurement. Model responses are stubbed and image calls remain zero.
- Public pages: **33/33** existing contrast, first-viewport and narrow-preview
  checks passed. This is not a complete route/functionality or hardware sweep.
- Retained desktop: **23/23**, including sixteen width/theme/pointer combinations,
  actual folder/policy controls, focus and inactive-row menus. Cloud API/IPC are
  disposable fixtures; exact read-only run discovery is separated from
  generation traffic. No inference request occurred. This is not native Tauri
  or public Electron host-integration proof.
- Mobile: the 237-test layout packet and later 29-test accessibility/copy packet
  passed, with package typecheck and lint exit 0. Their scopes overlap.
  Installed React Native source confirms how accessible grouping hides or
  overrides descendants; RNTL queries alone do not prove native traversal.
- Current mobile JavaScript ran in an existing cached Debug shell on a new
  isolated iPhone simulator. Real drawer and Settings controls worked with
  calibrated 200ms touches; light/dark screenshots were inspected. Default
  zero-duration taps were inconsistent, and the Debug gear intercepted Close
  Settings. The instrument exposes no valid typeable composer target. These
  are runtime limits, not confirmed app interaction defects. The simulator was
  restored to light and shut down after evidence capture.

Final extension browser checks passed: 24 emitted VS Code viewport states with
exact edited clipboard content and Queue/Stop bridge actions, 12 actual Chrome
renderer states with real Enter/newline/whitespace editing, and 12 unpacked
Chrome panel states. The latter applies emulation to the active extension
renderer after navigation and asserts actual pointer and opposite-OS theme
media; context options alone had not applied to the privileged target. These
are isolated profiles/component fixtures, not installed VS Code host or
authenticated Chrome-history parity. The existing unpacked extension smoke
runner passed after replacing its stale 100px empty-height check with readable
input, ordered rows, usable contained controls and visible history.

The complete mobile suite passed **5,277 tests / 562 suites / 23 snapshots**
with sufficient Node heap. Its initial default-heap abort and stale 36pt drawer
radius expectation were diagnosed separately; the test now asserts the
intentional 44pt circle. The full shared suite passed **2,578/2,578**; after
final typography consumer alignment, affected message/composer tests passed
**58/58** and web rendering **19/19**. All 63 workspace typechecks passed after
adding the explicit DOM test receiver type. Scoped web tests passed 728 with
one optional recorded-envelope replay initially absent; replaying the original
captured stubbed tool envelope then passed all eight functional-block cases.
Counts overlap and must not be added as a unique total. Existing ESLint
configuration excludes the browser-test files; those were exercised in real
Chromium rather than reported as linted.

Final repository guards and publication evidence are reported with the
candidate in the original chat. Evidence lives outside Git in the original chat's
`visual-polish-2026-10-31` folder. Native forms/cards/carousels and durable local
preview editing retain their existing honest capability limits. Fresh native
builds, Android runtime, native keyboard, VoiceOver/TalkBack, installed VS Code
theme/host behavior and physical TV/monitor checks are not claimed. The public
Electron renderer follows hosted Web; no retained Tauri-only change is counted
as a public Desktop release. The owner authorized the later production release;
its serving-commit proof is recorded with the candidate in the original chat.

The final VS Code package sweep reproduced a writing-input palette mismatch:
the background followed the host input role while the foreground used generic
text. Both now follow the paired host input roles with the existing fallbacks.
The palette guard was unchanged; the three generated structural snapshots
changed only that foreground declaration. All **1,493 tests / 125 files**,
package lint and typecheck passed locally. The emitted renderer also passed
24 browser states with a distinct custom host input foreground, exact edited
Copy and contained responsive controls. Color measurement waits for the
computed style to settle before comparison.
