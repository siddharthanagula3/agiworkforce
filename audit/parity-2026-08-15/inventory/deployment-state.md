# Deployment & Live-Surface State (evidence captured 2026-08-15)

Captured directly from the Vercel API by the audit lead, not inferred from repo files.

## Project

| Field                 | Value                                                           |
| --------------------- | --------------------------------------------------------------- |
| Project               | `agiworkforce` (`prj_vDA7A5nZakjYscIsc47JyGqek3Ea`)             |
| Team                  | `team_QAqU2q6NTV4xxn971rfTy1F4`                                 |
| Framework             | Next.js, Node 24.x, Turbopack                                   |
| `live`                | **`false`**                                                     |
| Production domain     | `agiworkforce-siddharthanagula4.vercel.app`                     |
| Branch preview domain | `agiworkforce-git-compliance-dpdp-siddharthanagula4.vercel.app` |
| Build command         | `bash apps/web/scripts/build-with-chat.sh`                      |

> **CORRECTION.** An earlier draft of this file concluded from the above that
> "there is no custom apex domain" and that "the product is not reachable by any
> member of the public." **Both statements were wrong.** The production site is
> live and public at **`https://agiworkforce.com`**. The error came from reading
> only the `domains` array of the one project visible on this team and treating
> its absence as proof of absence.

## The real production surface: `agiworkforce.com`

`https://agiworkforce.com` is live, public, and Vercel-served. Verified:

```
GET https://agiworkforce.com/          -> 200, <title>AGI | One AI Workspace. Six Surfaces. Your Rules.</title>
GET https://agiworkforce.com/pricing   -> 200
GET https://agiworkforce.com/chat      -> 200, redirects to /login?redirectTo=%2Fchat
server: Vercel · x-vercel-id: cle1::iad1::… · x-vercel-cache: MISS
```

Its response headers show a production-grade posture that the repo audit should
credit:

- A **strict CSP** with a per-request nonce for `script-src` (no
  `unsafe-inline` on scripts), `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`, and
  `block-all-mixed-content`.
- **HSTS** with `max-age=63072000; includeSubDomains; preload`.
- Named third-party origins only: Clerk (`clerk.agiworkforce.com`), Stripe,
  Cloudflare Turnstile, Google Analytics/GTM, Vercel Insights, an R2 media
  bucket, and `sandbox.agiworkforce.com` as the sole permitted frame source —
  consistent with the repo's cross-origin artifact-sandbox design.

`mcp__vercel__list_projects` returns exactly one project on team
`team_QAqU2q6NTV4xxn971rfTy1F4`, and `agiworkforce.com` is not in its `domains`
array — so the apex is attached to a project under a **different account scope**
(the deployment aliases are user-scoped, `…-siddharthanagula4.vercel.app`). The
account topology is an ops detail this audit does not need to resolve; what
matters is that the public production surface exists and is auditable.

## Deployment Protection applies only to the `*.vercel.app` aliases

Every `*.vercel.app` alias — production and preview — sits behind Vercel
Deployment Protection (SSO):

```
GET https://agiworkforce-siddharthanagula4.vercel.app/
  -> 200 https://vercel.com/login?next=…   <title>Login – Vercel</title>
```

A naive status sweep of those aliases reports `200` for all 146 routes while
every body is the Vercel SSO interstitial. **HTTP 200 on a `*.vercel.app` alias
is not evidence a route works.** The apex domain has no such protection.

## Deployment state at audit time

| Deployment                         | Commit             | Target                         | State                      |
| ---------------------------------- | ------------------ | ------------------------------ | -------------------------- |
| `dpl_HZqQEKP9iVgyDwR6qZydoiBuCZKH` | `e15df56e3` (HEAD) | production (`action: promote`) | **ERROR**                  |
| `dpl_9GzAkGSNES8wAaFFJCFU5PoUabe8` | `e15df56e3` (HEAD) | preview                        | READY                      |
| `dpl_FZbPxXGCejZS15bFTCYD4YCXeSzT` | `4bfc99dc1`        | production                     | READY (rollback candidate) |

Key facts:

1. **Current HEAD builds successfully** as a preview (`dpl_9GzAk…` READY) — the
   build is not broken.
2. **The promotion of that same build to production failed.** The failing
   deployment carries `action: promote` and `originalDeploymentId:
dpl_9GzAkGSNES8wAaFFJCFU5PoUabe8`, and `get_deployment_build_logs
--errorsOnly` returns _"No error/stderr/exit events in this build."_ — i.e.
   the failure is in the promotion/alias stage, not the build stage.
3. **Production is therefore serving stale code** — commit `4bfc99dc1`, roughly
   four days behind HEAD, and behind ~10 subsequent billing/pricing fixes.
4. Of the last 20 deployments, **5 are in ERROR state**, including 3 of the 6
   most recent production-targeted ones.

## Which code does `agiworkforce.com` serve?

This is **not** settled by the deployment table above. That table describes the
team-scoped `agiworkforce` project, whose production alias is SSO-protected and
whose last promotion failed. The apex domain is attached to a different account
scope and may be fed by a different project or promotion history.

Treat the apex as **an independent surface of unknown commit** until someone
with access to the owning project confirms it. Concretely:

- Live findings gathered from `agiworkforce.com` are labelled _live-prod_, and
  are **not** assumed to reflect `e15df56e3`.
- Repo-derived findings are anchored to `e15df56e3` (`compliance/dpdp`), working
  tree clean.
- Where the two disagree, that disagreement is itself reportable — it means the
  shipped product and the audited source have diverged.

## Consequence for this audit

Live behavioural auditing **is** possible, via two independent surfaces, and no
access posture had to be changed to get it:

| Surface                              | Reachable   | Commit      | Used for                                                    |
| ------------------------------------ | ----------- | ----------- | ----------------------------------------------------------- |
| `https://agiworkforce.com`           | yes, public | unknown     | live-prod route sweep, headers, real user-visible behaviour |
| `http://localhost:3000` (`next dev`) | yes, local  | `e15df56e3` | route sweep + workflow tracing against audited source       |
| `*.vercel.app` aliases               | no (SSO)    | —           | not usable                                                  |

This audit did **not** disable Deployment Protection or mint a bypass token —
both would change a production system's access posture, and neither was needed.

## Cross-reference

`docs/current/gap-audit-2026-08-08.md` already tracks this class of problem as
**GAP-P0-003 — "Production promotion has no successful proof for the current
head."** This capture is fresh evidence that the condition still holds one week
later, on a newer head.
