# Production vs audited source — drift report

**Method.** The same 146 static routes were requested against two surfaces:

| Surface   | URL                                  | Commit                                |
| --------- | ------------------------------------ | ------------------------------------- |
| live-prod | `https://agiworkforce.com`           | unknown, demonstrably older than HEAD |
| local     | `http://localhost:3000` (`next dev`) | `e15df56e3`, tree clean               |

Raw data: `prod-route-sweep.tsv`, `local-route-sweep.tsv`.

## Result: 5 routes exist in source and 404 in production

| Route               | local | live-prod | What it is                              |
| ------------------- | ----- | --------- | --------------------------------------- |
| `/privacy/requests` | 200   | **404**   | DSAR / data-subject rights request form |
| `/privacy/india`    | 200   | **404**   | DPDP (India) privacy notice             |
| `/data-use`         | 200   | **404**   | data-use policy                         |
| `/invite`           | 200   | **404**   | team-invitation acceptance              |
| `/login/complete`   | 200   | **404**   | login completion step                   |

The other 141 routes match (200 on both).

## What this does and does not mean

The tempting reading — _"production ships a privacy policy whose links 404"_ —
is **wrong**, and was checked rather than assumed:

```
$ curl -s https://agiworkforce.com/privacy | grep -oE 'href="/[^"]*"' | grep -i 'india|requests'
href="/privacy"          ← only self-reference; no link to the missing pages

$ curl -s https://agiworkforce.com/sitemap.xml | grep -E 'data-use|privacy/india|privacy/requests|invite'
(no output)              ← the live sitemap does not advertise them either
```

The deployed `/privacy` page **predates** those sub-pages and does not link to
them. The live sitemap does not list them. So production is internally
consistent — it is simply **an older build**.

The correct finding is therefore:

> **Production is materially behind the audited source. The entire DPDP
> compliance surface built on this branch has never been deployed.**

This is the same condition the deployment table shows from the other side: the
promotion of HEAD to the team-scoped production alias **failed**, and 5 of the
last 20 deployments are in `ERROR`.

## The coupling risk this creates

Source at `e15df56e3` **does** wire these routes into user-visible paths:

| Referrer                                              | Line          | Points at                                          |
| ----------------------------------------------------- | ------------- | -------------------------------------------------- |
| `apps/web/app/privacy/page.tsx`                       | 530           | `/privacy/india`                                   |
| `apps/web/app/privacy/page.tsx`                       | 731, 778      | `/privacy/requests`                                |
| `apps/web/app/sitemap.ts`                             | 135, 139, 140 | `/data-use`, `/privacy/india`, `/privacy/requests` |
| `apps/web/features/settings/sections/TeamSection.tsx` | 94            | `new URL('/invite', window.location.origin)`       |

So these five pages and their referrers **must ship in the same deploy**. If the
`compliance/dpdp` work lands partially — which the repeated promotion failures
make a live possibility — the result is a privacy policy linking to 404s and a
sitemap advertising them to crawlers.

`TeamSection.tsx:94` is the sharpest instance: it **constructs invitation URLs
at `/invite` from `window.location.origin`**. An invite link is sent to a
recipient and clicked later, often on another device. If `/invite` is absent
from the deployed build while the settings UI that generates the links is
present, **every invitation issued in that window resolves to a 404**, and the
links are already out in people's inboxes by the time anyone notices.

This could not be confirmed against live production because `/settings/team` is
auth-gated; it is stated as a deploy-ordering risk, not an observed production
break.

## Recommended gate

Deploy verification for this branch should assert, against the deployed origin,
that every route referenced by `sitemap.ts` and by any `new URL(...)` link
constructor returns 200 — not merely that the build succeeded. The existing
promotion failures mean build success is already known not to imply a serving
deployment.
