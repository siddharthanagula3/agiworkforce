# Prior-Art Reconciliation — what this audit must add

Captured 2026-08-15 by the audit lead, before Phase 2 scoping.

This repository is **not** un-audited. Four substantial prior artefacts exist,
and this audit is only worth running if it targets what they miss and verifies
what they claim. Per `CLAUDE.md`: _"Do not treat generated audit/report markdown
as remediation. Audit files are triage queues."_

## Existing artefacts

| Artefact                                       | Size                   | Nature                                                                                          |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `audit/ui-gaps.csv` + `audit/ui-gaps.md`       | 341 rows / 7,898 lines | Screenshot-diff UI gap tracker, cites the same `*_reference/` screenshot corpus this audit uses |
| `audit/capability-gaps.csv` + `.md`            | 52 rows                | Runtime/enterprise capability intake with explicit defer/decline decisions                      |
| `docs/current/gap-audit-2026-08-08.md`         | 1,341 lines            | Release-engineering / CI / security gap audit (10 P0s, 11 P1s, 6 P2s)                           |
| `docs/current/parity-implementation-matrix.md` | 649 lines              | Feature × surface parity matrix with Present/Partial/Missing/Gated labels                       |

## Coverage of `audit/ui-gaps.csv` (341 rows)

**Status:** 197 Open · 73 Not Planned · 71 Done
**Severity:** 11 P0 · 126 P1 · 161 P2 · 43 P3

**By AGI surface:**

| Surface                | Rows  | Open | Done | Not Planned |
| ---------------------- | ----- | ---- | ---- | ----------- |
| desktop                | 142   | 69   | 30   | 43          |
| mobile                 | 114   | 77   | 23   | 14          |
| web                    | 43    | 28   | 7    | 8           |
| extension-vscode       | 37    | 20   | 11   | 6           |
| **extension (Chrome)** | **5** | 3    | 0    | 2           |

**By gap type:** missing-control 146 · missing-screen 63 · missing-ia 49 ·
missing-copy 26 · missing-state 26 · missing-interaction 21 · visual-polish 8 ·
missing-feature 2.

**By reference product:** Codex 139 · ChatGPT 112 · Claude 88.

## The structural blind spots

The existing tracker is **screenshot-diff derived**. Its gap-type vocabulary is
entirely `missing-{control,screen,ia,copy,state,interaction,feature}` plus
`visual-polish`. That shape determines what it can and cannot see:

1. **The Web surface is under-audited by an order of magnitude.** 43 rows for an
   app with 156 `page.tsx` files and 218 API routes. Desktop has 142 rows for a
   smaller surface.
2. **The Chrome extension is effectively un-TRACKED** — 5 rows total, 3 open.

   > **Follow-up, after auditing it (2026-08-15):** un-tracked turned out **not**
   > to mean un-built. `inventory/extension-chrome.md` found a ~35,000-line
   > hand-built MV3 application with CDP-based browser automation, a
   > **code-enforced, fail-closed** Managed-Cloud provenance gate
   > (`conversation-history.ts:1465-1468`, absent runtime ⇒ never synced), an
   > HMAC native-messaging handshake, a message-policy matrix with a coverage
   > test, 1,549/1,549 passing tests, and zero `TODO`/`FIXME`/"coming soon"
   > strings in `src/`. It is one of the stronger surfaces in the repository.
   > The low row count reflected audit attention, not product maturity — a
   > useful reminder that absence of tracking is not evidence of absence of
   > work.

3. **No backend or runtime gaps are representable.** There is no gap type for
   conversation runtime, agent runtime, tool runtime, model runtime, persistence,
   sync, or security. Section 24 of the audit brief is uncovered.
4. **No cross-surface consistency matrix.** "desktop" is one undifferentiated
   surface, so the Tauri/Electron split — two shells in one directory — is
   invisible to it.
5. **No shared-architecture or duplication analysis.** Drifted parallel
   implementations cannot appear as a "missing control".
6. **No dead/disconnected-code category.** Nothing mocked, orphaned, unreachable,
   or half-wired can be filed.
7. **No end-to-end workflow tracing.** Rows are screen-scoped, not
   `UI → state → API → runtime → provider → persistence → UI` scoped.
8. **Design-system coherence is 8 rows.** Typography, spacing, token adherence,
   light/dark, a11y, and "AI-generated-looking UI" are essentially untouched.

## The verification debt

**71 rows are marked `Done`** with long prose evidence blocks. None of those
claims has been independently re-verified against current code by this audit.
The repository's own rules say a passing typecheck or an existing component is
not proof. Re-verifying the `Done` set — especially the 30 desktop and 23 mobile
rows — is among the highest-value work available, because a false `Done` is
worse than an open gap: it removes the item from the queue.

## Resulting scope for this audit

This audit therefore prioritises, in order:

1. **Web frontend + Web backend** (the under-audited majority of the product).
2. **Backend / runtime / architecture gaps** (uncovered category).
3. **Chrome extension** (near-zero prior coverage).
4. **Tauri vs Electron separation** (collapsed into one label by prior art).
5. **Dead, mocked, duplicated and disconnected code** (uncovered category).
6. **Cross-surface parity + shared-architecture drift** (uncovered category).
7. **Verification of a sample of the 71 `Done` rows** (verification debt).
8. **Design system and end-to-end workflow tracing** (thinly covered).

It deliberately does **not** re-derive the 197 open screenshot-diff UI rows for
desktop/mobile/VS Code. Those are cited and carried forward rather than
duplicated with new IDs.
