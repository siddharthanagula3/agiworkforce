# UI truth map

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

Every product route in `apps/web/app`, classified, with what the lead has
verified in the rendered product. Status values: `verified` (exercised in
the browser by the lead and complete), `partial` (reachable, some controls
incomplete), `dead` (reachable, does nothing useful or misleads),
`unverified` (not yet exercised), `intentional` (deliberately unavailable
and says so), `remove` (should not be in the release surface). Controls
inside a route get their own rows once the route has been exercised.

## Product routes

| Route                                                           | Purpose                      | Status     | Evidence or gap                                                       |
| --------------------------------------------------------------- | ---------------------------- | ---------- | --------------------------------------------------------------------- |
| /chat, /chat/[sessionId]                                        | conversation                 | partial    | run verified 2026-09-05; code execution fix awaiting live recheck     |
| /chat/projects, /[id]                                           | projects and project home    | partial    | menus and picker approved; Share project on /chat in flight           |
| /chat/library                                                   | files and viewer             | partial    | viewer corrections pending recapture                                  |
| /chat/schedules                                                 | scheduled tasks              | partial    | row menu approved; page density is a follow-up                        |
| /chat/artifacts                                                 | artifacts list               | unverified |                                                                       |
| /chat/code                                                      | code surface                 | unverified |                                                                       |
| /chat/customize                                                 | customization                | unverified |                                                                       |
| /chat/from-share/[token]                                        | shared chat import           | unverified |                                                                       |
| /settings, /settings/[..]                                       | settings sections (16)       | partial    | modal reviewed; propagation of each setting untested                  |
| /connectors, /new, /mcp-directory                               | connectors directory         | partial    | list renders; connect flow not exercised                              |
| /plugins, /plugins/[id]                                         | plugins                      | unverified |                                                                       |
| /skills                                                         | skills                       | unverified | settings tab showed only skeletons once                               |
| /tasks                                                          | tasks                        | unverified | 18 line page                                                          |
| /teams                                                          | teams                        | unverified |                                                                       |
| /gallery                                                        | gallery                      | unverified | 23 line page                                                          |
| /apps, /marketplace                                             | apps (marketplace redirects) | unverified | 29 line page                                                          |
| /local                                                          | local mode page              | unverified |                                                                       |
| /billing, /upgrade/[plan]                                       | billing and upgrade          | unverified | billing settings reviewed; checkout not exercised                     |
| /share/[token], /shared-artifact/[token]                        | public share views           | unverified |                                                                       |
| /device-auth, /auth/device, /pair/[code], /connect/[deviceType] | device linking               | partial    | desktop device flow verified locally; production 429 on Upstash quota |
| /welcome, /get-started                                          | onboarding                   | unverified |                                                                       |
| /waitlist, /beta, /community, /founder                          | non product pages            | unverified | decide keep, intentional or remove                                    |
| /operator                                                       | operator console             | unverified | redirects to login; contents unknown                                  |

## Workspace and admin routes

| Route                                    | Status     | Evidence or gap                                                                                                                                                                |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| /workspace and nine sub pages            | unverified | QA account has no workspace; every page shows empty                                                                                                                            |
| /admin, /admin/directory-sync            | partial    | org admin or platform admin gate; readiness ledger rows self attested, not live; its control list omits three built admin APIs                                                 |
| /operator                                | partial    | platform admin allowlist (env of user ids); users, signups, subscriptions, feedback tab, reset usage and grant credits with audit; no cost, margin, route health or error view |
| GET /api/admin/observability, /explain   | dead       | cost and route breakdown service with no UI caller                                                                                                                             |
| POST and DELETE /api/admin/takedown      | dead       | audited takedown action with no button                                                                                                                                         |
| /api/admin/privacy requests and erasures | dead       | data rights workflow with no page                                                                                                                                              |
| COGS summaries in cogs-ledger-service    | dead       | ledger written everywhere, summarizeCogs never rendered                                                                                                                        |

## Auth routes

