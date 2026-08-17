# Web Route Sweep — live findings

**Method:** every static route derived from `apps/web/app/**/page.tsx` (dynamic
`[param]` routes excluded) requested against a **local `next dev` server** at
`http://localhost:3000`, working tree clean at `e15df56e3`. Raw data:
`local-route-sweep.tsv`.

This is behavioural evidence, not static analysis. It could not be gathered from
the deployed product because every Vercel alias is behind Deployment Protection
(see `deployment-state.md`).

## Headline: no dead routes

**All 146 static routes return HTTP 200.** There are no 404s, no 500s, and no
broken links in the route tree.

> **Correction to an intermediate result.** The first sweep reported 5 routes at
> curl status `000` (`/legal`, `/legal/eu-representative`, `/local`,
> `/login/complete`, `/use-cases/consulting-businesses`). Re-probing each with a
> 90s timeout returned 200 for all five — they were **dev-mode cold-compile
> timeouts**, not defects (`/legal` alone took 53.9s to compile on first hit).
> A `next dev` compile stall is not a production signal and is not reported as
> one. The TSV has been corrected.
>
> Likewise, the first sweep's `signals` column used substring heuristics for
> `404`/`placeholder`; those matched bundler chunk names and HTML attributes and
> produced false positives on 13 routes. The column has been cleared rather than
> left to mislead.

## Route composition

| Class                       |   Count | Share |
| --------------------------- | ------: | ----: |
| Marketing / legal / content |      77 |   53% |
| Product surfaces            |      54 |   37% |
| Auth                        |      15 |   10% |
| **Total**                   | **146** |       |

**Over half the shipped route tree is marketing and legal copy.** For a product
benchmarked against ChatGPT and Claude, the ratio is inverted from where the
engineering value sits — 77 static content pages against 54 product screens.

## Finding 1 — ~~Three sign-in routes and three sign-up routes~~ **RETRACTED**

> **This finding was wrong and is withdrawn.** It was raised by this sweep and
> then refuted during domain analysis; the refutation was independently
> re-verified before retraction.

15 auth routes exist:

```
/login  /sign-in  /auth/login
/signup /sign-up  /register
/login/complete  /signup/complete
/forgot-password /auth/reset-password /auth/update-password
/auth/device /auth/error /auth/chrome-extension /get-started
```

The original claim was that all return 200 independently, so none is canonical —
i.e. three competing sign-in implementations. **That inference was an artifact of
the measurement.** The sweep used `curl -L`, which follows redirects and reports
the _final_ status, and Next.js App Router's `redirect()` inside a Server
Component does not always surface as an HTTP 3xx with a `Location` header. So an
alias and a real page look identical to an HTTP probe.

Reading the sources settles it — they are thin redirect stubs:

| Route         | Lines | `redirect` references |
| ------------- | ----: | --------------------: |
| `/auth/login` |     5 |                     2 |
| `/register`   |     5 |                     2 |
| `/sign-up`    |    20 |                     2 |
| `/sign-in`    |    25 |                     3 |
| `/signup`     |    60 |                    11 |

Canonicalisation is already implemented and intentional. **There is no gap here.**

**Method note, since it generalises.** A status-code sweep cannot distinguish a
redirect alias from a duplicate implementation, and it cannot distinguish a
rendered page from an SSO interstitial (see `deployment-state.md`). Both errors
occurred in this audit and both were caught by reading source rather than
trusting the probe. HTTP status is a _lead_, never a finding.

## Finding 2 — Auth gating is inconsistent across product routes

33 of 54 product routes correctly redirect to `/login?redirectTo=<route>`. The
redirect mechanism itself is well-formed and preserves intent.

But **20 product routes render without any auth check**, and they are not a
coherent set. Compare:

| Route             | Gated?  | Renders                          |
| ----------------- | ------- | -------------------------------- |
| `/chat/schedules` | **yes** | —                                |
| `/tasks`          | **no**  | the full authenticated app shell |

`/tasks` served unauthenticated returns the complete signed-in chrome —
`New Chat · Search ⌘K · Chat · Code · Projects · Library · Tasks · Schedules ·
Customize`, a `Loading account…` placeholder, and the heading
_"Tasks — your Cloud work runs"_ with `Active`/`All` filters. So the product has
**two task surfaces** (`/tasks` and `/chat/schedules`) with **opposite auth
policies**. One of them is wrong, and both being present is itself a duplication
gap.

## Finding 3 — QA and dev scaffolding ships in the production route tree

Two routes are test harnesses that are reachable, unauthenticated, in the
shipped app:

**`/qa-artifacts`** renders a hardcoded fake conversation:

> _"Research lightweight patterns, then build me a tiny interactive HTML task
> tracker."_ → _"Thought for 4s"_ → _"The user wants a small, visual task
> tracker…"_

**`/dev/inline-toolcall-demo`** self-describes as scaffolding, and leaks an
author's local filesystem path into shipped markup:

> \_"R22 inline tool-call badge · static smoke-test harness — Synthetic props.
> Reference: `~/Desktop/reference/ui/desktop/claude-artifacts/02\__.png`,
> `06*\*.png`, `08*_.png`"\_

Both are **mocked data on a live route**. The second also embeds a reference to
a local competitor-screenshot directory in user-reachable output. **Gap type:
dead code / reliability / hygiene. These belong behind a dev-only guard or
deleted.**

## Finding 4 — Ten product routes have no page metadata

These return the app-wide default `<title>` (`AGI | One AI workspace across
models and tools.`) rather than a page title:

`/apps` · `/connectors` · `/connectors/new` · `/connectors/permissions` ·
`/device-auth` · `/marketplace` · `/qa-artifacts` · `/skills` · `/user` ·
`/dev/inline-toolcall-demo`

`/local` returns an **empty `<title>` entirely**.

Directory-style surfaces (`/marketplace`, `/skills`, `/connectors`, `/apps`) are
exactly the pages a competitor would make publicly indexable — Claude's
connector, plugin and skill directories are public browse surfaces. Shipping
them with no title is both an SEO gap and a browser-tab identity gap.

## Finding 5 — Client-only shells with no server-rendered content

`/user` and `/connectors/new` render **only** `Skip to main content Loading…` —
no SSR content, no auth redirect, no empty state. An unauthenticated visitor
gets a permanently blank page rather than either a sign-in prompt or content.

## Settings surface inventory (from gated routes)

The sweep confirms 21 real settings routes exist and are auth-gated:

```
/settings            /settings/account      /settings/archived
/settings/billing    /settings/byok         /settings/capabilities
/settings/connections /settings/deleted-chats /settings/general
/settings/memory     /settings/notifications /settings/privacy
/settings/profile    /settings/reflect      /settings/safety
/settings/security   /settings/shared-links /settings/skills
/settings/skills/new /settings/sync         /settings/team
/settings/time-focus /settings/usage        /settings/voice
```

This is a genuinely broad settings tree and compares respectably to the
competitor trees reconstructed in `research/shots-*`. Whether each screen's
individual controls are wired is a separate question the inventory agents
answer — the sweep only proves the routes resolve.

## What this sweep does not establish

- Nothing about authenticated behaviour. 33 routes were only observed
  redirecting; their contents were not exercised.
- Nothing about dynamic routes (`/chat/[sessionId]`, `/share/[token]`,
  `/plugins/[id]`, `/skills/[name]`, `/connect/[deviceType]`).
- Nothing about client-side runtime errors, network failures, or interaction
  behaviour — a 200 with a rendered shell says nothing about whether the
  controls inside it work.
