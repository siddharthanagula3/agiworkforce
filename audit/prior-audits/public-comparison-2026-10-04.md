# AGI Workforce Public Comparison, 2026-10-04

Status: Current
Owner: Founder + web lead
Last updated: 2026-10-03

An external comparison of eight public routes of AGI, ChatGPT and Claude,
dated 4 October 2026, 00:35 to 00:45 UTC, signed out, in a cloud browser at 1180
by 757 CSS pixels. It is a focused pass, not an exhaustive audit. Competitor
claims in it are observations of those pages on that day, not verified facts. In
its CSV the route refs `L01` to `L08` are the report's own route ids, not
remediation lanes of this repository.

This file registers 8 rows (`PC01` to `PC08`, the report's `R01` to `R08`): 1 P1,
5 P2, 1 P3 and 1 conditional. The report's text for each is kept as evidence in
`audit/prior-audits/evidence/2026-10-04-public-comparison/recommended-changes.json`;
the screenshots are not in git.

Each row was mapped to the code on branch `fix/public-site-audit-2026-10-03`,
which equals production commit `74bece5d10` for the files concerned, with two
exceptions: `apps/web/lib/surface-status.ts` (helpers added on the branch; the
registry values are unchanged) and `apps/web/app/connectors/mcp-directory/page.tsx`
(icon component only). The "State" column says how each row reproduced: 7 rows
were checked by a second reviewer, `PC06` and `PC08` reproduce only partly, and
`PC03` reproduces fully but was not second-reviewed.

This file is the single owner of the rows below. A row is deleted in the commit
that closes it, and the file is deleted when nothing in it is open. The aggregate
register row is `WEB-PUBLIC-COMPARISON-2026-10-04` in
`audit/registers/known-flaws.md`. Owner decisions the rows need are in
`audit/decisions/founder-decisions.md`.

## What the audit does not prove

It is a signed-out, eight-route pass. It did not sign in, read the repository or
test any lesson, search or install flow beyond what the report records. What
ChatGPT and Claude show is what the cloud browser saw on 4 October 2026;
anything about their signed-in or plan-specific behaviour is unknown here. The
dated competitor evidence the fixes rely on belongs in `docs/research/` and is
recorded with the pricing package, not in this folder.

## Open findings

The work-package column carries the labels of the remediation plan's packages
(`L18.1` is package 1 of lane 18) so a commit can cite them. The plan is a
working document of the fix branch and is not kept in this repository; the
"Start at" path is the durable anchor for each row. Lane 18 is public discovery
follow-ups. A label marked "(amended)" is a package of another lane (3, 11 or 12
of `audit/prior-audits/public-website-audit-2026-10-03.md`) that this row
changes; `L03.4` is that lane's own package.

| ID   | Priority    | Finding                                                                                             | Routes                                                         | State at 74bece5d10         | Start at                                                                     | Work packages                                                                                   |
| ---- | ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PC01 | P1          | Resolve release availability wording on /use-cases, /features/plugins and /connectors/mcp-directory | `/use-cases`, `/features/plugins`, `/connectors/mcp-directory` | Reproduces, verified        | `apps/web/lib/surface-status.ts`                                             | L18.1, L18.2, L18.4, L11.4 (amended), L11.9 (amended), L11.10 (amended), L12.7 (amended), L03.4 |
| PC02 | P2          | Publish an accurate public Study entry                                                              | Public learning journey (no route)                             | Reproduces, verified        | `apps/web/features/study/lib/study-session.ts`                               | L18.6, L18.7, L18.8                                                                             |
| PC03 | P2          | Keep MCP directory search results in view after submitting; bring search above the fold             | `/connectors/mcp-directory`                                    | Reproduces                  | `apps/web/app/connectors/mcp-directory/page.tsx`                             | L11.4 (amended), L11.13 (amended)                                                               |
| PC04 | P2          | Provide a public connector inspection step from a directory card                                    | `/connectors/mcp-directory`, one sampled card                  | Reproduces, verified        | `apps/web/app/connectors/mcp-directory/page.tsx`                             | L18.5, L11.13 (amended)                                                                         |
| PC05 | P2          | Add a readable practical plugin example and put availability next to the action                     | `/features/plugins`                                            | Reproduces, verified        | `apps/web/app/features/plugins/page.tsx`                                     | L18.2, L18.3, L12.7 (amended)                                                                   |
| PC06 | P2          | Clarify public search, the first-60 display cap and the indexed catalog scope on the MCP directory  | `/connectors/mcp-directory`                                    | Partly reproduces, verified | `apps/web/app/connectors/mcp-directory/page.tsx`                             | L18.4, L11.4 (amended)                                                                          |
| PC07 | P3          | Use-case hub: lead with the work, show a readable result, add a learner card where supported        | `/use-cases`                                                   | Reproduces, verified        | `apps/web/app/use-cases/page.tsx`                                            | L18.9, L18.10                                                                                   |
| PC08 | Conditional | Evaluate an institutional education page                                                            | Education positioning (no route)                               | Partly reproduces, verified | `apps/web/features/marketing/components/pages/business/use-cases-content.ts` | L18.11                                                                                          |

### What each row asks for

These are the first readings of each row, kept for the defect they describe.
Where a decision in `audit/decisions/founder-decisions.md` sets a different
default for the fix, the decision wins.

- `PC01`: Three real defects. Use-case copy says "released CLI" while SURFACE_STATUS.cli is Coming soon. The plugin hero says "N of M packs are installable today" without naming a surface, counting CLI-published packs too. The MCP directory says "released CLI" and "sign in to search the whole directory", though search is public.
- `PC02`: Study exists and works signed-in (/chat/study, noindex) but no public page, nav, sitemap or feature-story entry mentions it. Add one /features/study page built from the Study constants, link it from /features, nav and sitemap, and pin its copy to the real labels with tests.
- `PC03`: The directory search is a plain GET form to a server page, so submitting reloads at the top and the results sit below a long hero. Fix: add a fragment target so submits and category links land on the results heading, and compact the hero (`L11.4`).
- `PC04`: Directory cards are inert list items: no link, no detail route. Add a public server-rendered detail page under /connectors/mcp-directory/[...id] fed by the existing snapshot record, make each card name a link to it, and label every missing field instead of guessing.
- `PC05`: /features/plugins opens with trust risk and a CLI transcript, with no task example, and its hero availability sentence (a count that mixes web-installable and CLI-only packs) conflicts with the closing 'CLI downloads coming soon'. Add one outcome-led example and label each availability by surface.
- `PC06`: Public search works (server-side over the whole snapshot), but the cap note says "Sign in to search and filter the whole directory", which is false. The 60 cap shows only at the bottom, the count is not labelled as capped, cards have no detail or next step, and a search resets to the hero.
- `PC07`: Hub opens with a description of its own structure, previews are app chrome, and no learner card or public Study page exists. The CLI "released" wording contradicts the registry's Coming soon. Fix: rewrite hero, add outcome lines, and either add a Study page or defer; CLI wording is `L03.4`.
- `PC08`: Not a defect: AGI has no education page, by design (4 audiences only). Whether to sell to institutions is an owner product call. Recommended default is to add nothing now; if wanted, add an 'education' entry to the existing use-case registry after the signed-in Study session has been verified.

## Rows that already exist elsewhere

| Finding | Existing item                                                     | Relation                                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PC01`  | `MA01` in `audit/prior-audits/public-website-audit-2026-10-03.md` | Same defect family (release availability wording); `L03.4` carries part of it, and so does `L11.4`, a package of the first audit's plan (lane 11, MCP directory page) that closes no register row |
| `PC03`  | `L11.4`                                                           | Carried by that plan package, which is not a register row                                                                                                                                         |
| `PC06`  | `L11.4`                                                           | Carried by that plan package, which is not a register row                                                                                                                                         |

## Acceptance still open after the code fix

The code packages close the wording, layout and guard parts of these rows. Each
of the two also needs an owner step that code cannot take. The rule: **such a
row is narrowed, not deleted, until that step is done.**

| Row    | What the code fix leaves open                                   | The one step that closes it                                                                                                                             | Who   | Recorded in                                               |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `PC02` | The public Study page and its links are not built               | Under `L18-D3`, a public Study page is built only after a signed-in Preview session of Study has passed and the owner approves the eligibility sentence | Owner | Item 39 in `audit/decisions/founder-decisions.md`         |
| `PC08` | Whether to sell to institutions is a product call, not a defect | `L18-D4`: declined by default; the owner may overrule                                                                                                   | Owner | Grouped item 41 in `audit/decisions/founder-decisions.md` |