| Route                                                          | Status     | Evidence                             |
| -------------------------------------------------------------- | ---------- | ------------------------------------ |
| /login, /sign-in, /sign-up, /signup, /register, /auth/login    | verified   | rebuilt and approved 2026-09-05      |
| /auth/sso-callback, /login/complete, /signup/complete          | partial    | callback route exists; not exercised |
| /forgot-password, /auth/reset-password, /auth/update-password  | unverified |                                      |
| /verify, /session-expired, /auth/error, /auth/chrome-extension | unverified |                                      |

## Marketing, legal and documentation routes

Landing, /features/\*, /use-cases/\*, /solutions, /pricing, /enterprise,
/business, /desktop, /mobile, /cli, /chrome-extension, /vscode-extension,
/download, /downloads, /docs, /api-docs, /api-reference, /documentation,
/blog, /changelog, /customers, /partners, /press, /careers, /about, /contact,
/contact-sales, /faq, /help, /support, /status, /trust, /security, /sla,
/legal and the policy pages. Status: unverified as a set; the rule is that
nothing marketed may be broken in the product (audit after the product
routes).

## Development routes

| Route                                                            | Status    | Evidence or gap                                    |
| ---------------------------------------------------------------- | --------- | -------------------------------------------------- |
| /dev/inline-toolcall-demo, /dev/renderer-probe, /dev/token-probe | to verify | gated in page code; confirm in production          |
| /dev/landing-preview                                             | to verify | no gate found in the page; confirm the layout gate |

## Controls verified inside routes (2026-09-05)

| Control                              | Route               | Reads and writes               | Status                         |
| ------------------------------------ | ------------------- | ------------------------------ | ------------------------------ |
| Composer send, stop, retry           | /chat               | chat store, completions API    | verified                       |
| Model trigger and short list         | /chat               | model store, registry, billing | verified                       |
| Style, Chat and AGI Work toggle      | /chat               | composer state                 | verified                       |
| Web search toggle                    | /chat               | persistent preference          | verified; notice rule fixed    |
| Chat dock (In this chat, Sources)    | /chat/[id]          | turn metadata                  | verified                       |
| Command palette                      | all                 | conversations, actions         | verified                       |
| Chat row menu                        | sidebar             | conversation actions, projects | approved, commit pending       |
| Project row and card menus           | sidebar, projects   | project actions                | approved                       |
| Project icon and colour picker       | /chat/projects/[id] | PUT /api/projects/:id          | approved                       |
| Schedule row menu                    | /chat/schedules     | schedule actions               | approved                       |
| Settings sections (16)               | /settings           | preferences, billing, usage    | reviewed; propagation untested |
| Library viewer, zoom, ask about file | /chat/library       | media assets, starter prompt   | corrections pending            |

## Desktop (Electron shell), from the 2026-09-05 reconnaissance

| Control or capability                                     | Status    | Evidence or gap                                                                                  |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| Sign in card, device flow                                 | verified  | rebuilt and approved 2026-09-05                                                                  |
| Tray, quick ask chord, screenshot to chat                 | verified  | live 2026-09-05                                                                                  |
| Global dictation chord into our composer                  | partial   | works; batch transcription, one cleanup call; no partial transcripts                             |
| Dictation into the focused app                            | dead      | no path exists; fail closed by the code's own flaw record                                        |
| Settings, Voice tab                                       | partial   | reachable; local voice providers are code only under Electron                                    |
| Computer use, accessibility, keyboard, mouse              | dead      | Rust layer has no transport from the shipped build (D-15)                                        |
| Browser automation, vision loop                           | dead      | same                                                                                             |
| OS permission checks and deep links                       | dead      | same                                                                                             |
| Files, clipboard, terminal commands                       | partial   | exist in the Rust layer; unreachable from the shell                                              |
| Ten account bridge commands                               | to verify | recon reads the invoke path as calling the Tauri invoke; sign in worked live, confirm the branch |
| Duplicate task store, legacy HTTP client, migration stubs | remove    | wiring allowlist names them; no renderer caller                                                  |
