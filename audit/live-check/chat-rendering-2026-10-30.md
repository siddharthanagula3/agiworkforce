# Chat rendering: local fixes and live acceptance

Status: Local browser and persistence acceptance passed; governed prompt and deployed acceptance remain open
Owner: Web chat + shared rendering maintainers
Last verified: 2026-10-30
Purpose: Track the owner's rendering QA, verified causes, local evidence and remaining acceptance boundaries.
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
| Diagrams lost preview/source or became pictures  | Web MessageBubble and shared Mermaid path                                                                                                                                    | Separate safe SVGs, marker handling, source Copy and visible errors                                                                                                             |
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

## Final repository verification

- `pnpm typecheck:all`: all 63 workspace tasks passed with the web heap limit.
- Changed web tests: 607 passed, 5 optional checks skipped in the default run.
  Running the actual recorded image envelope and local Matplotlib interpreter
  explicitly passed 12 checks, including all five default optional checks.
- Changed shared renderer tests: 221 passed. Existing code controls, table,
  continuation and thinking-policy checks passed another 111 tests; existing
  artifact editing and replay checks passed 18 web tests.
- Cloud generated-file/HTTP error contracts: 26 passed. Canonical reasoning:
  5 passed. Extension account freshness: 6 passed. Installed query-parser
  compatibility: 3 passed.
- `pnpm --filter @agiworkforce/desktop build:web` passed. This validates the
  retained Tauri web bundle, not a desktop binary or running native window.
- Changed non-ignored source ESLint (zero warnings), Prettier and diff checks
  passed. The full repository guard run is recorded at commit/push completion.

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
