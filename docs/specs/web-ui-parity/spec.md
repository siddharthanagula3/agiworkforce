# Web chat rendering

Status: In progress
Owner: Web chat
Last updated: 2026-10-30

## Scope and evidence

This slice repairs the owner's October 27 rendering report and October 30
`AGIWORKFORCE_Luna_QA_2026-10-30` checklist. The supplied ChatGPT screenshots are
dated observations. An owner-authorized private ChatGPT web conversation was
inspected read-only on October 30: compact headings, formatted writing, native
charts and Mermaid previews were observed. That private reference is not stored
in this repository and establishes no general plan/platform availability.
Acceptance is working text, independent writing blocks, real controls, charts
and diagrams, accurate math, and distinct explicitly requested image resources.

The [live-check record](../../../audit/live-check/chat-rendering-2026-10-30.md)
owns verification evidence and pending acceptance. It distinguishes the local
renderer probe from authenticated conversation persistence. This slice has not
been deployed or promoted to a new production prompt.

## Verified causes

1. **The deployed renderer preceded the math fix.** Read-only inspection resolved
   production deployment `dpl_B6PcJBTtasH479W26iDuKFaWDEgV` to commit
   `8a0899345b3bda355dcf6cb1ff42b5b80664043d`, timestamped October 27 at
   07:23 -05. The KaTeX fix `ec9ed8dfe8` is timestamped 21:07 -05 that day.
   The deployed span renderer drops generated `style` and `aria-hidden`.
2. **Routing classified words instead of output purpose.** The server classifier
   treated mockups/wireframes as images; the shared classifier matched draw,
   visualize and illustration broadly. Recency words in writing or demonstrations
   of the current chat could select research. Form labels containing “web-search
   and code-generation” could match “search and.”
3. **Tool availability became permission.** Image tools were offered to every
   eligible streamed card-capable turn. The executor checked surface/arguments
   without checking the user's purpose. A whole gallery described in one prompt
   could become one collage.
4. **The served prompt lacked the rendered contract.** Stable `chat.system@6`
   does not describe inline or writing blocks; internal @14 added partial guidance.
   Renderer and tool fixes must work independently of a prompt promotion.
5. **Output types lacked working handlers and persistence.** Charts were CSS bars;
   writing needed a host save path; forms/cards/carousels needed actual controls;
   image resources needed independent trust/failure states. Diagram markers could
   divert inline diagrams. Media metadata could replace the conversational model
   label. Saved and displayed exports of one Matplotlib figure could appear twice.

Owners are shared output intent and Markdown rendering, the web request processor
and tool loop, `image-chat-tools.ts`, `useChatStream.ts`, and generated-file
presentation. Concrete paths and tests are in the live-check record.

## Rendering contract

`classifyAssistantFence` in `packages/ui/unified-chat` owns classification;
`answerSurfaces.ts` and `richBlocks.ts` own parsers. React, extension HTML and
mobile consumers provide the behavior supported by their host. A shared syntax
does not establish identical controls on every surface.

| Fence                                                         | Current syntax                                                                                    | Local React behavior                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `email`                                                       | `To:`, optional `Cc:`/`Bcc:`, `Subject:`, blank line, body                                        | Separate Copy/Edit; no implicit sending                                       |
| `writing`, `document`, `message`, `post`, `prompt`, `snippet` | Markdown body; one fence per independent item                                                     | Exact source Copy and scoped editing; seven items remain seven blocks         |
| `chart`                                                       | Optional `title:`, `subtitle:`, `type: bar\|line\|pie\|donut`, `x:`, `y:`, then `label \| number` | Existing `ChartArtifact`: data-backed SVG, axes, labels, tooltips             |
| `chart` JSON                                                  | `type`, `data`, `x_axis: { key, label }`, `y_axis: { label }`, `series: [{ key, label }]`         | Existing canonical parser and multiple-series renderer                        |
| `card`                                                        | `title:`, optional `subtitle:` and comma-separated `tags:`, blank line, Markdown                  | Markdown body and plain text tags                                             |
| `cards`                                                       | Optional `title:` and `columns: 1\|2\|3`, then `title \| description`                             | Grid responds to its own container width                                      |
| `stats`                                                       | Optional `title:`, then `label \| value \| caption \| tag`                                        | Metric cards                                                                  |
| `form`                                                        | `title:`, optional `submit:`, then text/date/textarea/select/radio/checks/slider fields           | Native controls, required validation, local Apply result panel                |
| `carousel`                                                    | Optional `title:`, then `title \| text \| image URL`                                              | One visible slide; Previous/Next and keyboard navigation                      |
| `gallery`                                                     | `caption \| image URL \| optional description`                                                    | Separate ordered resources; trust, loading, failure, Retry, Open and Copy URL |
| `mermaid`                                                     | One flowchart, sequence diagram or timeline per fence                                             | Safe SVG, exact source Copy and visible errors                                |
| `timeline`                                                    | `title \| date \| detail \| state`; date optional                                                 | Dated steps                                                                   |
| `status`                                                      | `label \| state`                                                                                  | State labels/icons; notes are unfinished                                      |
| `actions`                                                     | `label \| text`                                                                                   | Copies text; chat submission is unfinished                                    |
| `commands`, `console`                                         | Text body                                                                                         | Copy-all; per-command Copy is unfinished                                      |

Existing checklist, details, citation, radio, slider, checks, dropdown, map,
followups, files and transcript syntax remains supported. Semantic tag tones are
unfinished; these remaining catalog items stay in [tasks.md](tasks.md).

