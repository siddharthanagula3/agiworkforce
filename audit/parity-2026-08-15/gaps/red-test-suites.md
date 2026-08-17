# Red test suites found during this audit

Two test suites cited as evidence elsewhere in this repository are **currently
failing**. Both were found incidentally — the audit did not set out to run tests
— and both were confirmed by execution, not inference.

This matters beyond ordinary CI hygiene: a red suite silently voids every claim
that cites it. The repository's own rule is that build success is not evidence
of completion; the corollary is that a test cited as proof must actually run.

---

## 1. `apps/extension-vscode` — 17 failing tests, concentrated on the trust boundary

```
$ cd apps/extension-vscode && pnpm test
 Test Files  5 failed | 71 passed (76)
      Tests  17 failed | 845 passed (862)
```

**The distribution is the finding.** 13 of the 17 failures are on the
Local/BYOK/Managed-Cloud trust boundary — the repository's stated
non-negotiable:

| File                              | Failures | What they assert                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `usageMeterTrustBoundary.test.ts` |        6 | The SIX-02 trust boundary: a workspace-discovered local model reports as Local **without any account lookup**; the boundary re-pushes when the model changes or the composer dispatches a cloud model directly; a prefix-recognised local model is treated as Local even before CLI discovery runs                                                                 |
| `chatParticipant.test.ts`         |        6 | Local-model **authority**: threads start only with a CLI-discovered local model; a thread whose local provider differs from discovery authority is **rejected**; no thread starts or resumes when the configured local model is absent from discovery or when discovery fails; custom instructions and user-curated memory stay in **distinct context boundaries** |
| `usageMeter.test.ts`              |        1 | Local models are treated as unbounded **without fetching cloud usage**                                                                                                                                                                                                                                                                                             |
| `webviewContent.snapshot.test.ts` |        3 | Rendered webview structural snapshots (3 variants)                                                                                                                                                                                                                                                                                                                 |
| `panelPaletteConsistency.test.ts` |        1 | The panel states its colour policy truthfully in its own header                                                                                                                                                                                                                                                                                                    |

Read the assertions in the first three rows together and the risk is plain.
These are precisely the tests that would catch a **local model silently
reaching for cloud usage data**, a **thread starting against an unverified
local provider**, or **memory leaking across a context boundary** — the exact
failure modes `AGENTS.md` declares non-negotiable:

> _Local, BYOK, and Managed Cloud are separate trust boundaries._
> _Never silently route Local chats, files, or developer sessions to BYOK or managed cloud._

The safety net for the most safety-critical behaviour on this surface is
currently not running. Nothing here says the _product_ behaviour is broken —
the inventory found the VS Code surface's boundary handling sound at source
level — but it does mean **no automated check is presently defending it**.

The remaining 4 failures (snapshot + palette) look like ordinary drift after a
UI change and are low-severity.

---

## 2. `apps/desktop` — `DesktopShellV3.test.tsx`, 29/29 failing

```
$ pnpm --filter @agiworkforce/desktop test DesktopShellV3.test.tsx
 Test Files  1 failed (1)
      Tests  29 failed (29)
TypeError: state.getSelectedModel is not a function
  ❯ useChatModelStore src/features/v3/__tests__/DesktopShellV3.test.tsx:154:5
  ❯ DesktopShellV3 src/features/v3/DesktopShellV3.tsx:259:25
```

A stale mock of `useChatModelStore` omits `getSelectedModel`, so every test in
the file dies at render. The 29 tests cover desktop-shell tier gating, folder
scoping, and tool confirmation.

This suite is **cited as completion evidence by `GAP-064`** in
`audit/ui-gaps.csv`, and by implication by other rows referencing the same file.
See `done-claim-verification.md` — GAP-064 was downgraded to `PARTIALLY_DONE`
specifically because of it.

---

## Why these belong in Phase 0

Both are small, self-contained fixes (a mock missing one method; snapshot and
mock drift). Neither requires product decisions. But until they are green:

- Ledger rows citing them are unverifiable, so the tracker's accuracy degrades
  silently over time.
- The trust-boundary regressions they exist to catch would ship unnoticed.
- Any later claim of "tests pass" for these surfaces is false.

`PriorityExecutionPlan.md` §4.2 schedules the desktop fix. **The VS Code suite
was found after that document was written and should be added there** — its
13 trust-boundary failures make it the higher-priority of the two.

## Method note

Neither suite was discovered by a test-focused pass. The desktop one surfaced
when a verification agent ran the suite a ledger row cited rather than reading
it; the VS Code one surfaced when the completeness critic checked the confidence
basis for VS Code claims. **A dedicated "is CI actually green, per package"
sweep is cheap and was not performed by this audit** — it is a recommended next
step, since two red suites found by accident implies others may exist.