Form fields use `Label | initial value` or
`Label | *Selected option | Other option`; sliders use
`Label | min | max | value | unit`. A trailing `*` on a label, or final
`| required`, marks a required field. Labels/options must be distinct. Default
Apply validates and updates the local result panel. `submit: Continue | send`
explicitly opts into a next-message action, requires the host callback and
displays that sending behavior.

Each gallery/carousel resource passes the existing image trust gate separately.
User HTML is sanitized before trusted KaTeX rendering, preserving generated
geometry without allowing arbitrary HTML styles. Math Copy preserves source
through streaming, completion and reopening.

## Durable writing edits

The host receives `AssistantFenceEdit { index, language, source, content }`:
editable-fence ordinal, normalized language, original body and replacement body.
The shared AST helper verifies identity and replaces only that fence, preserving
surrounding Markdown, nesting and safe delimiters.

Hosted chat sends `{ fenceEdit }` to the existing
`PATCH /api/chat/conversations/[id]/messages/[messageId]` route. It enforces
authentication, CSRF, rate limits, user/workspace ownership, assistant role,
inactive generation and length limits. A stale fence is rejected; the update
compares the complete old message content before writing. The route returns
confirmed content and an opaque edit revision, then refreshes artifact indexing.
Client/server writers require the same captured revision and complete stored
prefix for edited continuations. Sync content changes rotate the revision;
ratings and metadata-only sync preserve it. Stale writes show an actionable
reopen notice. The host updates its store from the confirmed save.

Temporary chats and Local-mode messages keep their existing local store path.
Hosts without a save callback label edits as temporary. The development probe
uses localStorage for reopening; it does not verify this authenticated API or
database persistence. No migration or new response-part storage system was added.

## Tool and model identity contract

- Shared intent separates text, live rendering, calculation and picture requests.
  Unknown requests do not authorize image tools.
- Generation requires positive picture intent. Edits and shorthand continuations
  require an attached image or an owned, available image from the conversation;
  the executor rechecks the source before spending.
- Each image call requests one resource (`n = 1`). Distinct images use separate
  calls in requested order, followed by the ordinary gallery fence.
- Self-contained writing, formatting, calculation and rendering neither require
  nor receive optional search; execution is checked again. Explicit search and
  current external facts remain supported.
- Media model metadata stays on the image card; the reply retains its
  conversational model identity.
- Matplotlib exports carry validated render identity. Presentation groups matching
  exports while retaining downloads. Changed data, labels and separate figures
  retain distinct identities.

## Surfaces and layout

| Surface          | Current boundary                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web              | Fourteen authenticated local conversations plus fifteen renderer checks passed, with stubbed model calls. Two-tab stale continuation/reopen passed separately. |
| Public Electron  | Loads hosted web; inherits changes after web deployment. No desktop binary/window was verified.                                                                |
| Retained Tauri   | Consumes shared React rendering; native host save capability and runtime validation remain separate.                                                           |
| Chrome / VS Code | Readable card/stats/carousel HTML projections; honest source fallback for unsupported form interaction. Live hosts remain unverified.                          |
| Native mobile    | New card/stats/form/carousel kinds retain code/copy fallback; no new native controls or durable edit host.                                                     |

Composer/header strips collapse labels using their own container width. The chat
may narrow to 320px beside an artifact panel. Assistant H1/H2/H3 are compact and
distinct at 20/18/16px, scoped away from page headings. Individual math runs cover
both themes at 1440/1024/390/320px. This is not an all-route responsive or
cross-platform acceptance claim.

## Prompt governance and remaining acceptance

`chat.system@15` is internal. It extends @14 with implemented syntax, independent
writing blocks, tool restraint and the fiction/role-play refusal rule already
required by this feature spec. Rich controls are advertised only on web/desktop;
commands remain Copy-all, actions copy-only, tags plain text and status notes
unadvertised.

Published @1–14 text is unchanged; stable pin @6 remains. Deterministic assembly,
immutability, release and replay checks verify code/fixtures, not model quality
or permission to promote.

Fresh local acceptance passed 29 browser checks: fourteen independently created
authenticated conversations and fifteen renderer checks. A separate two-tab
case verified that a delayed response cannot replace an edit saved through the
real API, and Reopen saved chat restores the database version. All model/tool
responses were stubbed; no production user data was changed. Local rendering
and persistence acceptance does not measure live model emission quality.

Extension/native host checks and governed model evaluation remain open. This
task performed no production deployment or paid inference/search/image run and
added no image-search tool or direct inline Python execution control.

## Selected settings and agent-editor scope

The owner selected four new usability recommendations from the October 30
repair pack. Notification channels retain their saved values while a shared
associated note explains local browser permission and push support; email,
mobile push and this browser remain distinguishable. Viewing Settings does not
request permission or create a subscription. Existing global repair of an
already-consented endpoint remains separate. All selectors share a responsive
column and stack consistently; delivery/security details remain available.

The Agents editor uses bounded plain-text titles derived by the existing skill
catalog owner, plus descriptions and IDs for search. Inherited `null`, explicit
empty arrays and selected IDs keep their existing meaning. A keyboard
multiselect replaces the full raw-slug checkbox list; unavailable saved IDs are
retained. Header/footer actions submit the same form, search Enter cannot create
an Agent, and existing unsaved-change confirmation protects Cancel/navigation.
The mobile radio drawing preserves a 44px target and a 16px circular outline.

Nine authenticated local browser cases passed with all writes intercepted;
the three Agent cases also passed after the scoped radio correction. These
checks do not establish real push delivery or production Agent creation.
